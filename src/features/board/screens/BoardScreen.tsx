import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { speechEngine, buildSpeechSegments } from '../../speech/speechEngine';
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
import { CATEGORY_COLORS } from '../../../shared/constants/defaults';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { TileVisual } from '../../../shared/components/TileVisual';
import { APP_THEME } from '../../../shared/constants/theme';
import type { PhraseSource, PhraseTokenSnapshot, SentenceToken, Tile } from '../../../shared/types/domain';
import { createId } from '../../../shared/utils/id';
import { useAppStore, selectTilesById } from '../../../store/useAppStore';

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

type PagerScrollEvent = {
  nativeEvent: {
    contentOffset: {
      x: number;
    };
  };
};

const REORDER_LONG_PRESS_MS = 180;
const PAGE_SWITCH_EDGE_THRESHOLD = 44;
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
  const dragStateRef = useRef<BoardDragState | null>(null);
  const reorderTileIdsRef = useRef<string[]>([]);
  const pendingReorderTouchRef = useRef<PendingReorderTouch | null>(null);
  const reorderLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardViewportLeftRef = useRef(0);
  const lastAppliedPageWidthRef = useRef(0);
  const pageSwitchArmedRef = useRef(true);
  const wiggleValue = useRef(new Animated.Value(0)).current;
  const newTileFlashValue = useRef(new Animated.Value(0)).current;
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
  const phraseBarEnabled = settings?.phraseBarEnabled ?? true;
  const suggestionCount = settings?.suggestionCount ?? 3;
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

  const pageWidth = boardViewportWidth > 0 ? boardViewportWidth : width;
  const availableGridWidth = Math.min(pageWidth - LAYOUT_PADDING * 2, MAX_GRID_WIDTH);
  const tileSize = useMemo(() => {
    const widthBound = (availableGridWidth - GRID_GAP * (gridColumns - 1)) / gridColumns;
    const heightBound =
      boardViewportHeight > 0
        ? (boardViewportHeight - GRID_GAP * (gridRows - 1)) / gridRows
        : widthBound;
    const rawTileSize = Math.min(widthBound, heightBound);

    return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, Math.floor(rawTileSize)));
  }, [availableGridWidth, boardViewportHeight, gridColumns, gridRows]);

  const tileStep = tileSize + GRID_GAP;
  const pageGridWidth = tileSize * gridColumns + GRID_GAP * (gridColumns - 1);
  const pageGridHeight = tileSize * gridRows + GRID_GAP * (gridRows - 1);
  const effectivePageHeight = boardViewportHeight > 0 ? boardViewportHeight : pageGridHeight;
  const horizontalGridOffset = Math.max(LAYOUT_PADDING, (pageWidth - pageGridWidth) / 2);
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

    if (!caregiverUnlocked || !wiggleActive) {
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
  }, [caregiverUnlocked, wiggleActive, wiggleValue]);

  useEffect(() => {
    if (!caregiverUnlocked) {
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
  }, [caregiverUnlocked]);

  useEffect(() => {
    if (!caregiverUnlocked || dragStateRef.current) {
      return;
    }

    const nextIds = tiles.map((tile) => tile.id);
    reorderTileIdsRef.current = nextIds;
    setReorderTileIds(nextIds);
  }, [caregiverUnlocked, tiles]);

  const orderedTiles = useMemo(() => {
    if (!caregiverUnlocked) {
      return tiles;
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
  }, [caregiverUnlocked, reorderTileIds, tiles, tilesById]);

  const pageCount = Math.max(1, Math.ceil(orderedTiles.length / pageSize));
  const pagedTiles = useMemo(() => {
    const pages: Tile[][] = [];

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const startIndex = pageIndex * pageSize;
      pages.push(orderedTiles.slice(startIndex, startIndex + pageSize));
    }

    return pages;
  }, [orderedTiles, pageCount, pageSize]);

  const draggedTile = activeDrag ? tilesById[activeDrag.tileId] : undefined;

  const clampPageIndex = useCallback(
    (nextPage: number) => Math.max(0, Math.min(pageCount - 1, nextPage)),
    [pageCount]
  );

  const setVisiblePage = useCallback(
    (nextPage: number) => {
      const clampedPage = clampPageIndex(nextPage);
      if (clampedPage !== currentPageRef.current) {
        currentPageRef.current = clampedPage;
        setCurrentPage((page) => (page === clampedPage ? page : clampedPage));
      }

      return clampedPage;
    },
    [clampPageIndex]
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

      if (pageWidth <= 0) {
        return;
      }

      boardPagerRef.current?.scrollTo({
        x: clampedPage * pageWidth,
        animated,
      });
    },
    [commitVisiblePage, pageWidth]
  );

  useEffect(() => {
    const nextPage = clampPageIndex(boardPageIndex);
    if (nextPage !== boardPageIndex) {
      setBoardPageIndex(nextPage);
    }

    const pageChanged = nextPage !== currentPageRef.current;
    const pageWidthChanged =
      pageWidth > 0 && Math.abs(lastAppliedPageWidthRef.current - pageWidth) > 1;
    setVisiblePage(nextPage);

    if (pageWidth > 0 && (pageChanged || pageWidthChanged)) {
      const shouldAnimate = pendingAnimatedPageRef.current === nextPage;
      boardPagerRef.current?.scrollTo({
        x: nextPage * pageWidth,
        animated: shouldAnimate,
      });
      if (shouldAnimate) {
        pendingAnimatedPageRef.current = null;
      }
    }

    lastAppliedPageWidthRef.current = pageWidth;
  }, [boardPageIndex, clampPageIndex, pageWidth, setBoardPageIndex, setVisiblePage]);

  useEffect(() => {
    if (pageCount === 0) {
      return;
    }

    const nextPage = clampPageIndex(currentPageRef.current);
    if (nextPage === currentPageRef.current) {
      return;
    }

    setVisiblePage(nextPage);
    setBoardPageIndex(nextPage);

    if (pageWidth > 0) {
      boardPagerRef.current?.scrollTo({
        x: nextPage * pageWidth,
        animated: false,
      });
    }
  }, [clampPageIndex, pageCount, pageWidth, setBoardPageIndex]);

  const getSlotPosition = useCallback(
    (index: number) => {
      const pageIndex = Math.floor(index / pageSize);
      const localIndex = index % pageSize;
      const row = Math.floor(localIndex / gridColumns);
      const column = localIndex % gridColumns;

      return {
        left: pageIndex * pageWidth + horizontalGridOffset + column * tileStep,
        top: verticalGridOffset + row * tileStep,
      };
    },
    [gridColumns, horizontalGridOffset, pageSize, pageWidth, tileStep, verticalGridOffset]
  );

  const getTargetIndexFromPosition = useCallback(
    (left: number, top: number, totalTiles: number) => {
      if (totalTiles <= 1) {
        return 0;
      }

      const tileCenterLeft = left + tileSize / 2;
      const pageIndex = clampPageIndex(Math.floor(tileCenterLeft / pageWidth));
      const normalizedLeft = left - pageIndex * pageWidth - horizontalGridOffset;
      const normalizedTop = top - verticalGridOffset;
      const column = Math.max(0, Math.min(gridColumns - 1, Math.round(normalizedLeft / tileStep)));
      const row = Math.max(0, Math.min(gridRows - 1, Math.round(normalizedTop / tileStep)));
      const rawLocalIndex = row * gridColumns + column;
      const maxLocalIndex = Math.min(pageSize - 1, totalTiles - pageIndex * pageSize - 1);
      const localIndex = Math.max(0, Math.min(maxLocalIndex, rawLocalIndex));

      return Math.max(0, Math.min(totalTiles - 1, pageIndex * pageSize + localIndex));
    },
    [
      clampPageIndex,
      gridColumns,
      gridRows,
      horizontalGridOffset,
      pageSize,
      pageWidth,
      tileSize,
      tileStep,
      verticalGridOffset,
    ]
  );

  const clearBoardDragState = useCallback(() => {
    pageSwitchArmedRef.current = true;
    dragStateRef.current = null;
    setActiveDrag(null);
  }, []);

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
      setEditorTargetTileId(tileId);
      navigate('editor');
      return;
    }

    const tile = tilesById[tileId];
    if (!tile) {
      return;
    }

    const phraseToken = toPhraseTokenSnapshot(tile);
    const nextSentenceTokens = [...sentence, phraseToken].map((token) =>
      'tokenId' in token ? toPhraseTokenSnapshot(token) : token
    );

    addTileToSentence(tileId);
    void recordPhraseComposition(nextSentenceTokens).catch(() => {
      // Suggestions should still work even if composition history fails to persist.
    });

    void playTokens([phraseToken]);
  };

  const onSpeakSentence = () => {
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
      setPhraseFeedback({
        kind: 'success',
        text: 'Věta uložená',
      });
    } catch (error) {
      setPhraseFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Větu nešlo uložit',
      });
    }
  }, [
    caregiverUnlocked,
    onOpenCaregiver,
    saveCurrentSentenceAsPhrase,
    sentence.length,
    clearPendingCaregiverAction,
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

      replaceSentenceWithTokens(phrase.tokens);
      void playTokens(phrase.tokens, {
        recordSource: item.kind,
        savedPhraseId: item.kind === 'saved' ? phrase.id : undefined,
      });
    },
    [
      appendPhraseTokens,
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

      Alert.alert('Smazat uloženou větu?', phrase.spokenText, [
        {
          text: 'Nechat',
          style: 'cancel',
        },
        {
          text: 'Smazat',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteSavedPhrase(phrase.id);
                setPhraseFeedback({
                  kind: 'success',
                  text: 'Uložená věta smazaná',
                });
              } catch (error) {
                setPhraseFeedback({
                  kind: 'error',
                  text:
                    error instanceof Error
                      ? error.message
                      : 'Uloženou větu nešlo smazat',
                });
              }
            })();
          },
        },
      ]);
    },
    [caregiverUnlocked, deleteSavedPhrase, savedPhrases]
  );

  const onClearSentence = () => {
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
      setActiveDrag(nextDrag);

      const viewportLeft = drag.startViewportLeft + dx;
      const localFingerX =
        pageX !== null ? pageX - boardViewportLeftRef.current : viewportLeft + tileSize / 2;
      let targetPage = currentPageRef.current;

      if (localFingerX >= pageWidth - PAGE_SWITCH_EDGE_THRESHOLD) {
        if (pageSwitchArmedRef.current) {
          const nextPage = clampPageIndex(currentPageRef.current + 1);
          if (nextPage !== currentPageRef.current) {
            targetPage = nextPage;
            pageSwitchArmedRef.current = false;
          }
        }
      } else if (localFingerX <= PAGE_SWITCH_EDGE_THRESHOLD) {
        if (pageSwitchArmedRef.current) {
          const nextPage = clampPageIndex(currentPageRef.current - 1);
          if (nextPage !== currentPageRef.current) {
            targetPage = nextPage;
            pageSwitchArmedRef.current = false;
          }
        }
      } else {
        pageSwitchArmedRef.current = true;
      }

      if (targetPage !== currentPageRef.current) {
        scrollToPage(targetPage, false);
      }

      setReorderTileIds((currentIds) => {
        const currentIndex = currentIds.indexOf(drag.tileId);
        if (currentIndex < 0) {
          return currentIds;
        }

        const contentLeft = targetPage * pageWidth + viewportLeft;
        const targetIndex = getTargetIndexFromPosition(
          contentLeft,
          drag.startTop + dy,
          currentIds.length
        );
        if (targetIndex === currentIndex) {
          return currentIds;
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        const nextIds = moveIdInArray(currentIds, currentIndex, targetIndex);
        reorderTileIdsRef.current = nextIds;
        return nextIds;
      });
    },
    [clampPageIndex, getTargetIndexFromPosition, pageWidth, scrollToPage, tileSize]
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
    } catch (error) {
      setTileDragError(error instanceof Error ? error.message : 'Přesun dlaždice se nepovedl');
    }
  }, [clearBoardDragState, moveTile]);

  const clearPendingReorderTouch = useCallback(() => {
    if (reorderLongPressTimerRef.current) {
      clearTimeout(reorderLongPressTimerRef.current);
      reorderLongPressTimerRef.current = null;
    }

    pendingReorderTouchRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearPendingReorderTouch();
      if (flashNewTileTimerRef.current) {
        clearTimeout(flashNewTileTimerRef.current);
      }
      if (pagerScrollIdleTimerRef.current) {
        clearTimeout(pagerScrollIdleTimerRef.current);
      }
      newTileFlashValue.stopAnimation();
    };
  }, [clearPendingReorderTouch, newTileFlashValue]);

  const startReorderDrag = useCallback(
    (pendingTouch: PendingReorderTouch) => {
      const { left, top } = getSlotPosition(pendingTouch.startIndex);
      const nextDrag: BoardDragState = {
        tileId: pendingTouch.tileId,
        startIndex: pendingTouch.startIndex,
        startLeft: left,
        startTop: top,
        startViewportLeft: left - currentPageRef.current * pageWidth,
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
      setActiveDrag(nextDrag);
    },
    [getSlotPosition, pageWidth]
  );

  const beginReorderTouch = useCallback(
    (tileId: string, startIndex: number, pageX: number, pageY: number) => {
      if (!caregiverUnlocked || dragStateRef.current) {
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
      caregiverUnlocked,
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
        onMoveShouldSetPanResponder: () => caregiverUnlocked && Boolean(dragStateRef.current),
        onMoveShouldSetPanResponderCapture: () => caregiverUnlocked && Boolean(dragStateRef.current),
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
    [caregiverUnlocked, endReorderTouch, handleReorderTouchMove]
  );

  const onLockButtonPress = () => {
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

    clearBoardDragState();
    clearPendingReorderTouch();
    setTileDragError(null);
    onOpenSettings();
  };

  const onAddTilePress = useCallback(async () => {
    if (!caregiverUnlocked) {
      return;
    }

    const anchorTile = orderedTiles[orderedTiles.length - 1];
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
      const nextPage = Math.floor((useAppStore.getState().tiles.length - 1) / pageSize);
      const resolvedPage = Math.max(0, nextPage);
      const shouldAnimatePageChange = resolvedPage !== currentPageRef.current;

      // Let the boardPageIndex effect drive the visible-page update so it still performs scrollTo.
      pendingAnimatedPageRef.current = shouldAnimatePageChange ? resolvedPage : null;
      setBoardPageIndex(resolvedPage);

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
      setTileDragError(error instanceof Error ? error.message : 'Novou dlaždici nešlo přidat');
    } finally {
      setIsAddingTile(false);
    }
  }, [
    caregiverUnlocked,
    clearBoardDragState,
    clearPendingReorderTouch,
    createTileAfter,
    newTileFlashValue,
    orderedTiles,
    pageSize,
    setBoardPageIndex,
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
      if (pageWidth <= 0) {
        return;
      }

      commitVisiblePage(Math.round(offsetX / pageWidth));
    },
    [commitVisiblePage, pageWidth]
  );

  const onPagerScroll = useCallback(
    (event: PagerScrollEvent) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      if (pageWidth <= 0) {
        return;
      }

      setVisiblePage(Math.round(offsetX / pageWidth));

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
    [pageWidth, setVisiblePage, settlePagerFromOffset]
  );

  const onPagerMomentumScrollEnd = useCallback((event: PagerScrollEvent) => {
    if (pagerScrollIdleTimerRef.current) {
      clearTimeout(pagerScrollIdleTimerRef.current);
      pagerScrollIdleTimerRef.current = null;
    }

    if (pageWidth <= 0) {
      return;
    }

    settlePagerFromOffset(event.nativeEvent.contentOffset.x);
  }, [pageWidth, settlePagerFromOffset]);

  const getTileLabelStyle = useCallback(
    (label: string) => {
      const normalizedLength = label.trim().length;
      const baseFontSize = Math.max(12, Math.min(18, Math.floor(tileSize * 0.17)));

      if (normalizedLength >= 10) {
        return {
          fontSize: Math.max(12, baseFontSize - 3),
          lineHeight: Math.max(14, baseFontSize - 1),
        };
      }

      if (normalizedLength >= 7) {
        return {
          fontSize: Math.max(13, baseFontSize - 2),
          lineHeight: Math.max(15, baseFontSize),
        };
      }

      return {
        fontSize: baseFontSize,
        lineHeight: baseFontSize + 3,
      };
    },
    [tileSize]
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
              <Text style={styles.placeholderText}>Klepni na ikony a sestav větu</Text>
            ) : (
              sentence.map((token) => (
                <Pressable
                  key={token.tokenId}
                  onPress={() => removeSentenceToken(token.tokenId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Odebrat ${token.label}`}
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
            accessibilityLabel="Přečíst větu"
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
              Řekni
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Uložit větu"
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
              Uložit
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Smazat větu"
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
              Smazat
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
          {...(caregiverUnlocked ? reorderGridResponder.panHandlers : {})}
        >
          <ScrollView
            ref={boardPagerRef}
            horizontal
            pagingEnabled
            scrollEnabled={pageCount > 1}
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
                  width: pageWidth * pageCount,
                  minHeight: effectivePageHeight,
                },
              ]}
            >
              {pagedTiles.map((pageTiles, pageIndex) => (
                <View
                  key={`page-${pageIndex}`}
                  style={[
                    styles.page,
                    {
                      width: pageWidth,
                      height: effectivePageHeight,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.pageGrid,
                      {
                        width: pageGridWidth,
                        minHeight: pageGridHeight,
                      },
                    ]}
                  >
                    {pageTiles.map((tile, localIndex) => {
                      const colors = CATEGORY_COLORS[tile.category];
                      const highContrast = settings?.highContrast ?? false;
                      const globalIndex = pageIndex * pageSize + localIndex;
                      const isDraggedTile = activeDrag?.tileId === tile.id;

                      return (
                        <Animated.View
                          key={tile.id}
                          style={
                            caregiverUnlocked && wiggleActive && !isDraggedTile
                              ? getTileWiggleStyle(globalIndex)
                              : undefined
                          }
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              caregiverUnlocked ? `Upravit ${tile.labelCs}` : `Řekni ${tile.labelCs}`
                            }
                            onPress={() => onTilePress(tile.id)}
                            onLongPress={
                              caregiverUnlocked
                                ? (event) => {
                                    beginReorderTouch(
                                      tile.id,
                                      globalIndex,
                                      event.nativeEvent.pageX,
                                      event.nativeEvent.pageY
                                    );
                                  }
                                : undefined
                            }
                            delayLongPress={caregiverUnlocked ? REORDER_LONG_PRESS_MS : undefined}
                            onTouchEnd={
                              caregiverUnlocked
                                ? () => {
                                    endReorderTouch();
                                  }
                                : undefined
                            }
                            onTouchCancel={
                              caregiverUnlocked
                                ? () => {
                                    endReorderTouch();
                                  }
                                : undefined
                            }
                            style={({ pressed }) => [
                              styles.tile,
                              highContrast && styles.tileHighContrast,
                              {
                                width: tileSize,
                                height: tileSize,
                                backgroundColor: highContrast ? '#FFFFFF' : colors.background,
                                borderColor: highContrast ? '#111827' : 'transparent',
                              },
                              isDraggedTile && styles.tilePlaceholder,
                              pressed && styles.tilePressed,
                            ]}
                          >
                            {flashTileId === tile.id ? (
                              <Animated.View
                                pointerEvents="none"
                                style={[
                                  styles.newTileFlashOverlay,
                                  {
                                    opacity: newTileFlashValue,
                                  },
                                ]}
                              />
                            ) : null}
                            <TileVisual
                              emoji={tile.emoji}
                              visualType={tile.visualType}
                              imageLocalUri={tile.imageLocalUri}
                              imageRemotePath={tile.imageRemotePath}
                              size={tileVisualSize}
                            />
                            {showLabels ? (
                              <Text
                                style={[styles.tileLabel, getTileLabelStyle(tile.labelCs)]}
                                {...FITTED_TILE_LABEL_PROPS}
                              >
                                {tile.labelCs}
                              </Text>
                            ) : null}
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                </View>
              ))}

            </View>
          </ScrollView>

          {activeDrag && draggedTile ? (
            <View
              pointerEvents="none"
              style={[
                styles.dragOverlayTile,
                {
                  width: tileSize,
                  height: tileSize,
                  left: activeDrag.startViewportLeft + activeDrag.dx,
                  top: activeDrag.startTop + activeDrag.dy,
                  backgroundColor:
                    settings?.highContrast ?? false
                      ? '#FFFFFF'
                      : CATEGORY_COLORS[draggedTile.category].background,
                  borderColor:
                    settings?.highContrast ?? false
                      ? '#111827'
                      : 'transparent',
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
            </View>
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
              accessibilityLabel="Přidat novou dlaždici"
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
                {isAddingTile ? 'Přidávám dlaždici...' : '+ Přidat dlaždici'}
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
              accessibilityLabel={caregiverUnlocked ? 'Zamknout režim pečovatele' : 'Odemknout režim pečovatele'}
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

          {pageCount > 1 ? (
            <View style={styles.pageControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Předchozí stránka"
                onPress={() => scrollToPage(currentPage - 1, true)}
                disabled={currentPage === 0}
                style={[
                  styles.pageControlButton,
                  currentPage === 0 && styles.pageControlButtonDisabled,
                ]}
              >
                <Text style={styles.pageControlText}>{'<'}</Text>
              </Pressable>

              <View style={styles.pageIndicatorWrap}>
                {Array.from({ length: pageCount }, (_, pageIndex) => (
                  <Pressable
                    key={`page-dot-${pageIndex}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Otevřít stránku ${pageIndex + 1}`}
                    onPress={() => scrollToPage(pageIndex, true)}
                    style={[
                      styles.pageDot,
                      currentPage === pageIndex && styles.pageDotActive,
                    ]}
                  />
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Další stránka"
                onPress={() => scrollToPage(currentPage + 1, true)}
                disabled={currentPage >= pageCount - 1}
                style={[
                  styles.pageControlButton,
                  currentPage >= pageCount - 1 && styles.pageControlButtonDisabled,
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
              accessibilityLabel={caregiverUnlocked ? 'Otevřít nastavení pečovatele' : 'Odemknout režim pečovatele'}
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
