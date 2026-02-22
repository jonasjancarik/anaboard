import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { speechEngine, buildSpeechSegments } from '../../speech/speechEngine';
import { CATEGORY_COLORS } from '../../../shared/constants/defaults';
import type { SentenceToken } from '../../../shared/types/domain';
import { createId } from '../../../shared/utils/id';
import { useAppStore, selectTilesById } from '../../../store/useAppStore';

type BoardScreenProps = {
  onOpenCaregiver: () => void;
};

const GRID_COLUMNS = 4;
const GRID_GAP = 10;
const LAYOUT_PADDING = 12;
const MAX_TILE_SIZE = 180;
const MIN_TILE_SIZE = 58;

export const BoardScreen = ({ onOpenCaregiver }: BoardScreenProps) => {
  const sentenceScrollRef = useRef<ScrollView>(null);
  const suppressTapAfterLongPressRef = useRef(false);
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
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const [draggingStartIndex, setDraggingStartIndex] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [tileDragError, setTileDragError] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);

  const tilesById = useMemo(() => selectTilesById(tiles), [tiles]);

  const tileSize = useMemo(() => {
    const maxGridWidth = 760;
    const availableWidth = Math.min(width - LAYOUT_PADDING * 2, maxGridWidth);
    const rawTileSize = (availableWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

    return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, Math.floor(rawTileSize)));
  }, [width]);

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

  const clearBoardDragState = () => {
    setDraggingTileId(null);
    setDraggingStartIndex(null);
    setDragOffsetX(0);
    setDragOffsetY(0);
  };

  const finishBoardDrag = useCallback(
    async (dx: number, dy: number) => {
      const tileId = draggingTileId;
      const startIndex = draggingStartIndex;

      clearBoardDragState();

      setTimeout(() => {
        suppressTapAfterLongPressRef.current = false;
      }, 0);

      if (!tileId || startIndex === null) {
        return;
      }

      const dragDistance = Math.hypot(dx, dy);
      if (dragDistance < 12) {
        return;
      }

      const positionStep = tileSize + GRID_GAP;
      const columnDelta = Math.round(dx / positionStep);
      const rowDelta = Math.round(dy / positionStep);
      const slotDelta = rowDelta * GRID_COLUMNS + columnDelta;
      const targetIndex = Math.max(0, Math.min(tiles.length - 1, startIndex + slotDelta));

      if (targetIndex === startIndex) {
        return;
      }

      try {
        await moveTile(tileId, targetIndex);
      } catch (error) {
        setTileDragError(error instanceof Error ? error.message : 'Přesun dlaždice se nepovedl');
      }
    },
    [draggingStartIndex, draggingTileId, moveTile, tileSize, tiles.length]
  );

  const boardTileDragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => draggingTileId !== null,
        onStartShouldSetPanResponderCapture: () => draggingTileId !== null,
        onMoveShouldSetPanResponder: () => draggingTileId !== null,
        onMoveShouldSetPanResponderCapture: () => draggingTileId !== null,
        onPanResponderMove: (_event, gestureState) => {
          if (!draggingTileId) {
            return;
          }

          setDragOffsetX(gestureState.dx);
          setDragOffsetY(gestureState.dy);
        },
        onPanResponderRelease: (_event, gestureState) => {
          void finishBoardDrag(gestureState.dx, gestureState.dy);
        },
        onPanResponderTerminate: (_event, gestureState) => {
          void finishBoardDrag(gestureState.dx, gestureState.dy);
        },
      }),
    [draggingTileId, finishBoardDrag]
  );

  const onTileLongPress = (tileId: string) => {
    if (!caregiverUnlocked) {
      return;
    }

    suppressTapAfterLongPressRef.current = true;

    if (!isReorderMode) {
      setEditorTargetTileId(tileId);
      navigate('editor');
      return;
    }

    const startIndex = tiles.findIndex((tile) => tile.id === tileId);
    if (startIndex < 0) {
      return;
    }

    setTileDragError(null);
    setDraggingTileId(tileId);
    setDraggingStartIndex(startIndex);
    setDragOffsetX(0);
    setDragOffsetY(0);
  };

  const onToggleReorderMode = () => {
    if (!caregiverUnlocked) {
      return;
    }

    clearBoardDragState();
    setTileDragError(null);
    setIsReorderMode((current) => !current);
  };

  const onCaregiverButtonPress = () => {
    if (caregiverUnlocked) {
      clearBoardDragState();
      setTileDragError(null);
      setIsReorderMode(false);
      lockCaregiver();
      return;
    }

    onOpenCaregiver();
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
          ) : null}
        </View>
      </View>

      <View style={styles.editorHintWrap}>
        <Text style={styles.editorHint}>
          {!caregiverUnlocked
            ? 'PIN odemyká režim pečovatele. Dlaždice dál fungují na mluvení.'
            : isReorderMode
              ? 'Režim přesunu: podrž a táhni dlaždici na nové místo.'
              : 'Režim pečovatele aktivní: podrž dlaždici pro její úpravu.'}
        </Text>
        {tileDragError ? <Text style={styles.editorHintError}>{tileDragError}</Text> : null}
      </View>

      <View style={styles.boardArea}>
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const colors = CATEGORY_COLORS[tile.category];
            const highContrast = settings?.highContrast ?? false;
            const isDraggingTile = tile.id === draggingTileId;

            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={`Řekni ${tile.labelCs}`}
                onPress={() => onTilePress(tile.id)}
                onLongPress={() => onTileLongPress(tile.id)}
                delayLongPress={350}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: highContrast ? '#FFFFFF' : colors.background,
                    borderColor: highContrast ? '#111827' : colors.border,
                  },
                  isDraggingTile && [styles.tileDragging, { transform: [{ translateX: dragOffsetX }, { translateY: dragOffsetY }] }],
                  pressed && !isDraggingTile && styles.tilePressed,
                ]}
                {...(isDraggingTile ? boardTileDragResponder.panHandlers : {})}
              >
                <Text style={styles.tileEmoji}>{tile.emoji}</Text>
                {showLabels ? <Text style={styles.tileLabel}>{tile.labelCs}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  topRow: {
    paddingTop: 8,
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 10,
  },
  sentenceBox: {
    flex: 1,
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C6D5E7',
    backgroundColor: '#EAF2FB',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  sentenceContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  placeholderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#4E617A',
    paddingHorizontal: 8,
  },
  token: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DFEB',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tokenEmojiOnly: {
    width: 46,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  tokenPressed: {
    transform: [{ scale: 0.97 }],
  },
  tokenEmoji: {
    fontSize: 20,
  },
  tokenText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#10213A',
  },
  actions: {
    width: 100,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  speakButton: {
    backgroundColor: '#26A949',
    borderColor: '#1A8939',
  },
  clearButton: {
    backgroundColor: '#FFF0F0',
    borderColor: '#EEB0B2',
  },
  caregiverButton: {
    backgroundColor: '#EAE7FF',
    borderColor: '#9E93FF',
  },
  caregiverButtonUnlocked: {
    backgroundColor: '#E8F8EC',
    borderColor: '#8CD1A0',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  clearText: {
    color: '#B23845',
  },
  caregiverText: {
    color: '#3D338A',
  },
  caregiverTextUnlocked: {
    color: '#1F6E39',
  },
  reorderModeButton: {
    backgroundColor: '#FFF3E5',
    borderColor: '#E8B37A',
  },
  reorderModeButtonActive: {
    backgroundColor: '#FFD6A6',
    borderColor: '#D6882B',
  },
  reorderModeText: {
    color: '#8A541D',
  },
  reorderModeTextActive: {
    color: '#6C3D11',
  },
  editorHintWrap: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 2,
  },
  editorHint: {
    textAlign: 'center',
    color: '#4B607E',
    fontSize: 13,
    fontWeight: '600',
  },
  editorHintError: {
    marginTop: 4,
    textAlign: 'center',
    color: '#A62839',
    fontSize: 12,
    fontWeight: '700',
  },
  boardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: LAYOUT_PADDING,
  },
  grid: {
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: GRID_GAP,
  },
  tile: {
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#192233',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 4,
  },
  tilePressed: {
    transform: [{ scale: 0.93 }],
    opacity: 0.9,
  },
  tileDragging: {
    zIndex: 20,
    elevation: 10,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  tileEmoji: {
    fontSize: 34,
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#0E203A',
  },
});
