import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { speechEngine, buildSpeechSegments } from '../../speech/speechEngine';
import {
  GRID_COLUMNS,
  GRID_GAP,
  LAYOUT_PADDING,
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
  onOpenArchive: () => void;
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

export const BoardScreen = ({ onOpenCaregiver, onOpenArchive }: BoardScreenProps) => {
  const sentenceScrollRef = useRef<ScrollView>(null);
  const suppressTapAfterLongPressRef = useRef(false);
  const dragStateRef = useRef<BoardDragState | null>(null);
  const reorderTileIdsRef = useRef<string[]>([]);
  const pendingReorderTouchRef = useRef<PendingReorderTouch | null>(null);
  const reorderLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useWindowDimensions();

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
  const [tileDragError, setTileDragError] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderTileIds, setReorderTileIds] = useState<string[]>([]);
  const [activeDrag, setActiveDrag] = useState<BoardDragState | null>(null);
  const [gridWidth, setGridWidth] = useState(0);

  const tilesById = useMemo(() => selectTilesById(tiles), [tiles]);

  const tileSize = useMemo(() => {
    const maxGridWidth = 760;
    const availableWidth = Math.min(width - LAYOUT_PADDING * 2, maxGridWidth);
    const rawTileSize = (availableWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

    return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, Math.floor(rawTileSize)));
  }, [width]);

  const tileStep = tileSize + GRID_GAP;
  const rowWidth = tileSize * GRID_COLUMNS + GRID_GAP * (GRID_COLUMNS - 1);
  const effectiveGridWidth = gridWidth > 0 ? gridWidth : rowWidth;
  const horizontalGridOffset = Math.max(0, (effectiveGridWidth - rowWidth) / 2);

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
      setIsReorderMode(false);
    }
  }, [caregiverUnlocked]);

  useEffect(() => {
    if (!isReorderMode || dragStateRef.current) {
      return;
    }

    const nextIds = tiles.map((tile) => tile.id);
    reorderTileIdsRef.current = nextIds;
    setReorderTileIds(nextIds);
  }, [isReorderMode, tiles]);

  const orderedTiles = useMemo(() => {
    if (!isReorderMode) {
      return tiles;
    }

    return reorderTileIds
      .map((id) => tilesById[id])
      .filter((tile): tile is Tile => Boolean(tile));
  }, [isReorderMode, reorderTileIds, tiles, tilesById]);

  const draggedTile = activeDrag ? tilesById[activeDrag.tileId] : undefined;

  const getSlotPosition = useCallback(
    (index: number) => {
      const row = Math.floor(index / GRID_COLUMNS);
      const column = index % GRID_COLUMNS;

      return {
        left: horizontalGridOffset + column * tileStep,
        top: row * tileStep,
      };
    },
    [horizontalGridOffset, tileStep]
  );

  const getTargetIndexFromPosition = useCallback(
    (left: number, top: number, totalTiles: number) => {
      if (totalTiles <= 1) {
        return 0;
      }

      const normalizedLeft = left - horizontalGridOffset;
      const column = Math.max(0, Math.min(GRID_COLUMNS - 1, Math.round(normalizedLeft / tileStep)));
      const row = Math.max(0, Math.round(top / tileStep));
      const rawIndex = row * GRID_COLUMNS + column;

      return Math.max(0, Math.min(totalTiles - 1, rawIndex));
    },
    [horizontalGridOffset, tileStep]
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

    if (caregiverUnlocked && isReorderMode) {
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
    [getTargetIndexFromPosition]
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
      dragStateRef.current = nextDrag;
      setActiveDrag(nextDrag);
    },
    [getSlotPosition]
  );

  const beginReorderTouch = useCallback(
    (tileId: string, startIndex: number, pageX: number, pageY: number) => {
      if (!caregiverUnlocked || !isReorderMode || dragStateRef.current) {
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
      isReorderMode,
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
          caregiverUnlocked && isReorderMode && (Boolean(pendingReorderTouchRef.current) || Boolean(dragStateRef.current)),
        onMoveShouldSetPanResponderCapture: () =>
          caregiverUnlocked && isReorderMode && (Boolean(pendingReorderTouchRef.current) || Boolean(dragStateRef.current)),
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
    [caregiverUnlocked, endReorderTouch, handleReorderTouchMove, isReorderMode]
  );

  const onTileLongPress = (tileId: string) => {
    if (!caregiverUnlocked || isReorderMode) {
      return;
    }

    suppressTapAfterLongPressRef.current = true;
    setEditorTargetTileId(tileId);
    navigate('editor');
    setTimeout(() => {
      suppressTapAfterLongPressRef.current = false;
    }, 0);
  };

  const onToggleReorderMode = () => {
    if (!caregiverUnlocked) {
      return;
    }

    clearBoardDragState();
    clearPendingReorderTouch();
    setTileDragError(null);

    if (!isReorderMode) {
      const nextIds = tiles.map((tile) => tile.id);
      reorderTileIdsRef.current = nextIds;
      setReorderTileIds(nextIds);
    }

    setIsReorderMode((current) => !current);
  };

  const onCaregiverButtonPress = () => {
    if (caregiverUnlocked) {
      clearBoardDragState();
      clearPendingReorderTouch();
      setTileDragError(null);
      setIsReorderMode(false);
      lockCaregiver();
      return;
    }

    onOpenCaregiver();
  };

  const onArchiveButtonPress = () => {
    if (!caregiverUnlocked) {
      return;
    }

    clearBoardDragState();
    clearPendingReorderTouch();
    setTileDragError(null);
    setIsReorderMode(false);
    onOpenArchive();
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
            <Text style={styles.actionText}>Řekni</Text>
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
            <Text style={[styles.actionText, styles.clearText]}>Smazat</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={caregiverUnlocked ? 'Zamknout režim pečovatele' : 'Odemknout režim pečovatele'}
            onPress={onCaregiverButtonPress}
            style={({ pressed }) => [
              styles.actionButton,
              styles.caregiverButton,
              caregiverUnlocked && styles.caregiverButtonUnlocked,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={[styles.actionText, styles.caregiverText, caregiverUnlocked && styles.caregiverTextUnlocked]}>
              {caregiverUnlocked ? 'ZAMK.' : 'PIN'}
            </Text>
          </Pressable>

          {caregiverUnlocked ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isReorderMode ? 'Ukončit přesun dlaždic' : 'Zapnout přesun dlaždic'}
                onPress={onToggleReorderMode}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.reorderModeButton,
                  isReorderMode && styles.reorderModeButtonActive,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Text style={[styles.actionText, styles.reorderModeText, isReorderMode && styles.reorderModeTextActive]}>
                  {isReorderMode ? 'HOTOVO' : 'PŘESUN'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Otevřít archiv smazaných dlaždic"
                onPress={onArchiveButtonPress}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.clearButton,
                  pressed && styles.actionButtonPressed,
                ]}
              >
                <Text style={[styles.actionText, styles.clearText]}>ARCH.</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.editorHintWrap}>
        <Text style={styles.editorHint}>
          {!caregiverUnlocked
            ? 'PIN odemyká režim pečovatele. Dlaždice dál fungují na mluvení.'
            : isReorderMode
              ? 'Režim přesunu: podrž dlaždici a táhni. Ostatní se přeskládají živě.'
              : 'Režim pečovatele aktivní: podrž dlaždici pro úpravu, archiv vrací smazané položky.'}
        </Text>
        {tileDragError ? <Text style={styles.editorHintError}>{tileDragError}</Text> : null}
      </View>

      <View style={styles.boardArea}>
        <View
          style={styles.grid}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width;
            if (nextWidth > 0 && Math.abs(nextWidth - gridWidth) > 1) {
              setGridWidth(nextWidth);
            }
          }}
          {...(isReorderMode ? reorderGridResponder.panHandlers : {})}
        >
          {orderedTiles.map((tile, index) => {
            const colors = CATEGORY_COLORS[tile.category];
            const highContrast = settings?.highContrast ?? false;
            const isDraggedTile = activeDrag?.tileId === tile.id;

            if (isReorderMode) {
              return (
                <View
                  key={tile.id}
                  onTouchStart={(event) => {
                    beginReorderTouch(tile.id, index, event.nativeEvent.pageX, event.nativeEvent.pageY);
                  }}
                  onTouchEnd={() => {
                    endReorderTouch();
                  }}
                  onTouchCancel={() => {
                    endReorderTouch();
                  }}
                  style={[
                    styles.tile,
                    {
                      width: tileSize,
                      height: tileSize,
                      backgroundColor: highContrast ? '#FFFFFF' : colors.background,
                      borderColor: highContrast ? '#111827' : colors.border,
                    },
                    isDraggedTile && styles.tilePlaceholder,
                  ]}
                >
                  <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                  {showLabels ? <Text style={styles.tileLabel}>{tile.labelCs}</Text> : null}
                </View>
              );
            }

            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={`Řekni ${tile.labelCs}`}
                onPress={() => onTilePress(tile.id)}
                onLongPress={() => onTileLongPress(tile.id)}
                delayLongPress={250}
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
                {showLabels ? <Text style={styles.tileLabel}>{tile.labelCs}</Text> : null}
              </Pressable>
            );
          })}

          {isReorderMode && activeDrag && draggedTile ? (
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
              {showLabels ? <Text style={styles.tileLabel}>{draggedTile.labelCs}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
};
