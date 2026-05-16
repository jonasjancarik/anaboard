import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { LinearTransition } from 'react-native-reanimated';

import { speechEngine, buildSpeechSegments } from '../../speech/speechEngine';
import { BoardTile } from '../components/BoardTile';
import { PhraseBar, type PhraseBarItem } from '../components/PhraseBar';
import { buildPhrasePredictions } from '../utils/phraseSuggestions';
import {
  GRID_COLUMNS,
  GRID_GAP,
  GRID_ROWS,
  LAYOUT_PADDING,
  MAX_GRID_WIDTH,
  MAX_TILE_SIZE,
  MIN_TILE_SIZE,
  styles,
} from './BoardScreen.styles';
import {
  BOARD_SPREAD_GAP,
  getLogicalPageWidth,
  getPageIndexForContentX,
  getPageLeft,
  getSpreadCount,
  getSpreadIndexForPage,
  getSpreadOffset,
  normalizeBoardPageIndex,
  WIDE_BOARD_BREAKPOINT,
} from './boardPagerLayout';
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_ORDER,
} from '../../../shared/constants/defaults';
import { getAppCopy } from '../../../shared/i18n/appCopy';
import { normalizeSupportedLocale } from '../../../shared/i18n/profileLanguage';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { TileVisual } from '../../../shared/components/TileVisual';
import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';
import type { PhraseSource, PhraseTokenSnapshot, SentenceToken, Tile } from '../../../shared/types/domain';
import { createId } from '../../../shared/utils/id';
import { useAppStore, selectTilesById } from '../../../store/useAppStore';
import {
  getBoardPagesForLayout,
  getTilesForBoardLayout,
  type OrderedBoardPage,
} from '../utils/boardOrdering';

type BoardScreenProps = {
  onOpenCaregiver: () => Promise<boolean>;
  onOpenSettings: () => void;
};

type BoardDragState = {
  tileId: string;
  startIndex: number;
  startLeft: number;
  startTop: number;
  startViewportLeft: number;
  startPageX: number;
  startPageY: number;
  dx: number;
  dy: number;
};

type PendingReorderTouch = {
  tileId: string;
  startIndex: number;
  startPageX: number;
  startPageY: number;
};

type RecentTileTap = {
  tileId: string;
  tokenId: string;
  atMs: number;
  compositionTimer: ReturnType<typeof setTimeout> | null;
};

type PagerScrollEvent = {
  nativeEvent: {
    contentOffset: {
      x: number;
    };
  };
};

const REORDER_LONG_PRESS_MS = 180;
const PAGE_SWITCH_EDGE_THRESHOLD = 44;
const TILE_TAP_UNDO_WINDOW_MS = 550;
const VISIBLE_SPREAD_WINDOW_RADIUS = 1;
const REORDER_LAYOUT_TRANSITION = LinearTransition.duration(140);
const CATEGORY_PAGE_HEADER_HEIGHT = 34;
const ACTION_TEXT_PROPS = {
  allowFontScaling: false,
  numberOfLines: 1 as const,
};
const FITTED_TILE_LABEL_PROPS = {
  allowFontScaling: false,
  numberOfLines: 2 as const,
};

const moveIdInArray = (ids: string[], fromIndex: number, toIndex: number): string[] => {
  if (fromIndex === toIndex) {
    return ids;
  }

  const next = [...ids];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) {
    return ids;
  }

  next.splice(toIndex, 0, moved);
  return next;
};

const toPhraseTokenSnapshot = (
  token: Tile | SentenceToken | PhraseTokenSnapshot
): PhraseTokenSnapshot => {
  if ('id' in token) {
    return {
      tileId: token.id,
      label: token.labelCs,
      emoji: token.emoji,
      visualType: token.visualType,
      imageLocalUri: token.imageLocalUri,
      imageRemotePath: token.imageRemotePath,
    };
  }

  return {
    tileId: token.tileId,
    label: token.label,
    emoji: token.emoji,
    visualType: token.visualType,
    imageLocalUri: token.imageLocalUri,
    imageRemotePath: token.imageRemotePath,
  };
};

const resolvePhraseTokens = (
  tokens: PhraseTokenSnapshot[],
  tilesById: Record<string, Tile>
): PhraseTokenSnapshot[] => {
  return tokens.map((token) => {
    const tile = tilesById[token.tileId];
    return tile ? toPhraseTokenSnapshot(tile) : token;
  });
};

