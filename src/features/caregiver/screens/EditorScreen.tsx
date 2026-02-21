import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_COLORS, SPEECH_MODE_LABELS } from '../../../shared/constants/defaults';
import type { Category, SpeechMode } from '../../../shared/types/domain';
import { useAppStore } from '../../../store/useAppStore';
import { recordingService } from '../../speech/recordingService';

type EditorScreenProps = {
  onBack: () => void;
  onOpenSettings: () => void;
};

const categories: Category[] = ['needs', 'feelings', 'social', 'food'];
const speechModes: SpeechMode[] = ['tts', 'recording_with_tts_fallback', 'recording_only'];

export const EditorScreen = ({ onBack, onOpenSettings }: EditorScreenProps) => {
  const { width } = useWindowDimensions();
  const isCompact = width < 900;

  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const updateTileDraft = useAppStore((state) => state.updateTileDraft);
  const moveTile = useAppStore((state) => state.moveTile);
  const saveClip = useAppStore((state) => state.saveClip);
  const deleteClip = useAppStore((state) => state.deleteClip);
  const resetBoard = useAppStore((state) => state.resetBoard);
  const duplicateBoard = useAppStore((state) => state.duplicateBoard);

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [labelCs, setLabelCs] = useState('');
  const [emoji, setEmoji] = useState('');
  const [category, setCategory] = useState<Category>('needs');
  const [speechMode, setSpeechMode] = useState<SpeechMode>('tts');
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  useEffect(() => {
    if (tiles.length === 0) {
      setSelectedTileId(null);
      return;
    }

    if (!selectedTileId || !tiles.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(tiles[0].id);
    }
  }, [selectedTileId, tiles]);

  const selectedTile = useMemo(
    () => tiles.find((tile) => tile.id === selectedTileId) ?? null,
    [selectedTileId, tiles]
  );

  useEffect(() => {
    if (!selectedTile) {
      return;
    }

    setLabelCs(selectedTile.labelCs);
    setEmoji(selectedTile.emoji);
    setCategory(selectedTile.category);
    setSpeechMode(selectedTile.speechMode);
  }, [selectedTile]);

  const selectedClip = selectedTile?.audioClipId ? clipsById[selectedTile.audioClipId] : undefined;

  const saveTile = async () => {
    if (!selectedTile) {
      return;
    }

    setIsSaving(true);
    try {
      await updateTileDraft(selectedTile.id, {
        labelCs: labelCs.trim() || selectedTile.labelCs,
        emoji: emoji.trim() || selectedTile.emoji,
        category,
        speechMode,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const moveSelectedTile = async (delta: number) => {
    if (!selectedTile) {
      return;
    }

    await moveTile(selectedTile.id, selectedTile.position + delta);
  };

  const handleRecordToggle = async () => {
    if (!selectedTile) {
      return;
    }

    setRecordingError(null);

    if (!isRecording) {
      try {
        await recordingService.start();
        setIsRecording(true);
      } catch (error) {
        setRecordingError(error instanceof Error ? error.message : 'Nahrávání se nepovedlo');
      }
      return;
    }

    try {
      const recording = await recordingService.stop();
      setIsRecording(false);

      if (!recording) {
        setRecordingError('Nahrávka je prázdná');
        return;
      }

      await saveClip(selectedTile.id, {
        localUri: recording.uri,
        durationMs: recording.durationMs,
        format: 'm4a',
      });
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : 'Nahrávání se nepovedlo');
      setIsRecording(false);
    }
  };

  const handleDeleteClip = async () => {
    if (!selectedTile) {
      return;
    }

    await deleteClip(selectedTile.id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={[styles.topButton, styles.neutralButton]} onPress={onBack}>
          <Text style={[styles.topButtonText, styles.neutralButtonText]}>Zpět</Text>
        </Pressable>
        <Text style={[styles.title, isCompact && styles.titleCompact]}>Editor tabule</Text>
        <Pressable style={[styles.topButton, styles.settingsButton]} onPress={onOpenSettings}>
          <Text style={styles.topButtonText}>{isCompact ? 'Nast.' : 'Nastavení'}</Text>
        </Pressable>
      </View>

      <View style={[styles.content, isCompact && styles.contentCompact]}>
        <ScrollView
          style={[styles.leftPanel, isCompact && styles.leftPanelCompact]}
          contentContainerStyle={styles.leftPanelContent}
          showsVerticalScrollIndicator={false}
        >
          {tiles.map((tile) => {
            const colors = CATEGORY_COLORS[tile.category];
            const isSelected = tile.id === selectedTileId;
            return (
              <Pressable
                key={tile.id}
                onPress={() => setSelectedTileId(tile.id)}
                style={[
                  styles.tileRow,
                  {
                    backgroundColor: colors.background,
                    borderColor: isSelected ? '#1E293B' : colors.border,
                  },
                ]}
              >
                <Text style={styles.tileRowEmoji}>{tile.emoji}</Text>
                <View style={styles.tileRowTextWrap}>
                  <Text style={styles.tileRowLabel}>{tile.labelCs}</Text>
                  <Text style={styles.tileRowSub}>Pozice: {tile.position + 1}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          style={[styles.editorPanel, isCompact && styles.editorPanelCompact]}
          contentContainerStyle={styles.editorPanelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {selectedTile ? (
            <>
              <Text style={styles.sectionTitle}>Vybraný tile</Text>

              <Text style={styles.inputLabel}>Text</Text>
              <TextInput value={labelCs} onChangeText={setLabelCs} style={styles.input} />

              <Text style={styles.inputLabel}>Emoji</Text>
              <TextInput value={emoji} onChangeText={setEmoji} style={styles.input} maxLength={3} />

              <Text style={styles.inputLabel}>Kategorie</Text>
              <View style={styles.chipWrap}>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    style={[
                      styles.chip,
                      category === item && styles.chipSelected,
                    ]}
                  >
                    <Text style={styles.chipText}>{item}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Režim řeči</Text>
              <View style={styles.chipWrap}>
                {speechModes.map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setSpeechMode(mode)}
                    style={[
                      styles.chip,
                      speechMode === mode && styles.chipSelected,
                    ]}
                  >
                    <Text style={styles.chipText}>{SPEECH_MODE_LABELS[mode]}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Nahrávka</Text>
              <Text style={styles.recordingInfo}>
                {selectedClip ? `Délka: ${Math.round(selectedClip.durationMs / 1000)}s` : 'Bez nahrávky'}
              </Text>
              {recordingError ? <Text style={styles.error}>{recordingError}</Text> : null}

              <View style={styles.recordingActions}>
                <Pressable
                  style={[styles.actionButton, isRecording ? styles.stopButton : styles.recordButton]}
                  onPress={handleRecordToggle}
                >
                  <Text style={styles.actionButtonText}>{isRecording ? 'Stop' : 'Nahrát'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.neutralButton]}
                  onPress={handleDeleteClip}
                  disabled={!selectedClip}
                >
                  <Text style={[styles.actionButtonText, styles.neutralButtonText]}>Smazat</Text>
                </Pressable>
              </View>

              <View style={styles.reorderRow}>
                <Pressable style={styles.reorderButton} onPress={() => moveSelectedTile(-1)}>
                  <Text style={styles.reorderText}>Posun -1</Text>
                </Pressable>
                <Pressable style={styles.reorderButton} onPress={() => moveSelectedTile(1)}>
                  <Text style={styles.reorderText}>Posun +1</Text>
                </Pressable>
                <Pressable style={styles.reorderButton} onPress={() => moveSelectedTile(-4)}>
                  <Text style={styles.reorderText}>Řádek nahoru</Text>
                </Pressable>
                <Pressable style={styles.reorderButton} onPress={() => moveSelectedTile(4)}>
                  <Text style={styles.reorderText}>Řádek dolů</Text>
                </Pressable>
              </View>

              <View style={styles.bottomActions}>
                <Pressable
                  style={[styles.actionButton, styles.saveButton]}
                  onPress={saveTile}
                  disabled={isSaving}
                >
                  <Text style={styles.actionButtonText}>{isSaving ? 'Ukládám...' : 'Uložit tile'}</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.warningButton]} onPress={resetBoard}>
                  <Text style={styles.actionButtonText}>Reset tabule</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.copyButton]} onPress={duplicateBoard}>
                  <Text style={styles.actionButtonText}>Duplikovat tabuli</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.emptyText}>Není vybraný tile</Text>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    color: '#1F2E48',
  },
  titleCompact: {
    fontSize: 20,
  },
  topButton: {
    borderRadius: 10,
    borderWidth: 2,
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  topButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  settingsButton: {
    borderColor: '#7F5EFF',
    backgroundColor: '#7F5EFF',
  },
  neutralButton: {
    borderColor: '#D2DAEA',
    backgroundColor: '#FFFFFF',
  },
  neutralButtonText: {
    color: '#31405C',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    padding: 12,
    gap: 10,
  },
  contentCompact: {
    flexDirection: 'column',
  },
  leftPanel: {
    width: 260,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D2DAEA',
    backgroundColor: '#FFFFFF',
  },
  leftPanelCompact: {
    width: '100%',
    maxHeight: 360,
  },
  leftPanelContent: {
    padding: 8,
    gap: 8,
  },
  tileRow: {
    borderWidth: 2,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 8,
  },
  tileRowEmoji: {
    fontSize: 24,
  },
  tileRowTextWrap: {
    flex: 1,
  },
  tileRowLabel: {
    fontWeight: '800',
    color: '#1D2D49',
  },
  tileRowSub: {
    fontSize: 12,
    color: '#4E6180',
    marginTop: 2,
  },
  editorPanel: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D2DAEA',
    backgroundColor: '#FFFFFF',
  },
  editorPanelCompact: {
    width: '100%',
  },
  editorPanelContent: {
    padding: 12,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D2E4A',
    marginBottom: 8,
  },
  inputLabel: {
    marginTop: 10,
    marginBottom: 4,
    color: '#334661',
    fontWeight: '700',
  },
  input: {
    borderWidth: 2,
    borderColor: '#CFD8EA',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#CFD8EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F5F8FD',
  },
  chipSelected: {
    borderColor: '#4A5FB8',
    backgroundColor: '#E3EAFF',
  },
  chipText: {
    fontWeight: '700',
    color: '#20314D',
  },
  recordingInfo: {
    color: '#4F6481',
  },
  error: {
    color: '#B3293A',
    marginTop: 4,
    fontWeight: '700',
  },
  recordingActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  reorderRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reorderButton: {
    borderWidth: 2,
    borderColor: '#CCD8ED',
    backgroundColor: '#F5F8FD',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reorderText: {
    fontWeight: '700',
    color: '#243755',
  },
  bottomActions: {
    marginTop: 14,
    gap: 8,
  },
  actionButton: {
    borderRadius: 10,
    borderWidth: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  recordButton: {
    borderColor: '#1E7C34',
    backgroundColor: '#25A545',
  },
  stopButton: {
    borderColor: '#AA1F36',
    backgroundColor: '#D02946',
  },
  saveButton: {
    borderColor: '#2360AF',
    backgroundColor: '#3072CC',
  },
  warningButton: {
    borderColor: '#A86B00',
    backgroundColor: '#DB8C00',
  },
  copyButton: {
    borderColor: '#6E42C6',
    backgroundColor: '#8658E1',
  },
  emptyText: {
    color: '#5E7390',
    fontWeight: '700',
  },
});
