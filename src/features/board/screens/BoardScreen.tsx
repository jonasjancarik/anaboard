import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef } from 'react';
import {
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
  const { width } = useWindowDimensions();

  const tiles = useAppStore((state) => state.tiles);
  const sentence = useAppStore((state) => state.sentence);
  const clipsById = useAppStore((state) => state.clipsById);
  const settings = useAppStore((state) => state.settings);
  const addTileToSentence = useAppStore((state) => state.addTileToSentence);
  const removeSentenceToken = useAppStore((state) => state.removeSentenceToken);
  const clearSentence = useAppStore((state) => state.clearSentence);
  const setSpeaking = useAppStore((state) => state.setSpeaking);
  const showLabels = settings?.showLabels ?? false;

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
            accessibilityLabel="Režim pečovatele"
            onPress={onOpenCaregiver}
            style={({ pressed }) => [styles.actionButton, styles.caregiverButton, pressed && styles.actionButtonPressed]}
          >
            <Text style={[styles.actionText, styles.caregiverText]}>PIN</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.boardArea}>
        <View style={styles.grid}>
          {tiles.map((tile) => {
            const colors = CATEGORY_COLORS[tile.category];
            const highContrast = settings?.highContrast ?? false;

            return (
              <Pressable
                key={tile.id}
                accessibilityRole="button"
                accessibilityLabel={`Řekni ${tile.labelCs}`}
                onPress={() => onTilePress(tile.id)}
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
