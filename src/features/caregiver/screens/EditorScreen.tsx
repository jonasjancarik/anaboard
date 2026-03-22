import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_COLORS, SPEECH_MODE_LABELS } from '../../../shared/constants/defaults';
import { APP_THEME } from '../../../shared/constants/theme';
import type { Category, SpeechMode } from '../../../shared/types/domain';
import { useAppStore } from '../../../store/useAppStore';
import { recordingService } from '../../speech/recordingService';

type EditorScreenProps = {
  onBack: () => void;
};

const categories: Category[] = ['needs', 'feelings', 'social', 'food'];
const speechModes: SpeechMode[] = ['tts', 'recording_with_tts_fallback', 'recording_only'];

export const EditorScreen = ({ onBack }: EditorScreenProps) => {
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

    Alert.alert('Smazat vybranou dlaždici?', 'Dlaždice zmizí z tabule a zůstane dostupná v archivu.', [
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
        <View style={styles.topButtonPlaceholder} />
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
                Po smazání se vrátíš na tabuli. Obnovu najdeš v archivu, přesuny řeš jen mimo tento screen.
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
    backgroundColor: APP_THEME.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  topButton: {
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  topButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  topButtonPlaceholder: {
    minWidth: 86,
  },
  neutralButton: {
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
  },
  neutralButtonText: {
    color: APP_THEME.text,
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
    borderRadius: 22,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  editorPanelContent: {
    padding: 16,
    paddingBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: APP_THEME.text,
    marginBottom: 10,
  },
  tilePreview: {
    borderWidth: 1.5,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    marginBottom: 6,
  },
  tilePreviewEmoji: {
    fontSize: 32,
  },
  tilePreviewTextWrap: {
    flex: 1,
  },
  tilePreviewLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  tilePreviewSub: {
    fontSize: 13,
    color: APP_THEME.textMuted,
    marginTop: 4,
  },
  inputLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: APP_THEME.text,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: APP_THEME.border,
    borderRadius: 14,
    backgroundColor: APP_THEME.surfaceTint,
    minHeight: 48,
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
    borderWidth: 1,
    borderColor: APP_THEME.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: APP_THEME.surfaceTint,
  },
  chipSelected: {
    borderColor: APP_THEME.primary,
    backgroundColor: APP_THEME.primarySoft,
  },
  chipText: {
    fontWeight: '700',
    color: APP_THEME.text,
  },
  recordingInfo: {
    color: APP_THEME.textMuted,
  },
  error: {
    color: APP_THEME.dangerBorder,
    marginTop: 6,
    fontWeight: '700',
  },
  recordingActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  bottomActions: {
    marginTop: 16,
    gap: 10,
  },
  actionButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
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
    borderColor: APP_THEME.successBorder,
    backgroundColor: APP_THEME.success,
  },
  stopButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.danger,
  },
  saveButton: {
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primary,
  },
  deleteTileButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.danger,
  },
  emptyText: {
    color: APP_THEME.textMuted,
    fontWeight: '700',
    lineHeight: 20,
  },
  helperText: {
    marginTop: 6,
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
