import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

type Category = 'needs' | 'feelings' | 'social' | 'food';

type BoardItem = {
  id: string;
  emoji: string;
  label: string;
  category: Category;
};

const BOARD_ITEMS: BoardItem[] = [
  { id: 'yes', emoji: '✅', label: 'Ano', category: 'needs' },
  { id: 'no', emoji: '❌', label: 'Ne', category: 'needs' },
  { id: 'help', emoji: '🆘', label: 'Pomoc', category: 'needs' },
  { id: 'toilet', emoji: '🚽', label: 'Toaleta', category: 'needs' },
  { id: 'happy', emoji: '😊', label: 'Veselý', category: 'feelings' },
  { id: 'sad', emoji: '😢', label: 'Smutný', category: 'feelings' },
  { id: 'sleep', emoji: '😴', label: 'Spát', category: 'feelings' },
  { id: 'sick', emoji: '🤒', label: 'Nemocný', category: 'feelings' },
  { id: 'mom', emoji: '👩', label: 'Máma', category: 'social' },
  { id: 'dad', emoji: '👨', label: 'Táta', category: 'social' },
  { id: 'cat', emoji: '🐱', label: 'Kočka', category: 'social' },
  { id: 'home', emoji: '🏠', label: 'Domů', category: 'social' },
  { id: 'eat', emoji: '😋', label: 'Jíst', category: 'food' },
  { id: 'drink', emoji: '🥤', label: 'Pít', category: 'food' },
  { id: 'more', emoji: '➕', label: 'Více', category: 'food' },
  { id: 'done', emoji: '🔚', label: 'Hotovo', category: 'food' },
];

const CATEGORY_COLORS: Record<Category, { background: string; border: string }> = {
  needs: { background: '#D6EFFF', border: '#1D8FE1' },
  feelings: { background: '#FFECA8', border: '#D49300' },
  social: { background: '#FFD7EE', border: '#CB2B7A' },
  food: { background: '#D8F7D9', border: '#2DAA48' },
};

const GRID_COLUMNS = 4;
const GRID_GAP = 10;
const LAYOUT_PADDING = 12;
const MAX_TILE_SIZE = 180;
const MIN_TILE_SIZE = 58;

const BASE_SPEECH_OPTIONS: Speech.SpeechOptions = {
  language: 'cs-CZ',
  pitch: 1,
  rate: 0.86,
};

export default function App() {
  const [sentence, setSentence] = useState<BoardItem[]>([]);
  const [speechOptions, setSpeechOptions] =
    useState<Speech.SpeechOptions>(BASE_SPEECH_OPTIONS);
  const sentenceScrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const androidTopInset =
    Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0;

  useEffect(() => {
    let active = true;

    const loadCzechVoice = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const czechVoice = voices.find((voice) => voice.language.toLowerCase().startsWith('cs'));
        if (!active || !czechVoice) {
          return;
        }

        setSpeechOptions({
          ...BASE_SPEECH_OPTIONS,
          language: czechVoice.language,
          voice: czechVoice.identifier,
        });
      } catch {
        // Keep base options if voice lookup fails.
      }
    };

    void loadCzechVoice();

    return () => {
      active = false;
    };
  }, []);

  const tileSize = useMemo(() => {
    const maxGridWidth = 760;
    const availableWidth = Math.min(width - LAYOUT_PADDING * 2, maxGridWidth);
    const rawTileSize = (availableWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

    return Math.max(MIN_TILE_SIZE, Math.min(MAX_TILE_SIZE, Math.floor(rawTileSize)));
  }, [width]);

  const speakText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    void Speech.stop();
    Speech.speak(trimmed, speechOptions);
  };

  const addToSentence = (item: BoardItem) => {
    speakText(item.label);
    setSentence((current) => [...current, item]);
  };

  const removeFromSentence = (index: number) => {
    setSentence((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const clearSentence = () => {
    void Speech.stop();
    setSentence([]);
  };

  const speakSentence = () => {
    if (sentence.length === 0) {
      return;
    }

    const phrase = sentence.map((item) => item.label).join(' ');
    speakText(phrase);
  };

  return (
    <SafeAreaView style={[styles.screen, androidTopInset > 0 && { paddingTop: androidTopInset }]}>
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
              sentence.map((item, index) => (
                <Pressable
                  key={`${item.id}-${index}`}
                  onPress={() => removeFromSentence(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Odebrat ${item.label}`}
                  style={({ pressed }) => [styles.token, pressed && styles.tokenPressed]}
                >
                  <Text style={styles.tokenEmoji}>{item.emoji}</Text>
                  <Text style={styles.tokenText}>{item.label}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Přečíst větu"
            onPress={speakSentence}
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
            onPress={clearSentence}
            style={({ pressed }) => [
              styles.actionButton,
              styles.clearButton,
              pressed && styles.actionButtonPressed,
            ]}
          >
            <Text style={[styles.actionText, styles.clearText]}>Smazat</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.boardArea}>
        <View style={styles.grid}>
          {BOARD_ITEMS.map((item) => {
            const colors = CATEGORY_COLORS[item.category];

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Řekni ${item.label}`}
                onPress={() => addToSentence(item)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                  pressed && styles.tilePressed,
                ]}
              >
                <Text style={styles.tileEmoji}>{item.emoji}</Text>
                <Text style={styles.tileLabel}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

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
    width: 92,
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
  actionText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  clearText: {
    color: '#B23845',
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