export const BoardScreen = ({ onOpenCaregiver, onOpenSettings }: BoardScreenProps) => {
  const boardPagerRef = useRef<ScrollView>(null);
  const boardViewportRef = useRef<View>(null);
  const sentenceScrollRef = useRef<ScrollView>(null);
  const flashNewTileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pagerScrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnimatedPageRef = useRef<number | null>(null);
  const suppressTapAfterLongPressRef = useRef(false);
  const recentTileTapRef = useRef<RecentTileTap | null>(null);
  const pendingCompositionTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const dragStateRef = useRef<BoardDragState | null>(null);
  const reorderTileIdsRef = useRef<string[]>([]);
  const pendingReorderTouchRef = useRef<PendingReorderTouch | null>(null);
  const reorderLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardViewportLeftRef = useRef(0);
  const lastAppliedSpreadWidthRef = useRef(0);
  const pageSwitchArmedRef = useRef(true);
  const wiggleValue = useRef(new Animated.Value(0)).current;
  const newTileFlashValue = useRef(new Animated.Value(0)).current;
  const dragOverlayTranslateX = useRef(new Animated.Value(0)).current;
  const dragOverlayTranslateY = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomBarBottomPadding = Math.max(8, Math.min(insets.bottom, 16));

  const board = useAppStore((state) => state.board);
  const tiles = useAppStore((state) => state.tiles);
  const sentence = useAppStore((state) => state.sentence);
  const savedPhrases = useAppStore((state) => state.savedPhrases);
  const recentPhrases = useAppStore((state) => state.recentPhrases);
  const suggestionPhrases = useAppStore((state) => state.suggestionPhrases);
  const clipsById = useAppStore((state) => state.clipsById);
  const settings = useAppStore((state) => state.settings);
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);
  const boardPageIndex = useAppStore((state) => state.boardPageIndex);
  const pendingCaregiverAction = useAppStore((state) => state.pendingCaregiverAction);
  const addTileToSentence = useAppStore((state) => state.addTileToSentence);
  const appendPhraseTokens = useAppStore((state) => state.appendPhraseTokens);
  const replaceSentenceWithTokens = useAppStore((state) => state.replaceSentenceWithTokens);
  const removeSentenceToken = useAppStore((state) => state.removeSentenceToken);
  const clearSentence = useAppStore((state) => state.clearSentence);
  const setSpeaking = useAppStore((state) => state.setSpeaking);
  const saveCurrentSentenceAsPhrase = useAppStore((state) => state.saveCurrentSentenceAsPhrase);
  const deleteSavedPhrase = useAppStore((state) => state.deleteSavedPhrase);
  const recordPhraseComposition = useAppStore((state) => state.recordPhraseComposition);
  const recordPhrasePlayback = useAppStore((state) => state.recordPhrasePlayback);
  const createTileAfter = useAppStore((state) => state.createTileAfter);
  const moveTile = useAppStore((state) => state.moveTile);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);
  const setBoardPageIndex = useAppStore((state) => state.setBoardPageIndex);
  const setPendingCaregiverAction = useAppStore((state) => state.setPendingCaregiverAction);
  const clearPendingCaregiverAction = useAppStore((state) => state.clearPendingCaregiverAction);
  const lockCaregiver = useAppStore((state) => state.lockCaregiver);
  const navigate = useAppStore((state) => state.navigate);

  const showLabels = settings?.showLabels ?? false;
  const locale = normalizeSupportedLocale(board?.locale);
  const copy = getAppCopy(locale);
  const phraseBarEnabled = settings?.phraseBarEnabled ?? true;
  const suggestionCount = settings?.suggestionCount ?? 3;
  const boardLayoutMode = settings?.boardLayoutMode ?? 'manual';
  const categoryOrder = settings?.categoryOrder ?? DEFAULT_CATEGORY_ORDER;
  const categoriesStartNewPage = settings?.categoriesStartNewPage ?? true;
  const showCategoryPageHeaders =
    boardLayoutMode === 'category' && categoriesStartNewPage;
  const canReorderTiles = caregiverUnlocked && boardLayoutMode === 'manual';
  const gridColumns = board?.columns ?? GRID_COLUMNS;
  const gridRows = board?.rows ?? GRID_ROWS;
  const pageSize = gridColumns * gridRows;
  const [tileDragError, setTileDragError] = useState<string | null>(null);
  const [reorderTileIds, setReorderTileIds] = useState<string[]>([]);
  const [activeDrag, setActiveDrag] = useState<BoardDragState | null>(null);
  const [wiggleActive, setWiggleActive] = useState(false);
  const [isAddingTile, setIsAddingTile] = useState(false);
  const [flashTileId, setFlashTileId] = useState<string | null>(null);
  const [boardViewportWidth, setBoardViewportWidth] = useState(0);
  const [boardViewportHeight, setBoardViewportHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(boardPageIndex);
  const [phraseFeedback, setPhraseFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const currentPageRef = useRef(0);

  const tilesById = useMemo(() => selectTilesById(tiles), [tiles]);
  const phrasePredictions = useMemo(() => {
    return buildPhrasePredictions({
      sentence,
      savedPhrases,
      recentPhrases: suggestionPhrases,
      tilesById,
      limit: suggestionCount,
    });
  }, [savedPhrases, sentence, suggestionCount, suggestionPhrases, tilesById]);
  const idlePhraseItems = useMemo<PhraseBarItem[]>(() => {
    const items: PhraseBarItem[] = [];
    const seenPhraseKeys = new Set<string>();

    for (const phrase of savedPhrases) {
      if (phrase.tokens.length === 0 || seenPhraseKeys.has(phrase.phraseKey)) {
        continue;
      }

      seenPhraseKeys.add(phrase.phraseKey);
      items.push({
        id: `saved:${phrase.id}`,
        kind: 'saved',
        label: phrase.spokenText,
        tokens: resolvePhraseTokens(phrase.tokens, tilesById),
      });
    }

    for (const phrase of recentPhrases) {
      const phraseKey = phrase.tokens.map((token) => token.tileId).join('|');
      if (phrase.tokens.length === 0 || seenPhraseKeys.has(phraseKey)) {
        continue;
      }

      seenPhraseKeys.add(phraseKey);
      items.push({
        id: `recent:${phrase.id}`,
        kind: 'recent',
        label: phrase.spokenText,
        tokens: resolvePhraseTokens(phrase.tokens, tilesById),
      });
    }

    return items.slice(0, 8);
  }, [recentPhrases, savedPhrases, tilesById]);
  const phraseBarItems = useMemo<PhraseBarItem[]>(() => {
    if (sentence.length === 0) {
      return idlePhraseItems;
    }

    return phrasePredictions.map((prediction) => ({
      id: `prediction:${prediction.id}`,
      kind: 'prediction',
      label: prediction.token.label,
      tokens: [prediction.token],
    }));
  }, [idlePhraseItems, phrasePredictions, sentence.length]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const spreadWidth = boardViewportWidth > 0 ? boardViewportWidth : width;
  const isSpreadMode = spreadWidth >= WIDE_BOARD_BREAKPOINT;
  const visiblePagesPerSpread = isSpreadMode ? 2 : 1;
  const spreadGap = isSpreadMode ? BOARD_SPREAD_GAP : 0;
  const logicalPageWidth = getLogicalPageWidth(
    spreadWidth,
    visiblePagesPerSpread,
    spreadGap
  );
  const availableGridWidth = Math.min(
    Math.max(0, logicalPageWidth - LAYOUT_PADDING * 2),
    MAX_GRID_WIDTH
  );
  const tileSize = useMemo(() => {
    const widthBound = (availableGridWidth - GRID_GAP * (gridColumns - 1)) / gridColumns;
    const availableGridHeight =
      boardViewportHeight > 0
        ? Math.max(0, boardViewportHeight - (showCategoryPageHeaders ? CATEGORY_PAGE_HEADER_HEIGHT : 0))
        : 0;
    const heightBound =
      availableGridHeight > 0
        ? (availableGridHeight - GRID_GAP * (gridRows - 1)) / gridRows
        : widthBound;
    const rawTileSize = Math.min(widthBound, heightBound);

    return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, Math.floor(rawTileSize)));
  }, [availableGridWidth, boardViewportHeight, gridColumns, gridRows, showCategoryPageHeaders]);

  const tileStep = tileSize + GRID_GAP;
  const pageGridWidth = tileSize * gridColumns + GRID_GAP * (gridColumns - 1);
  const pageGridHeight = tileSize * gridRows + GRID_GAP * (gridRows - 1);
  const effectivePageHeight = boardViewportHeight > 0 ? boardViewportHeight : pageGridHeight;
  const horizontalGridOffset = Math.max(
    LAYOUT_PADDING,
    (logicalPageWidth - pageGridWidth) / 2
  );
  const verticalGridOffset = Math.max(0, (effectivePageHeight - pageGridHeight) / 2);
  const tileVisualSize = showLabels
    ? Math.max(42, Math.min(tileSize - 26, 60))
    : Math.max(48, Math.min(tileSize - 18, 70));
  const tokenVisualSize = showLabels ? 24 : 26;

  useEffect(() => {
    reorderTileIdsRef.current = reorderTileIds;
  }, [reorderTileIds]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;

    if (!canReorderTiles || !wiggleActive) {
      wiggleValue.stopAnimation();
      wiggleValue.setValue(0);
      return;
    }

    animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggleValue, {
          toValue: 1,
          duration: 120,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wiggleValue, {
          toValue: -1,
          duration: 220,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(wiggleValue, {
          toValue: 0,
          duration: 120,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(260),
      ])
    );

    animation.start();

    return () => {
      animation?.stop();
      wiggleValue.stopAnimation();
      wiggleValue.setValue(0);
    };
  }, [canReorderTiles, wiggleActive, wiggleValue]);

  useEffect(() => {
    if (!canReorderTiles) {
      if (reorderLongPressTimerRef.current) {
        clearTimeout(reorderLongPressTimerRef.current);
        reorderLongPressTimerRef.current = null;
      }
      pendingReorderTouchRef.current = null;
      dragStateRef.current = null;
      setActiveDrag(null);
      setReorderTileIds([]);
      setWiggleActive(false);
    }
  }, [canReorderTiles]);

  useEffect(() => {
    if (!canReorderTiles || dragStateRef.current) {
      return;
    }

    const nextIds = tiles.map((tile) => tile.id);
    reorderTileIdsRef.current = nextIds;
    setReorderTileIds(nextIds);
  }, [canReorderTiles, tiles]);

  const orderedTiles = useMemo(() => {
    if (!canReorderTiles) {
      return getTilesForBoardLayout(tiles, boardLayoutMode, categoryOrder, locale);
    }

    const nextOrderedTiles = reorderTileIds
      .map((id) => tilesById[id])
      .filter((tile): tile is Tile => Boolean(tile));

    if (nextOrderedTiles.length === tiles.length) {
      return nextOrderedTiles;
    }

    const orderedTileIds = new Set(nextOrderedTiles.map((tile) => tile.id));
    return [
      ...nextOrderedTiles,
      ...tiles.filter((tile) => !orderedTileIds.has(tile.id)),
    ];
  }, [boardLayoutMode, canReorderTiles, categoryOrder, locale, reorderTileIds, tiles, tilesById]);

  const logicalPages = useMemo<OrderedBoardPage[]>(() => {
    return getBoardPagesForLayout(
      orderedTiles,
      boardLayoutMode,
      categoryOrder,
      pageSize,
      categoriesStartNewPage
    );
  }, [boardLayoutMode, categoriesStartNewPage, categoryOrder, orderedTiles, pageSize]);
  const pageCount = logicalPages.length;
  const spreadCount = getSpreadCount(pageCount, visiblePagesPerSpread);
  const pagedSpreads = useMemo(() => {
    const spreads: Array<Array<OrderedBoardPage | null>> = [];

    for (let spreadIndex = 0; spreadIndex < spreadCount; spreadIndex += 1) {
      const startPageIndex = spreadIndex * visiblePagesPerSpread;
      const spreadPages = Array.from({ length: visiblePagesPerSpread }, (_, pageOffset) => {
        return logicalPages[startPageIndex + pageOffset] ?? null;
      });

      spreads.push(spreadPages);
    }

    return spreads;
  }, [logicalPages, spreadCount, visiblePagesPerSpread]);

  const currentSpreadIndex = getSpreadIndexForPage(currentPage, visiblePagesPerSpread);
  const draggedTile = activeDrag ? tilesById[activeDrag.tileId] : undefined;

  const normalizeVisiblePageIndex = useCallback(
    (nextPage: number) =>
      normalizeBoardPageIndex(nextPage, pageCount, visiblePagesPerSpread),
    [pageCount, visiblePagesPerSpread]
  );

  const setVisiblePage = useCallback(
    (nextPage: number) => {
      const clampedPage = normalizeVisiblePageIndex(nextPage);
      if (clampedPage !== currentPageRef.current) {
        currentPageRef.current = clampedPage;
        setCurrentPage((page) => (page === clampedPage ? page : clampedPage));
      }

      return clampedPage;
    },
    [normalizeVisiblePageIndex]
  );

  const commitVisiblePage = useCallback(
    (nextPage: number) => {
      const clampedPage = setVisiblePage(nextPage);
      setBoardPageIndex(clampedPage);
      return clampedPage;
    },
    [setBoardPageIndex, setVisiblePage]
  );

  const scrollToPage = useCallback(
    (nextPage: number, animated: boolean) => {
      if (pagerScrollIdleTimerRef.current) {
        clearTimeout(pagerScrollIdleTimerRef.current);
        pagerScrollIdleTimerRef.current = null;
      }

      const clampedPage = commitVisiblePage(nextPage);
      const spreadIndex = getSpreadIndexForPage(clampedPage, visiblePagesPerSpread);

      if (spreadWidth <= 0) {
        return;
      }

      boardPagerRef.current?.scrollTo({
        x: getSpreadOffset(spreadIndex, spreadWidth),
        animated,
      });
    },
    [commitVisiblePage, spreadWidth, visiblePagesPerSpread]
  );

  useEffect(() => {
    const nextPage = normalizeVisiblePageIndex(boardPageIndex);
    if (nextPage !== boardPageIndex) {
      setBoardPageIndex(nextPage);
    }

    const pageChanged = nextPage !== currentPageRef.current;
    const spreadWidthChanged =
      spreadWidth > 0 && Math.abs(lastAppliedSpreadWidthRef.current - spreadWidth) > 1;
    setVisiblePage(nextPage);

    if (spreadWidth > 0 && (pageChanged || spreadWidthChanged)) {
      const shouldAnimate = pendingAnimatedPageRef.current === nextPage;
      boardPagerRef.current?.scrollTo({
        x: getSpreadOffset(
          getSpreadIndexForPage(nextPage, visiblePagesPerSpread),
          spreadWidth
        ),
        animated: shouldAnimate,
      });
      if (shouldAnimate) {
        pendingAnimatedPageRef.current = null;
      }
    }

    lastAppliedSpreadWidthRef.current = spreadWidth;
  }, [
    boardPageIndex,
    normalizeVisiblePageIndex,
    setBoardPageIndex,
    setVisiblePage,
    spreadWidth,
    visiblePagesPerSpread,
  ]);

  useEffect(() => {
    if (pageCount === 0) {
      return;
    }

    const nextPage = normalizeVisiblePageIndex(currentPageRef.current);
    if (nextPage === currentPageRef.current) {
      return;
    }

    setVisiblePage(nextPage);
    setBoardPageIndex(nextPage);

    if (spreadWidth > 0) {
      boardPagerRef.current?.scrollTo({
        x: getSpreadOffset(
          getSpreadIndexForPage(nextPage, visiblePagesPerSpread),
          spreadWidth
        ),
        animated: false,
      });
    }
  }, [
    normalizeVisiblePageIndex,
    pageCount,
    setBoardPageIndex,
    setVisiblePage,
    spreadWidth,
    visiblePagesPerSpread,
  ]);

  const getSlotPosition = useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / pageSize);
      const localIndex = index % pageSize;
      const row = Math.floor(localIndex / gridColumns);
      const column = localIndex % gridColumns;

      return {
        left:
          getPageLeft(
            pageIndex,
            visiblePagesPerSpread,
            spreadWidth,
            logicalPageWidth,
            spreadGap
          ) +
          horizontalGridOffset +
          column * tileStep,
        top: verticalGridOffset + row * tileStep,
      };
    },
    [
      gridColumns,
      horizontalGridOffset,
      logicalPageWidth,
      pageSize,
      spreadGap,
      spreadWidth,
      tileStep,
      verticalGridOffset,
      visiblePagesPerSpread,
    ]
  );

  const getTargetIndexFromPosition = useCallback(
    (left: number, top: number, totalTiles: number) => {
      if (totalTiles <= 1) {
        return 0;
      }

      const tileCenterLeft = left + tileSize / 2;
      const pageIndex = getPageIndexForContentX(
        tileCenterLeft,
        pageCount,
        visiblePagesPerSpread,
        spreadWidth,
        logicalPageWidth,
        spreadGap
      );
      const normalizedLeft =
        left -
        getPageLeft(
          pageIndex,
          visiblePagesPerSpread,
          spreadWidth,
          logicalPageWidth,
          spreadGap
        ) -
        horizontalGridOffset;
      const normalizedTop = top - verticalGridOffset;
      const column = Math.max(0, Math.min(gridColumns - 1, Math.round(normalizedLeft / tileStep)));
      const row = Math.max(0, Math.min(gridRows - 1, Math.round(normalizedTop / tileStep)));
      const rawLocalIndex = row * gridColumns + column;
      const maxLocalIndex = Math.min(pageSize - 1, totalTiles - pageIndex * pageSize - 1);
      const localIndex = Math.max(0, Math.min(maxLocalIndex, rawLocalIndex));

      return Math.max(0, Math.min(totalTiles - 1, pageIndex * pageSize + localIndex));
    },
    [
      gridColumns,
      gridRows,
      horizontalGridOffset,
      logicalPageWidth,
      pageCount,
      pageSize,
      spreadGap,
      spreadWidth,
      tileSize,
      tileStep,
      verticalGridOffset,
      visiblePagesPerSpread,
    ]
  );

  const clearBoardDragState = useCallback(() => {
    pageSwitchArmedRef.current = true;
    dragStateRef.current = null;
    dragOverlayTranslateX.stopAnimation();
    dragOverlayTranslateY.stopAnimation();
    dragOverlayTranslateX.setValue(0);
    dragOverlayTranslateY.setValue(0);
    setActiveDrag(null);
  }, [dragOverlayTranslateX, dragOverlayTranslateY]);

  const clearAllPendingCompositionRecords = useCallback(() => {
    pendingCompositionTimersRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    pendingCompositionTimersRef.current.clear();
    recentTileTapRef.current = null;
  }, []);

  const clearRecentTileTap = useCallback((cancelPendingComposition: boolean) => {
    const recentTileTap = recentTileTapRef.current;
    if (cancelPendingComposition && recentTileTap?.compositionTimer) {
      clearTimeout(recentTileTap.compositionTimer);
      pendingCompositionTimersRef.current.delete(recentTileTap.compositionTimer);
    }

    recentTileTapRef.current = null;
  }, []);

  const schedulePhraseCompositionRecord = useCallback(
    (tokens: PhraseTokenSnapshot[]) => {
      if (tokens.length < 2) {
        return null;
      }

      const timer = setTimeout(() => {
        pendingCompositionTimersRef.current.delete(timer);
        void recordPhraseComposition(tokens).catch(() => {
          // Suggestions should still work even if composition history fails to persist.
        });
      }, TILE_TAP_UNDO_WINDOW_MS);

      pendingCompositionTimersRef.current.add(timer);
      return timer;
    },
    [recordPhraseComposition]
  );

  const playTokens = async (
    tokens: Array<SentenceToken | PhraseTokenSnapshot>,
    options?: {
      recordSource?: PhraseSource;
      savedPhraseId?: string;
    }
  ) => {
    if (tokens.length === 0 || !settings) {
      return;
    }

    const playbackTokens = tokens.map((token) =>
      'tokenId' in token
        ? token
        : {
            tokenId: createId('phrase-token'),
            tileId: token.tileId,
            label: token.label,
            emoji: token.emoji,
            visualType: token.visualType,
            imageLocalUri: token.imageLocalUri,
            imageRemotePath: token.imageRemotePath,
          }
    );

    const segments = await buildSpeechSegments({
      tokens: playbackTokens,
      tilesById,
      clipsById,
    });

    if (segments.length === 0) {
      return;
    }

    if (options?.recordSource) {
      try {
        await recordPhrasePlayback({
          tokens: playbackTokens,
          source: options.recordSource,
          savedPhraseId: options.savedPhraseId,
        });
      } catch {
        // Phrase playback should continue even if history persistence fails.
      }
    }

    speechEngine.setSettings({
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      preferredVoice: settings.preferredVoice,
      locale,
    });

    setSpeaking(true);
    try {
      await speechEngine.playSegments(segments);
    } finally {
      setSpeaking(false);
    }
  };

  const onTilePress = (tileId: string) => {
    if (suppressTapAfterLongPressRef.current) {
      suppressTapAfterLongPressRef.current = false;
      return;
    }

    setPhraseFeedback(null);

    if (caregiverUnlocked) {
      clearRecentTileTap(false);
      void appHaptics.tileTap();
      setEditorTargetTileId(tileId);
      navigate('editor');
      return;
    }

    const lastSentenceToken = sentence[sentence.length - 1];
    const recentTileTap = recentTileTapRef.current;
    const now = Date.now();
    const shouldUndoRecentTileTap =
      Boolean(lastSentenceToken) &&
      lastSentenceToken?.tileId === tileId &&
      recentTileTap?.tileId === tileId &&
      recentTileTap?.tokenId === lastSentenceToken?.tokenId &&
      now - recentTileTap.atMs <= TILE_TAP_UNDO_WINDOW_MS;

    if (lastSentenceToken && shouldUndoRecentTileTap) {
      clearRecentTileTap(true);
      void appHaptics.selection();
      removeSentenceToken(lastSentenceToken.tokenId);
      setSpeaking(false);
      void speechEngine.cancel().catch(() => {
        // Undo should still work even if speech does not stop cleanly.
      });
      return;
    }

    const tile = tilesById[tileId];
    if (!tile) {
      clearRecentTileTap(false);
      return;
    }

    void appHaptics.tileTap();
    const phraseToken = toPhraseTokenSnapshot(tile);
    const nextSentenceTokens = [...sentence, phraseToken].map((token) =>
      'tokenId' in token ? toPhraseTokenSnapshot(token) : token
    );

    addTileToSentence(tileId);
    const nextSentence = useAppStore.getState().sentence;
    const nextSentenceToken = nextSentence[nextSentence.length - 1];
    const compositionTimer = schedulePhraseCompositionRecord(nextSentenceTokens);
    recentTileTapRef.current =
      nextSentenceToken?.tileId === tileId
        ? {
            tileId,
            tokenId: nextSentenceToken.tokenId,
            atMs: now,
            compositionTimer,
          }
        : null;

    void playTokens([phraseToken]);
  };

  const onSpeakSentence = () => {
    void appHaptics.tap();
    setPhraseFeedback(null);
    void playTokens(sentence, {
      recordSource: 'manual',
    });
  };

  const onSavePhrase = useCallback(async () => {
    if (sentence.length === 0) {
      return;
    }

    if (!caregiverUnlocked) {
      setPendingCaregiverAction('savePhrase');
      const didStartUnlock = await onOpenCaregiver();
      if (!didStartUnlock) {
        clearPendingCaregiverAction();
      }
      return;
    }

    setPhraseFeedback(null);

    try {
      await saveCurrentSentenceAsPhrase();
      void appHaptics.success();
      setPhraseFeedback({
        kind: 'success',
        text: copy.board.phraseSaved,
      });
    } catch (error) {
      void appHaptics.error();
      setPhraseFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : copy.board.phraseSaveError,
      });
    }
  }, [
    caregiverUnlocked,
    onOpenCaregiver,
    saveCurrentSentenceAsPhrase,
    sentence.length,
    clearPendingCaregiverAction,
    copy,
    setPendingCaregiverAction,
  ]);

  useEffect(() => {
    if (pendingCaregiverAction !== 'savePhrase' || !caregiverUnlocked) {
      return;
    }

    clearPendingCaregiverAction();

    if (sentence.length === 0) {
      return;
    }

    void onSavePhrase();
  }, [
    caregiverUnlocked,
    clearPendingCaregiverAction,
    onSavePhrase,
    pendingCaregiverAction,
    sentence.length,
  ]);

  const onPhraseBarItemPress = useCallback(
    (item: PhraseBarItem) => {
      clearRecentTileTap(false);
      setPhraseFeedback(null);

      if (item.kind === 'prediction') {
        const nextToken = item.tokens[0];
        if (!nextToken) {
          return;
        }

        const nextSentenceTokens = [...sentence.map(toPhraseTokenSnapshot), nextToken];
        appendPhraseTokens([nextToken]);
        void recordPhraseComposition(nextSentenceTokens).catch(() => {
          // Suggestions should still work even if composition history fails to persist.
        });
        void playTokens([nextToken]);
        return;
      }

      const phrase =
        item.kind === 'saved'
          ? savedPhrases.find((candidate) => `saved:${candidate.id}` === item.id)
          : recentPhrases.find((candidate) => `recent:${candidate.id}` === item.id);

      if (!phrase) {
        return;
      }

      clearAllPendingCompositionRecords();
      replaceSentenceWithTokens(phrase.tokens);
      void playTokens(phrase.tokens, {
        recordSource: item.kind,
        savedPhraseId: item.kind === 'saved' ? phrase.id : undefined,
      });
    },
    [
      appendPhraseTokens,
      clearAllPendingCompositionRecords,
      clearRecentTileTap,
      playTokens,
      recentPhrases,
      recordPhraseComposition,
      sentence,
      replaceSentenceWithTokens,
      savedPhrases,
    ]
  );

  const onPhraseBarItemLongPress = useCallback(
    (item: PhraseBarItem) => {
      if (!caregiverUnlocked || item.kind !== 'saved') {
        return;
      }

      const phrase = savedPhrases.find((candidate) => `saved:${candidate.id}` === item.id);
      if (!phrase) {
        return;
      }

      Alert.alert(copy.board.deleteSavedPhraseTitle, phrase.spokenText, [
        {
          text: copy.board.keepSavedPhrase,
          style: 'cancel',
        },
        {
          text: copy.common.delete,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteSavedPhrase(phrase.id);
                void appHaptics.warning();
                setPhraseFeedback({
                  kind: 'success',
                  text: copy.board.savedPhraseDeleted,
                });
              } catch (error) {
                void appHaptics.error();
                setPhraseFeedback({
                  kind: 'error',
                  text:
                    error instanceof Error
                      ? error.message
                      : copy.board.savedPhraseDeleteError,
                });
              }
            })();
          },
        },
      ]);
    },
    [caregiverUnlocked, copy, deleteSavedPhrase, savedPhrases]
  );

  const onClearSentence = () => {
    clearAllPendingCompositionRecords();
    void appHaptics.tap();
    clearSentence();
    setPhraseFeedback(null);
    setSpeaking(false);
    void speechEngine.cancel().catch(() => {
      // Clear should still work even if the speech engine fails to stop cleanly.
    });
  };

  const moveDrag = useCallback(
    (pageX: number | null, dx: number, dy: number) => {
      const drag = dragStateRef.current;
      if (!drag) {
        return;
      }

      const nextDrag = { ...drag, dx, dy };
      dragStateRef.current = nextDrag;
      dragOverlayTranslateX.setValue(dx);
      dragOverlayTranslateY.setValue(dy);

      const viewportLeft = drag.startViewportLeft + dx;
      const localFingerX =
        pageX !== null ? pageX - boardViewportLeftRef.current : viewportLeft + tileSize / 2;
      let targetPage = currentPageRef.current;

      if (localFingerX >= spreadWidth - PAGE_SWITCH_EDGE_THRESHOLD) {
        if (pageSwitchArmedRef.current) {
          const nextPage = normalizeVisiblePageIndex(
            currentPageRef.current + visiblePagesPerSpread
          );
          if (nextPage !== currentPageRef.current) {
            targetPage = nextPage;
            pageSwitchArmedRef.current = false;
          }
        }
      } else if (localFingerX <= PAGE_SWITCH_EDGE_THRESHOLD) {
        if (pageSwitchArmedRef.current) {
          const nextPage = normalizeVisiblePageIndex(
            currentPageRef.current - visiblePagesPerSpread
          );
          if (nextPage !== currentPageRef.current) {
            targetPage = nextPage;
            pageSwitchArmedRef.current = false;
          }
        }
      } else {
        pageSwitchArmedRef.current = true;
      }

      if (targetPage !== currentPageRef.current) {
        void appHaptics.page();
        scrollToPage(targetPage, false);
      }

      setReorderTileIds((currentIds) => {
        const currentIndex = currentIds.indexOf(drag.tileId);
        if (currentIndex < 0) {
          return currentIds;
        }

        const contentLeft =
          getPageLeft(
            targetPage,
            visiblePagesPerSpread,
            spreadWidth,
            logicalPageWidth,
            spreadGap
          ) + viewportLeft;
        const targetIndex = getTargetIndexFromPosition(
          contentLeft,
          drag.startTop + dy,
          currentIds.length
        );
        if (targetIndex === currentIndex) {
          return currentIds;
        }

        const nextIds = moveIdInArray(currentIds, currentIndex, targetIndex);
        reorderTileIdsRef.current = nextIds;
        return nextIds;
      });
    },
    [
      getTargetIndexFromPosition,
      logicalPageWidth,
      normalizeVisiblePageIndex,
      scrollToPage,
      spreadGap,
      spreadWidth,
      tileSize,
      dragOverlayTranslateX,
      dragOverlayTranslateY,
      visiblePagesPerSpread,
    ]
  );

  const commitDrag = useCallback(async () => {
    const drag = dragStateRef.current;
    clearBoardDragState();

    setTimeout(() => {
      suppressTapAfterLongPressRef.current = false;
    }, 0);

    if (!drag) {
      return;
    }

    const finalIndex = reorderTileIdsRef.current.indexOf(drag.tileId);
    if (finalIndex < 0 || finalIndex === drag.startIndex) {
      return;
    }

    try {
      await moveTile(drag.tileId, finalIndex);
      void appHaptics.success();
    } catch (error) {
      void appHaptics.error();
      setTileDragError(error instanceof Error ? error.message : copy.board.tileMoveError);
    }
  }, [clearBoardDragState, copy, moveTile]);

  const clearPendingReorderTouch = useCallback(() => {
    if (reorderLongPressTimerRef.current) {
      clearTimeout(reorderLongPressTimerRef.current);
      reorderLongPressTimerRef.current = null;
    }

    pendingReorderTouchRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearAllPendingCompositionRecords();
      clearPendingReorderTouch();
      if (flashNewTileTimerRef.current) {
        clearTimeout(flashNewTileTimerRef.current);
      }
      if (pagerScrollIdleTimerRef.current) {
        clearTimeout(pagerScrollIdleTimerRef.current);
      }
      newTileFlashValue.stopAnimation();
    };
  }, [clearAllPendingCompositionRecords, clearPendingReorderTouch, newTileFlashValue]);

  const startReorderDrag = useCallback(
    (pendingTouch: PendingReorderTouch) => {
      const { left, top } = getSlotPosition(pendingTouch.startIndex);
      const nextDrag: BoardDragState = {
        tileId: pendingTouch.tileId,
        startIndex: pendingTouch.startIndex,
        startLeft: left,
        startTop: top,
        startViewportLeft:
          left -
          getPageLeft(
            currentPageRef.current,
            visiblePagesPerSpread,
            spreadWidth,
            logicalPageWidth,
            spreadGap
          ),
        startPageX: pendingTouch.startPageX,
        startPageY: pendingTouch.startPageY,
        dx: 0,
        dy: 0,
      };

      setTileDragError(null);
      setWiggleActive(true);
      pageSwitchArmedRef.current = true;
      suppressTapAfterLongPressRef.current = true;
      dragStateRef.current = nextDrag;
      dragOverlayTranslateX.setValue(0);
      dragOverlayTranslateY.setValue(0);
      setActiveDrag(nextDrag);
    },
    [
      dragOverlayTranslateX,
      dragOverlayTranslateY,
      getSlotPosition,
      logicalPageWidth,
      spreadGap,
      spreadWidth,
      visiblePagesPerSpread,
    ]
  );

  const beginReorderTouch = useCallback(
    (tileId: string, startIndex: number, pageX: number, pageY: number) => {
      if (!canReorderTiles || dragStateRef.current) {
        return;
      }

      const ids = reorderTileIdsRef.current;
      const resolvedIndex = ids.indexOf(tileId);
      const fallbackIndex = ids[startIndex] === tileId ? startIndex : -1;
      const nextStartIndex = resolvedIndex >= 0 ? resolvedIndex : fallbackIndex;
      if (nextStartIndex < 0) {
        return;
      }

      const pendingTouch: PendingReorderTouch = {
        tileId,
        startIndex: nextStartIndex,
        startPageX: pageX,
        startPageY: pageY,
      };

      clearPendingReorderTouch();
      startReorderDrag(pendingTouch);
    },
    [
      canReorderTiles,
      clearPendingReorderTouch,
      startReorderDrag,
    ]
  );

  const handleReorderTouchMove = useCallback(
    (pageX: number, pageY: number, gestureDx: number, gestureDy: number) => {
      const drag = dragStateRef.current;
      if (drag) {
        const resolvedDx = Number.isFinite(pageX) ? pageX - drag.startPageX : gestureDx;
        const resolvedDy = Number.isFinite(pageY) ? pageY - drag.startPageY : gestureDy;
        moveDrag(Number.isFinite(pageX) ? pageX : null, resolvedDx, resolvedDy);
      }
    },
    [moveDrag]
  );

  const endReorderTouch = useCallback(() => {
    setWiggleActive(false);
    clearPendingReorderTouch();
    if (dragStateRef.current) {
      void commitDrag();
    }
  }, [clearPendingReorderTouch, commitDrag]);

  const reorderGridResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: () => canReorderTiles && Boolean(dragStateRef.current),
        onMoveShouldSetPanResponderCapture: () => canReorderTiles && Boolean(dragStateRef.current),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (event, gestureState) => {
          handleReorderTouchMove(
            event.nativeEvent.pageX,
            event.nativeEvent.pageY,
            gestureState.dx,
            gestureState.dy
          );
        },
        onPanResponderRelease: () => {
          endReorderTouch();
        },
        onPanResponderTerminate: () => {
          endReorderTouch();
        },
      }),
    [canReorderTiles, endReorderTouch, handleReorderTouchMove]
  );

  const onLockButtonPress = () => {
    void appHaptics.tap();
    clearBoardDragState();
    clearPendingReorderTouch();
    setTileDragError(null);

    if (caregiverUnlocked) {
      setWiggleActive(false);
      lockCaregiver();
      return;
    }

    onOpenCaregiver();
  };

  const onSettingsButtonPress = () => {
    if (!caregiverUnlocked) {
      return;
    }

    void appHaptics.tap();
    clearBoardDragState();
    clearPendingReorderTouch();
    setTileDragError(null);
    onOpenSettings();
  };

  const onAddTilePress = useCallback(async () => {
    if (!caregiverUnlocked) {
      return;
    }

    const anchorTile = tiles[tiles.length - 1];
    if (!anchorTile) {
      return;
    }

    clearBoardDragState();
    clearPendingReorderTouch();
    setWiggleActive(false);
    setTileDragError(null);
    setIsAddingTile(true);

    try {
      const newTileId = await createTileAfter(anchorTile.id);
      const nextTiles = useAppStore.getState().tiles;
      const nextOrderedTiles = getTilesForBoardLayout(
        nextTiles,
        boardLayoutMode,
        categoryOrder,
        locale
      );
      const nextPages = getBoardPagesForLayout(
        nextOrderedTiles,
        boardLayoutMode,
        categoryOrder,
        pageSize,
        categoriesStartNewPage
      );
      const newTilePageIndex = nextPages.findIndex((page) =>
        page.tiles.some((tile) => tile.id === newTileId)
      );
      const nextTileCount = nextTiles.length;
      const nextPageCount = Math.max(1, nextPages.length);
      const nextPage =
        newTilePageIndex >= 0
          ? newTilePageIndex
          : Math.max(0, Math.floor((nextTileCount - 1) / pageSize));
      const resolvedPage = normalizeBoardPageIndex(
        nextPage,
        nextPageCount,
        visiblePagesPerSpread
      );
      const shouldAnimatePageChange = resolvedPage !== currentPageRef.current;

      // Let the boardPageIndex effect drive the visible-page update so it still performs scrollTo.
      pendingAnimatedPageRef.current = shouldAnimatePageChange ? resolvedPage : null;
      setBoardPageIndex(resolvedPage);
      void appHaptics.success();

      if (flashNewTileTimerRef.current) {
        clearTimeout(flashNewTileTimerRef.current);
      }

      newTileFlashValue.stopAnimation();
      newTileFlashValue.setValue(0);
      setFlashTileId(newTileId);

      flashNewTileTimerRef.current = setTimeout(() => {
        Animated.sequence([
          Animated.timing(newTileFlashValue, {
            toValue: 1,
            duration: 160,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(newTileFlashValue, {
            toValue: 0,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(newTileFlashValue, {
            toValue: 0.7,
            duration: 140,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(newTileFlashValue, {
            toValue: 0,
            duration: 240,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) {
            setFlashTileId((current) => (current === newTileId ? null : current));
          }
          newTileFlashValue.setValue(0);
        });
      }, 260);
    } catch (error) {
      void appHaptics.error();
      setTileDragError(error instanceof Error ? error.message : copy.board.addTileError);
    } finally {
      setIsAddingTile(false);
    }
  }, [
    caregiverUnlocked,
    boardLayoutMode,
    categoriesStartNewPage,
    categoryOrder,
    clearBoardDragState,
    clearPendingReorderTouch,
    createTileAfter,
    copy,
    locale,
    newTileFlashValue,
    pageSize,
    setBoardPageIndex,
    tiles,
    visiblePagesPerSpread,
  ]);

  const getTileWiggleStyle = useCallback(
    (index: number) => {
      const direction = index % 2 === 0 ? 1 : -1;

      return {
        transform: [
          {
            rotate: wiggleValue.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [`${1.15 * direction}deg`, '0deg', `${-1.15 * direction}deg`],
            }),
          },
        ],
      };
    },
    [wiggleValue]
  );

  const onBoardViewportLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    const nextHeight = event.nativeEvent.layout.height;

    boardViewportRef.current?.measureInWindow((x) => {
      boardViewportLeftRef.current = x;
    });

    if (nextWidth > 0 && Math.abs(nextWidth - boardViewportWidth) > 1) {
      setBoardViewportWidth(nextWidth);
    }

    if (nextHeight > 0 && Math.abs(nextHeight - boardViewportHeight) > 1) {
      setBoardViewportHeight(nextHeight);
    }
  };

  const settlePagerFromOffset = useCallback(
    (offsetX: number) => {
      if (spreadWidth <= 0) {
        return;
      }

      const spreadIndex = Math.round(offsetX / spreadWidth);
      commitVisiblePage(spreadIndex * visiblePagesPerSpread);
    },
    [commitVisiblePage, spreadWidth, visiblePagesPerSpread]
  );

  const onPagerScroll = useCallback(
    (event: PagerScrollEvent) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (spreadWidth <= 0) {
        return;
      }

      const spreadIndex = Math.round(offsetX / spreadWidth);
      setVisiblePage(spreadIndex * visiblePagesPerSpread);

      if (!isWebPlatform) {
        return;
      }

      if (pagerScrollIdleTimerRef.current) {
        clearTimeout(pagerScrollIdleTimerRef.current);
      }

      pagerScrollIdleTimerRef.current = setTimeout(() => {
        settlePagerFromOffset(offsetX);
        pagerScrollIdleTimerRef.current = null;
      }, 120);
    },
    [setVisiblePage, settlePagerFromOffset, spreadWidth, visiblePagesPerSpread]
  );

  const onPagerMomentumScrollEnd = useCallback((event: PagerScrollEvent) => {
    if (pagerScrollIdleTimerRef.current) {
      clearTimeout(pagerScrollIdleTimerRef.current);
      pagerScrollIdleTimerRef.current = null;
    }

    if (spreadWidth <= 0) {
      return;
    }

    settlePagerFromOffset(event.nativeEvent.contentOffset.x);
  }, [settlePagerFromOffset, spreadWidth]);

  const getTileLabelStyle = useCallback(
    (label: string) => {
      const normalizedLength = label.trim().length;
      const baseFontSize = Math.max(12, Math.min(18, Math.floor(tileSize * 0.17)));

      if (normalizedLength >= 9) {
        return {
          fontSize: Math.max(10, baseFontSize - 5),
          lineHeight: Math.max(12, baseFontSize - 3),
        };
      }

      if (normalizedLength >= 7) {
        return {
          fontSize: Math.max(11, baseFontSize - 4),
          lineHeight: Math.max(13, baseFontSize - 2),
        };
      }

      return {
        fontSize: baseFontSize,
        lineHeight: baseFontSize + 3,
      };
    },
    [tileSize]
  );

  const getBoardTileAccessibilityLabel = useCallback(
    (label: string, unlocked: boolean) =>
      unlocked ? copy.board.editTileA11y(label) : copy.board.sayTileA11y(label),
    [copy]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" translucent={false} backgroundColor={APP_THEME.background} />

      <View style={styles.topRow}>
        <View style={styles.sentenceBox}>
          <ScrollView
            ref={sentenceScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sentenceContent}
            onContentSizeChange={() => {
              sentenceScrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {sentence.length === 0 ? (
              <Text style={styles.placeholderText}>{copy.board.sentencePlaceholder}</Text>
            ) : (
              sentence.map((token) => (
                <Pressable
                  key={token.tokenId}
                  onPress={() => {
                    clearAllPendingCompositionRecords();
                    removeSentenceToken(token.tokenId);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={copy.board.removeToken(token.label)}
                  style={({ pressed }) => [
                    styles.token,
                    !showLabels && styles.tokenEmojiOnly,
                    pressed && styles.tokenPressed,
                  ]}
                >
                  <TileVisual
                    emoji={token.emoji}
                    visualType={token.visualType}
                    imageLocalUri={token.imageLocalUri}
                    imageRemotePath={token.imageRemotePath}
                    size={tokenVisualSize}
                    cornerRadius={10}
                  />
                  {showLabels ? <Text style={styles.tokenText}>{token.label}</Text> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.board.speakSentenceLabel}
            onPress={onSpeakSentence}
            disabled={sentence.length === 0}
            style={({ pressed }) => [
              styles.actionButton,
              styles.speakButton,
              sentence.length === 0 && styles.actionButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.actionIcon} allowFontScaling={false}>
              🗣️
            </Text>
            <Text style={[styles.actionText, styles.speakText]} {...ACTION_TEXT_PROPS}>
              {copy.board.speakAction}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.board.saveSentenceLabel}
            onPress={() => {
              void onSavePhrase();
            }}
            disabled={sentence.length === 0}
            style={({ pressed }) => [
              styles.actionButton,
              styles.savePhraseButton,
              sentence.length === 0 && styles.actionButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.actionIcon} allowFontScaling={false}>
              ⭐
            </Text>
            <Text style={[styles.actionText, styles.savePhraseText]} {...ACTION_TEXT_PROPS}>
              {copy.board.saveAction}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.board.clearSentenceLabel}
            onPress={onClearSentence}
            disabled={sentence.length === 0}
            style={({ pressed }) => [
              styles.actionButton,
              styles.clearButton,
              sentence.length === 0 && styles.actionButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={styles.actionIcon} allowFontScaling={false}>
              🗑️
            </Text>
            <Text style={[styles.actionText, styles.clearText]} {...ACTION_TEXT_PROPS}>
              {copy.board.clearAction}
            </Text>
          </Pressable>
        </View>

        {phraseBarEnabled ? (
          <PhraseBar
            items={phraseBarItems}
            onPressItem={onPhraseBarItemPress}
            onLongPressItem={caregiverUnlocked ? onPhraseBarItemLongPress : undefined}
          />
        ) : null}
      </View>

      {tileDragError ? <Text style={styles.editorHintError}>{tileDragError}</Text> : null}
      {phraseFeedback ? (
        <Text
          style={
            phraseFeedback.kind === 'error'
              ? styles.editorHintError
              : styles.editorHintSuccess
          }
        >
          {phraseFeedback.text}
        </Text>
      ) : null}

      <View style={styles.boardArea}>
        <View
          ref={boardViewportRef}
          style={styles.boardPagerViewport}
          onLayout={onBoardViewportLayout}
          {...(canReorderTiles ? reorderGridResponder.panHandlers : {})}
        >
          <ScrollView
            ref={boardPagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={spreadCount > 1}
            style={styles.boardPagerScroll}
            showsHorizontalScrollIndicator={false}
            onScroll={onPagerScroll}
            onMomentumScrollEnd={onPagerMomentumScrollEnd}
            scrollEventThrottle={16}
            decelerationRate="fast"
          >
            <View
              style={[
                styles.pagesStrip,
                {
                  width: spreadWidth * spreadCount,
                  minHeight: effectivePageHeight,
                },
              ]}
            >
              {pagedSpreads.map((spreadPages, spreadIndex) => (
                <View
                  key={`spread-${spreadIndex}`}
                  style={[
                    styles.spread,
                    {
                      width: spreadWidth,
                      height: effectivePageHeight,
                    },
                  ]}
                >
                  {Math.abs(spreadIndex - currentSpreadIndex) <= VISIBLE_SPREAD_WINDOW_RADIUS ? (
                    <View
                      style={[
                        styles.spreadPagesRow,
                        {
                          width: spreadWidth,
                          minHeight: effectivePageHeight,
                          gap: spreadGap,
                        },
                      ]}
                    >
                      {spreadPages.map((page, pageOffset) => {
                        if (!page) {
                          return (
                            <View
                              key={`spread-${spreadIndex}-spacer-${pageOffset}`}
                              style={[
                                styles.page,
                                styles.pageSpacer,
                                {
                                  width: logicalPageWidth,
                                  height: effectivePageHeight,
                                },
                              ]}
                            />
                          );
                        }

                        return (
                          <View
                            key={`page-${page.pageIndex}`}
                            style={[
                              styles.page,
                              {
                                width: logicalPageWidth,
                                height: effectivePageHeight,
                              },
                            ]}
                          >
                            {showCategoryPageHeaders && page.category ? (
                              <View style={styles.categoryPageHeader}>
                                <View
                                  style={[
                                    styles.categoryPageHeaderSwatch,
                                    {
                                      backgroundColor: CATEGORY_COLORS[page.category].background,
                                      borderColor: CATEGORY_COLORS[page.category].border,
                                    },
                                  ]}
                                />
                                <Text
                                  style={styles.categoryPageHeaderText}
                                  allowFontScaling={false}
                                  numberOfLines={1}
                                >
                                  {copy.categories[page.category]}
                                </Text>
                              </View>
                            ) : null}
                            <View
                              style={[
                                styles.pageGrid,
                                {
                                  width: pageGridWidth,
                                  minHeight: pageGridHeight,
                                },
                              ]}
                            >
                              {page.tiles.map((tile, localIndex) => {
                                const highContrast = settings?.highContrast ?? false;
                                const globalIndex = page.pageIndex * pageSize + localIndex;
                                const isDraggedTile = activeDrag?.tileId === tile.id;
                                const wiggleStyle =
                                  caregiverUnlocked && wiggleActive && !isDraggedTile
                                    ? getTileWiggleStyle(globalIndex)
                                    : undefined;

                                return (
                                  <Reanimated.View
                                    key={tile.id}
                                    layout={REORDER_LAYOUT_TRANSITION}
                                  >
                                    <Animated.View style={wiggleStyle}>
                                      <BoardTile
                                        tile={tile}
                                        tileSize={tileSize}
                                        tileVisualSize={tileVisualSize}
                                        showLabels={showLabels}
                                        highContrast={highContrast}
                                        isDraggedTile={isDraggedTile}
                                        flashVisible={flashTileId === tile.id}
                                        newTileFlashValue={newTileFlashValue}
                                        labelStyle={getTileLabelStyle(tile.labelCs)}
                                        caregiverUnlocked={caregiverUnlocked}
                                        canReorder={canReorderTiles}
                                        longPressDelayMs={REORDER_LONG_PRESS_MS}
                                        globalIndex={globalIndex}
                                        onTilePress={onTilePress}
                                        getAccessibilityLabel={getBoardTileAccessibilityLabel}
                                        onBeginReorderTouch={beginReorderTouch}
                                        onEndReorderTouch={endReorderTouch}
                                      />
                                    </Animated.View>
                                  </Reanimated.View>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.spreadPagesRow,
                        {
                          width: spreadWidth,
                          minHeight: effectivePageHeight,
                          gap: spreadGap,
                        },
                      ]}
                    />
                  )}
                </View>
              ))}

            </View>
          </ScrollView>

          {activeDrag && draggedTile ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.dragOverlayTile,
                {
                  width: tileSize,
                  height: tileSize,
                  left: activeDrag.startViewportLeft,
                  top: activeDrag.startTop,
                  backgroundColor:
                    settings?.highContrast ?? false
                      ? '#FFFFFF'
                      : CATEGORY_COLORS[draggedTile.category].background,
                  borderColor:
                    settings?.highContrast ?? false
                      ? '#111827'
                      : 'transparent',
                  transform: [
                    {
                      translateX: dragOverlayTranslateX,
                    },
                    {
                      translateY: dragOverlayTranslateY,
                    },
                    {
                      scale: 1.04,
                    },
                  ],
                },
                settings?.highContrast ?? false ? styles.dragOverlayTileHighContrast : null,
              ]}
            >
              <TileVisual
                emoji={draggedTile.emoji}
                visualType={draggedTile.visualType}
                imageLocalUri={draggedTile.imageLocalUri}
                imageRemotePath={draggedTile.imageRemotePath}
                size={tileVisualSize}
              />
              {showLabels ? (
                <Text
                  style={[styles.tileLabel, getTileLabelStyle(draggedTile.labelCs)]}
                  {...FITTED_TILE_LABEL_PROPS}
                >
                  {draggedTile.labelCs}
                </Text>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        {caregiverUnlocked ? (
          <View
            style={[
              styles.caregiverActionRow,
              {
                paddingLeft: LAYOUT_PADDING + insets.left,
                paddingRight: LAYOUT_PADDING + insets.right,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.board.addTileA11y}
              onPress={() => {
                void onAddTilePress();
              }}
              disabled={isAddingTile}
              style={({ pressed }) => [
                styles.addTileButton,
                isAddingTile && styles.actionButtonDisabled,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text style={styles.addTileButtonText} allowFontScaling={false}>
                {isAddingTile ? copy.board.addingTileLabel : copy.board.addTileLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.bottomBar,
            {
              paddingLeft: LAYOUT_PADDING + insets.left,
              paddingRight: LAYOUT_PADDING + insets.right,
              paddingBottom: bottomBarBottomPadding,
            },
          ]}
        >
          <View style={styles.bottomBarSide}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                caregiverUnlocked ? copy.board.lockCaregiverA11y : copy.board.unlockCaregiverA11y
              }
                onPress={onLockButtonPress}
              style={({ pressed }) => [
                styles.lockButton,
                caregiverUnlocked && styles.lockButtonUnlocked,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[styles.lockButtonText, caregiverUnlocked && styles.lockButtonTextUnlocked]}
                allowFontScaling={false}
              >
                {caregiverUnlocked ? '🔓' : '🔒'}
              </Text>
            </Pressable>
          </View>

          {spreadCount > 1 ? (
            <View style={styles.pageControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isSpreadMode ? copy.board.previousSpreadA11y : copy.board.previousPageA11y
                }
                onPress={() => {
                  void appHaptics.page();
                  scrollToPage(currentPage - visiblePagesPerSpread, true);
                }}
                disabled={currentSpreadIndex === 0}
                style={[
                  styles.pageControlButton,
                  currentSpreadIndex === 0 && styles.pageControlButtonDisabled,
                ]}
              >
                <Text style={styles.pageControlText}>{'<'}</Text>
              </Pressable>

              <View style={styles.pageIndicatorWrap}>
                {Array.from({ length: spreadCount }, (_, spreadIndex) => (
                  <Pressable
                    key={`page-dot-${spreadIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isSpreadMode
                        ? copy.board.openSpreadA11y(spreadIndex + 1)
                        : copy.board.openPageA11y(spreadIndex + 1)
                    }
                    onPress={() => {
                      void appHaptics.page();
                      scrollToPage(spreadIndex * visiblePagesPerSpread, true);
                    }}
                    style={[
                      styles.pageDot,
                      currentSpreadIndex === spreadIndex && styles.pageDotActive,
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isSpreadMode ? copy.board.nextSpreadA11y : copy.board.nextPageA11y
                }
                onPress={() => {
                  void appHaptics.page();
                  scrollToPage(currentPage + visiblePagesPerSpread, true);
                }}
                disabled={currentSpreadIndex >= spreadCount - 1}
                style={[
                  styles.pageControlButton,
                  currentSpreadIndex >= spreadCount - 1 && styles.pageControlButtonDisabled,
                ]}
              >
                <Text style={styles.pageControlText}>{'>'}</Text>
              </Pressable>
            </View>
          ) : (
            <View />
          )}

          <View style={styles.bottomBarSideRight}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                caregiverUnlocked ? copy.board.openSettingsA11y : copy.board.unlockCaregiverA11y
              }
              onPress={onSettingsButtonPress}
              disabled={!caregiverUnlocked}
              style={({ pressed }) => [
                styles.settingsCogButton,
                caregiverUnlocked && styles.settingsCogButtonUnlocked,
                !caregiverUnlocked && styles.pageControlButtonDisabled,
                pressed && styles.actionButtonPressed,
              ]}
            >
              <Text
                style={[styles.settingsCogText, caregiverUnlocked && styles.settingsCogTextUnlocked]}
                allowFontScaling={false}
              >
                ⚙
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};
