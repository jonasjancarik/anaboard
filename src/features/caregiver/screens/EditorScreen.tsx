import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const updateTileDraft = useAppStore((state) => state.updateTileDraft);
  const deleteTile = useAppStore((state) => state.deleteTile);
  const saveClip = useAppStore((state) => state.saveClip);
  const deleteClip = useAppStore((state) => state.deleteClip);
  const editorTargetTileId = useAppStore((state) => state.editorTargetTileId);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);

  const [labelCs, setLabelCs] = useState('');
  const [emoji, setEmoji] = useState('');
  const [category, setCategory] = useState<Category>('needs');
  const [speechMode, setSpeechMode] = useState<SpeechMode>('tts');
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [tileActionError, setTileActionError] = useState<string | null>(null);

  useEffect(() => {
    if (tiles.length === 0) {
      if (editorTargetTileId !== null) {
        setEditorTargetTileId(null);
      }
      return;
    }

    if (!editorTargetTileId || !tiles.some((tile) => tile.id === editorTargetTileId)) {
      setEditorTargetTileId(tiles[0].id);
    }
  }, [editorTargetTileId, setEditorTargetTileId, tiles]);

  const selectedTile = editorTargetTileId ? tiles.find((tile) => tile.id === editorTargetTileId) ?? null : null;

  useEffect(() => {
    if (!selectedTile) {
      return;
    }

    setLabelCs(selectedTile.labelCs);
    setEmoji(selectedTile.emoji);
    setCategory(selectedTile.category);
    setSpeechMode(selectedTile.speechMode);
    setRecordingError(null);
    setTileActionError(null);
  }, [selectedTile]);

  const selectedClip = selectedTile?.audioClipId ? clipsById[selectedTile.audioClipId] : undefined;
  const previewColors = CATEGORY_COLORS[category];
  const previewLabel = selectedTile ? labelCs.trim() || selectedTile.labelCs : '';
  const previewEmoji = selectedTile ? emoji.trim() || selectedTile.emoji : '';

  const buildTileUpdatePayload = () => {
    if (!selectedTile) {
      return null;
    }

    return {
      labelCs: labelCs.trim() || selectedTile.labelCs,
      emoji: emoji.trim() || selectedTile.emoji,
      category,
      speechMode,
    };
  };

  const saveTile = async () => {
    if (!selectedTile) {
      return;
    }

    const payload = buildTileUpdatePayload();
    if (!payload) {
      return;
    }

    setIsSaving(true);
    setTileActionError(null);

    try {
      await updateTileDraft(selectedTile.id, payload);
    } catch (error) {
      setTileActionError(error instanceof Error ? error.message : 'Dlaždici nešlo uložit');
    } finally {
      setIsSaving(false);
    }
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

    setRecordingError(null);

    try {
      await deleteClip(selectedTile.id);
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : 'Nahrávku nešlo smazat');
    }
  };

  const deleteSelectedTile = async () => {
    if (!selectedTile) {
      return;
    }

    setTileActionError(null);

    try {
      await deleteTile(selectedTile.id);
      setEditorTargetTileId(null);
      onBack();
    } catch (error) {
      setTileActionError(error instanceof Error ? error.message : 'Dlaždici nešlo smazat');
    }
  };

  const handleDeleteTile = () => {
    if (!selectedTile) {
      return;
    }

    Alert.alert('Smazat vybranou dlaždici?', 'Dlaždice bude odstraněna z tabule.', [
      {
        text: 'Zrušit',
        style: 'cancel',
      },
      {
        text: 'Smazat',
        style: 'destructive',
        onPress: () => {
          void deleteSelectedTile();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.topBar}>
        <Pressable style={[styles.topButton, styles.neutralButton]} onPress={onBack}>
          <Text style={[styles.topButtonText, styles.neutralButtonText]}>Zpět</Text>
        </Pressable>
        <Text style={styles.title}>Upravit dlaždici</Text>
        <Pressable style={[styles.topButton, styles.settingsButton]} onPress={onOpenSettings}>
          <Text style={styles.topButtonText}>Nastavení</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <ScrollView
          style={styles.editorPanel}
          contentContainerStyle={styles.editorPanelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {selectedTile ? (
            <>
              <Text style={styles.sectionTitle}>Vybraná dlaždice</Text>

              <View
                style={[
                  styles.tilePreview,
                  {
                    backgroundColor: previewColors.background,
                    borderColor: previewColors.border,
                  },
                ]}
              >
                <Text style={styles.tilePreviewEmoji}>{previewEmoji || '⬜️'}</Text>
                <View style={styles.tilePreviewTextWrap}>
                  <Text style={styles.tilePreviewLabel}>{previewLabel}</Text>
                  <Text style={styles.tilePreviewSub}>Pořadí měň na tabuli přes režim PŘESUN.</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Text</Text>
              <TextInput value={labelCs} onChangeText={setLabelCs} style={styles.input} />

              <Text style={styles.inputLabel}>Emoji</Text>
              <TextInput value={emoji} onChangeText={setEmoji} style={styles.input} maxLength={4} />

              <Text style={styles.inputLabel}>Kategorie</Text>
              <View style={styles.chipWrap}>
                {categories.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setCategory(item)}
                    style={[styles.chip, category === item && styles.chipSelected]}
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
                    style={[styles.chip, speechMode === mode && styles.chipSelected]}
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

              <Text style={styles.inputLabel}>Dlaždice</Text>
              <View style={styles.bottomActions}>
                <Pressable style={[styles.actionButton, styles.saveButton]} onPress={saveTile} disabled={isSaving}>
                  <Text style={styles.actionButtonText}>{isSaving ? 'Ukládám...' : 'Uložit změny dlaždice'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.deleteTileButton]}
                  onPress={handleDeleteTile}
                  disabled={tiles.length <= 1}
                >
                  <Text style={styles.actionButtonText}>Smazat vybranou dlaždici</Text>
                </Pressable>
              </View>

              <Text style={styles.helperText}>
                Po smazání se vrátíš na tabuli. Přesuny se řeší jen mimo tento screen.
              </Text>
              {tileActionError ? <Text style={styles.error}>{tileActionError}</Text> : null}
            </>
          ) : (
            <Text style={styles.emptyText}>Dlaždice není vybraná. Otevři editor dlouhým podržením dlaždice na tabuli.</Text>
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
    padding: 12,
  },
  editorPanel: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D2DAEA',
    backgroundColor: '#FFFFFF',
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
  tilePreview: {
    borderWidth: 2,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    marginBottom: 4,
  },
  tilePreviewEmoji: {
    fontSize: 32,
  },
  tilePreviewTextWrap: {
    flex: 1,
  },
  tilePreviewLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1D2D49',
  },
  tilePreviewSub: {
    fontSize: 13,
    color: '#4E6180',
    marginTop: 2,
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
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    textAlign: 'center',
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
  deleteTileButton: {
    borderColor: '#A61D32',
    backgroundColor: '#CA2943',
  },
  emptyText: {
    color: '#5E7390',
    fontWeight: '700',
    lineHeight: 20,
  },
  helperText: {
    marginTop: 6,
    color: '#4F6481',
    fontSize: 13,
    lineHeight: 18,
  },
});
