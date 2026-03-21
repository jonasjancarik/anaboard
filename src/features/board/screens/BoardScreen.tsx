import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  type LayoutChangeEvent,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { speechEngine, buildSpeechSegments } from '../../speech/speechEngine';
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
import type { SentenceToken, Tile } from '../../../shared/types/domain';
import { createId } from '../../../shared/utils/id';
import { useAppStore, selectTilesById } from '../../../store/useAppStore';

type BoardScreenProps = {
  onOpenCaregiver: () => void;
  onOpenSettings: () => void;
};

type BoardDragState = {
  tileId: string;
  startIndex: number;
  startLeft: number;
  startTop: number;
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

const REORDER_LONG_PRESS_MS = 180;
const REORDER_LONG_PRESS_SLOP = 8;
const ACTION_TEXT_PROPS = {
  allowFontScaling: false,
  numberOfLines: 1 as const,
};
const FITTED_TILE_LABEL_PROPS = {
  adjustsFontSizeToFit: true,
  maxFontSizeMultiplier: 1,
  minimumFontScale: 0.55,
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

export const BoardScreen = ({ onOpenCaregiver, onOpenSettings }: BoardScreenProps) => {
  const boardPagerRef = useRef<ScrollView>(null);
  const sentenceScrollRef = useRef<ScrollView>(null);
  const suppressTapAfterLongPressRef = useRef(false);
  const dragStateRef = useRef<BoardDragState | null>(null);
  const reorderTileIdsRef = useRef<string[]>([]);
  const pendingReorderTouchRef = useRef<PendingReorderTouch | null>(null);
  const reorderLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();

  const board = useAppStore((state) => state.board);
  const tiles = useAppStore((state) => state.tiles);
  const sentence = useAppStore((state) => state.sentence);
  const clipsById = useAppStore((state) => state.clipsById);
  const settings = useAppStore((state) => state.settings);
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);
  const addTileToSentence = useAppStore((state) => state.addTileToSentence);
  const removeSentenceToken = useAppStore((state) => state.removeSentenceToken);
  const clearSentence = useAppStore((state) => state.clearSentence);
  const setSpeaking = useAppStore((state) => state.setSpeaking);
  const moveTile = useAppStore((state) => state.moveTile);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);
  const lockCaregiver = useAppStore((state) => state.lockCaregiver);
  const navigate = useAppStore((state) => state.navigate);

  const showLabels = settings?.showLabels ?? false;
  const gridColumns = board?.columns ?? GRID_COLUMNS;
  const gridRows = board?.rows ?? GRID_ROWS;
  const pageSize = gridColumns * gridRows;
  const [tileDragError, setTileDragError] = useState<string | null>(null);
  const [reorderTileIds, setReorderTileIds] = useState<string[]>([]);
  const [activeDrag, setActiveDrag] = useState<BoardDragState | null>(null);
  const [boardViewportWidth, setBoardViewportWidth] = useState(0);
  const [boardViewportHeight, setBoardViewportHeight] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  const currentPageRef = useRef(0);

  const tilesById = useMemo(() => selectTilesById(tiles), [tiles]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const pageWidth = boardViewportWidth > 0 ? boardViewportWidth : width - LAYOUT_PADDING * 2;
  const availableGridWidth = Math.min(pageWidth, MAX_GRID_WIDTH);
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
  const horizontalGridOffset = Math.max(0, (pageWidth - pageGridWidth) / 2);
  const verticalGridOffset = Math.max(0, (effectivePageHeight - pageGridHeight) / 2);

  useEffect(() => {
    reorderTileIdsRef.current = reorderTileIds;
  }, [reorderTileIds]);

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

    return reorderTileIds
      .map((id) => tilesById[id])
      .filter((tile): tile is Tile => Boolean(tile));
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

  const scrollToPage = useCallback(
    (nextPage: number, animated: boolean) => {
      const clampedPage = clampPageIndex(nextPage);
      currentPageRef.current = clampedPage;
      setCurrentPage(clampedPage);

      if (pageWidth <= 0) {
        return;
      }

      boardPagerRef.current?.scrollTo({
        x: clampedPage * pageWidth,
        animated,
      });
    },
    [clampPageIndex, pageWidth]
  );

  useEffect(() => {
    if (currentPage > pageCount - 1) {
      scrollToPage(pageCount - 1, false);
      return;
    }

    if (pageWidth > 0) {
      scrollToPage(currentPage, false);
    }
  }, [currentPage, pageCount, pageWidth, scrollToPage]);

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
    dragStateRef.current = null;
    setActiveDrag(null);
  }, []);

  const playTokens = async (tokens: SentenceToken[]) => {
    if (tokens.length === 0 || !settings) {
      return;
    }

    const segments = await buildSpeechSegments({
      tokens,
      tilesById,
      clipsById,
    });

    if (segments.length === 0) {
      return;
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

    if (caregiverUnlocked) {
      setEditorTargetTileId(tileId);
      navigate('editor');
      return;
    }

    const tile = tilesById[tileId];
    if (!tile) {
      return;
    }

    addTileToSentence(tileId);

    void playTokens([
      {
        tokenId: createId('tap'),
        tileId,
        label: tile.labelCs,
        emoji: tile.emoji,
      },
    ]);
  };

  const onSpeakSentence = () => {
    void playTokens(sentence);
  };

  const onClearSentence = () => {
    void speechEngine.cancel();
    clearSentence();
  };

  const moveDrag = useCallback(
    (dx: number, dy: number) => {
      const drag = dragStateRef.current;
      if (!drag) {
        return;
      }

      const nextDrag = { ...drag, dx, dy };
      dragStateRef.current = nextDrag;
      setActiveDrag(nextDrag);

      const dragCenterLeft = drag.startLeft + dx + tileSize / 2;
      const targetPage = clampPageIndex(Math.floor(dragCenterLeft / pageWidth));
      if (targetPage !== currentPageRef.current) {
        scrollToPage(targetPage, false);
      }

      setReorderTileIds((currentIds) => {
        const currentIndex = currentIds.indexOf(drag.tileId);
        if (currentIndex < 0) {
          return currentIds;
        }

        const targetIndex = getTargetIndexFromPosition(
          drag.startLeft + dx,
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
    };
  }, [clearPendingReorderTouch]);

  const startReorderDrag = useCallback(
    (pendingTouch: PendingReorderTouch) => {
      const { left, top } = getSlotPosition(pendingTouch.startIndex);
      const nextDrag: BoardDragState = {
        tileId: pendingTouch.tileId,
        startIndex: pendingTouch.startIndex,
        startLeft: left,
        startTop: top,
        startPageX: pendingTouch.startPageX,
        startPageY: pendingTouch.startPageY,
        dx: 0,
        dy: 0,
      };

      setTileDragError(null);
      suppressTapAfterLongPressRef.current = true;
      dragStateRef.current = nextDrag;
      setActiveDrag(nextDrag);
    },
    [getSlotPosition]
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
      pendingReorderTouchRef.current = pendingTouch;

      reorderLongPressTimerRef.current = setTimeout(() => {
        const nextPendingTouch = pendingReorderTouchRef.current;
        clearPendingReorderTouch();
        if (!nextPendingTouch) {
          return;
        }

        startReorderDrag(nextPendingTouch);
      }, REORDER_LONG_PRESS_MS);
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
        moveDrag(resolvedDx, resolvedDy);
        return;
      }

      const pendingTouch = pendingReorderTouchRef.current;
      if (!pendingTouch) {
        return;
      }

      const resolvedX = Number.isFinite(pageX) ? pageX : pendingTouch.startPageX + gestureDx;
      const resolvedY = Number.isFinite(pageY) ? pageY : pendingTouch.startPageY + gestureDy;
      const delta = Math.hypot(resolvedX - pendingTouch.startPageX, resolvedY - pendingTouch.startPageY);
      if (delta > REORDER_LONG_PRESS_SLOP) {
        clearPendingReorderTouch();
      }
    },
    [clearPendingReorderTouch, moveDrag]
  );

  const endReorderTouch = useCallback(() => {
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
        onMoveShouldSetPanResponder: () =>
          caregiverUnlocked && (Boolean(pendingReorderTouchRef.current) || Boolean(dragStateRef.current)),
        onMoveShouldSetPanResponderCapture: () =>
          caregiverUnlocked && (Boolean(pendingReorderTouchRef.current) || Boolean(dragStateRef.current)),
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

  const onBoardViewportLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    const nextHeight = event.nativeEvent.layout.height;

    if (nextWidth > 0 && Math.abs(nextWidth - boardViewportWidth) > 1) {
      setBoardViewportWidth(nextWidth);
    }

    if (nextHeight > 0 && Math.abs(nextHeight - boardViewportHeight) > 1) {
      setBoardViewportHeight(nextHeight);
    }
  };

  const onPagerMomentumScrollEnd = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (pageWidth <= 0) {
      return;
    }

    const nextPage = clampPageIndex(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" translucent={false} backgroundColor="#F3F7FC" />

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
                  <Text style={styles.tokenEmoji}>{token.emoji}</Text>
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
            <Text style={styles.actionText} {...ACTION_TEXT_PROPS}>
              Řekni
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Smazat větu"
            onPress={onClearSentence}
            style={({ pressed }) => [
              styles.actionButton,
              styles.clearButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={[styles.actionText, styles.clearText]} {...ACTION_TEXT_PROPS}>
              Smazat
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.editorHintWrap}>
        <Text style={styles.editorHint}>
          {!caregiverUnlocked
            ? pageCount > 1
              ? 'Zámek dole vlevo odemyká režim pečovatele. Dlaždice mluví, mezi stránkami přejeď do stran.'
              : 'Zámek dole vlevo odemyká režim pečovatele. Dlaždice mluví.'
            : pageCount > 1
              ? 'Režim pečovatele aktivní: klepni na dlaždici pro úpravu, podrž a táhni pro přesun, ozubené kolečko otevírá správu tabule.'
              : 'Režim pečovatele aktivní: klepni na dlaždici pro úpravu, podrž a táhni pro přesun, ozubené kolečko otevírá správu tabule.'}
        </Text>
        {tileDragError ? <Text style={styles.editorHintError}>{tileDragError}</Text> : null}
      </View>

      <View style={styles.boardArea}>
        <View
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
            onMomentumScrollEnd={onPagerMomentumScrollEnd}
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
                        <Pressable
                          key={tile.id}
                          accessibilityRole="button"
                          accessibilityLabel={
                            caregiverUnlocked ? `Upravit ${tile.labelCs}` : `Řekni ${tile.labelCs}`
                          }
                          onPress={() => onTilePress(tile.id)}
                          onTouchStart={
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
                            {
                              width: tileSize,
                              height: tileSize,
                              backgroundColor: highContrast ? '#FFFFFF' : colors.background,
                              borderColor: highContrast ? '#111827' : colors.border,
                            },
                            pressed && styles.tilePressed,
                          ]}
                        >
                          <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                          {showLabels ? (
                            <Text style={styles.tileLabel} {...FITTED_TILE_LABEL_PROPS}>
                              {tile.labelCs}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}

              {activeDrag && draggedTile ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.dragOverlayTile,
                    {
                      width: tileSize,
                      height: tileSize,
                      left: activeDrag.startLeft + activeDrag.dx,
                      top: activeDrag.startTop + activeDrag.dy,
                      backgroundColor:
                        settings?.highContrast ?? false
                          ? '#FFFFFF'
                          : CATEGORY_COLORS[draggedTile.category].background,
                      borderColor:
                        settings?.highContrast ?? false
                          ? '#111827'
                          : CATEGORY_COLORS[draggedTile.category].border,
                    },
                  ]}
                >
                  <Text style={styles.tileEmoji}>{draggedTile.emoji}</Text>
                  {showLabels ? (
                    <Text style={styles.tileLabel} {...FITTED_TILE_LABEL_PROPS}>
                      {draggedTile.labelCs}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>

        <View style={styles.bottomBar}>
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

              <Text style={styles.pageCounter}>
                {currentPage + 1}/{pageCount}
              </Text>

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
