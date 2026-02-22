import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  PanResponder,
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
const TILE_ROW_GAP = 8;
const TILE_DRAG_THRESHOLD_PX = 10;

export const EditorScreen = ({ onBack, onOpenSettings }: EditorScreenProps) => {
  const { width } = useWindowDimensions();
  const isCompact = width < 900;

  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const updateTileDraft = useAppStore((state) => state.updateTileDraft);
  const moveTile = useAppStore((state) => state.moveTile);
  const createTileAfter = useAppStore((state) => state.createTileAfter);
  const deleteTile = useAppStore((state) => state.deleteTile);
  const saveClip = useAppStore((state) => state.saveClip);
  const deleteClip = useAppStore((state) => state.deleteClip);
  const resetBoard = useAppStore((state) => state.resetBoard);
  const duplicateBoard = useAppStore((state) => state.duplicateBoard);
  const editorTargetTileId = useAppStore((state) => state.editorTargetTileId);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);
  const boardName = useAppStore((state) => state.board?.name ?? 'Tabule');

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [labelCs, setLabelCs] = useState('');
  const [emoji, setEmoji] = useState('');
  const [category, setCategory] = useState<Category>('needs');
  const [speechMode, setSpeechMode] = useState<SpeechMode>('tts');
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [tileActionError, setTileActionError] = useState<string | null>(null);
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [tileRowHeight, setTileRowHeight] = useState(56);

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

  useEffect(() => {
    if (!editorTargetTileId) {
      return;
    }

    const hasTarget = tiles.some((tile) => tile.id === editorTargetTileId);
    if (!hasTarget) {
      setEditorTargetTileId(null);
      return;
    }

    setSelectedTileId(editorTargetTileId);
    setEditorTargetTileId(null);
  }, [editorTargetTileId, setEditorTargetTileId, tiles]);

  const selectedClip = selectedTile?.audioClipId ? clipsById[selectedTile.audioClipId] : undefined;

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

  const persistSelectedTileDraft = async () => {
    if (!selectedTile) {
      return;
    }

    const payload = buildTileUpdatePayload();
    if (!payload) {
      return;
    }

    await updateTileDraft(selectedTile.id, payload);
  };

  const saveTile = async () => {
    if (!selectedTile) {
      return;
    }

    setIsSaving(true);
    try {
      await persistSelectedTileDraft();
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

  const handleCreateTile = async () => {
    if (!selectedTile) {
      return;
    }

    setTileActionError(null);

    try {
      const anchorTileId = selectedTile.id;
      await persistSelectedTileDraft();
      const newTileId = await createTileAfter(anchorTileId, {
        labelCs: 'Nová dlaždice',
        emoji: '⭐',
        category,
        speechMode,
      });
      setSelectedTileId(newTileId);
    } catch (error) {
      setTileActionError(error instanceof Error ? error.message : 'Dlaždici nešlo vytvořit');
    }
  };

  const handleDuplicateTile = async () => {
    if (!selectedTile) {
      return;
    }

    setTileActionError(null);

    try {
      const anchorTileId = selectedTile.id;
      const payload = buildTileUpdatePayload();
      if (!payload) {
        return;
      }

      await updateTileDraft(anchorTileId, payload);
      const newTileId = await createTileAfter(anchorTileId, payload);
      setSelectedTileId(newTileId);
    } catch (error) {
      setTileActionError(error instanceof Error ? error.message : 'Dlaždici nešlo duplikovat');
    }
  };

  const deleteSelectedTile = async () => {
    if (!selectedTile) {
      return;
    }

    setTileActionError(null);

    try {
      await deleteTile(selectedTile.id);
      setSelectedTileId(null);
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

  const confirmResetBoard = () => {
    Alert.alert(
      'Obnovit výchozí tabuli?',
      'Aktuální dlaždice se přepíšou výchozí sadou. Tuto akci nelze vrátit.',
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Obnovit',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await resetBoard();
              } catch (error) {
                Alert.alert(
                  'Obnovení se nepovedlo',
                  error instanceof Error ? error.message : 'Nepovedlo se obnovit tabuli'
                );
              }
            })();
          },
        },
      ]
    );
  };

  const confirmDuplicateBoard = () => {
    Alert.alert(
      'Vytvořit kopii tabule?',
      `Aktuální tabule "${boardName}" se zkopíruje a přepne se na novou kopii.`,
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Vytvořit kopii',
          onPress: () => {
            void (async () => {
              try {
                await duplicateBoard();
                Alert.alert('Kopie tabule vytvořena', `Aktivní je nová tabule "${boardName} (kopie)".`);
              } catch (error) {
                Alert.alert(
                  'Kopírování se nepovedlo',
                  error instanceof Error ? error.message : 'Nepovedlo se vytvořit kopii tabule'
                );
              }
            })();
          },
        },
      ]
    );
  };

  const finishTileDrag = useCallback(
    async (dy: number) => {
      if (!draggingTileId || dragStartIndex === null) {
        setDraggingTileId(null);
        setDragStartIndex(null);
        setDragOffsetY(0);
        return;
      }

      const hasMeaningfulMove = Math.abs(dy) >= TILE_DRAG_THRESHOLD_PX;
      const positionStep = Math.max(1, tileRowHeight + TILE_ROW_GAP);
      const slotDelta = hasMeaningfulMove ? Math.round(dy / positionStep) : 0;
      const targetIndex = Math.max(0, Math.min(tiles.length - 1, dragStartIndex + slotDelta));

      setDraggingTileId(null);
      setDragStartIndex(null);
      setDragOffsetY(0);

      if (targetIndex === dragStartIndex) {
        return;
      }

      try {
        await moveTile(draggingTileId, targetIndex);
        setSelectedTileId(draggingTileId);
      } catch (error) {
        setTileActionError(error instanceof Error ? error.message : 'Přesun dlaždice se nepovedl');
      }
    },
    [dragStartIndex, draggingTileId, moveTile, tileRowHeight, tiles.length]
  );

  const tileListDragResponder = useMemo(
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

          setDragOffsetY(gestureState.dy);
        },
        onPanResponderRelease: (_event, gestureState) => {
          void finishTileDrag(gestureState.dy);
        },
        onPanResponderTerminate: (_event, gestureState) => {
          void finishTileDrag(gestureState.dy);
        },
      }),
    [draggingTileId, finishTileDrag]
  );

  const handleTileRowLongPress = (tileId: string) => {
    const startIndex = tiles.findIndex((tile) => tile.id === tileId);
    if (startIndex < 0) {
      return;
    }

    setTileActionError(null);
    setSelectedTileId(tileId);
    setDraggingTileId(tileId);
    setDragStartIndex(startIndex);
    setDragOffsetY(0);
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
          scrollEnabled={draggingTileId === null}
        >
          <Text style={styles.leftPanelHint}>Podrž a táhni dlaždici pro změnu pořadí.</Text>
          {tiles.map((tile) => {
            const colors = CATEGORY_COLORS[tile.category];
            const isSelected = tile.id === selectedTileId;
            const isDraggingRow = tile.id === draggingTileId;

            return (
              <Pressable
                key={tile.id}
                onPress={() => setSelectedTileId(tile.id)}
                onLongPress={() => handleTileRowLongPress(tile.id)}
                delayLongPress={250}
                onLayout={(event) => {
                  const nextHeight = event.nativeEvent.layout.height;
                  if (nextHeight > 0 && Math.abs(nextHeight - tileRowHeight) > 2) {
                    setTileRowHeight(nextHeight);
                  }
                }}
                style={[
                  styles.tileRow,
                  {
                    backgroundColor: colors.background,
                    borderColor: isSelected ? '#1E293B' : colors.border,
                  },
                  isDraggingRow && [styles.tileRowDragging, { transform: [{ translateY: dragOffsetY }] }],
                ]}
                {...(isDraggingRow ? tileListDragResponder.panHandlers : {})}
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
              <Text style={styles.sectionTitle}>Vybraná dlaždice</Text>

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

              <Text style={styles.inputLabel}>Dlaždice</Text>
              <View style={styles.bottomActions}>
                <Pressable
                  style={[styles.actionButton, styles.saveButton]}
                  onPress={saveTile}
                  disabled={isSaving}
                >
                  <Text style={styles.actionButtonText}>
                    {isSaving ? 'Ukládám...' : 'Uložit změny dlaždice'}
                  </Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.saveButton]} onPress={handleCreateTile}>
                  <Text style={styles.actionButtonText}>Vložit novou dlaždici za vybranou</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.copyButton]} onPress={handleDuplicateTile}>
                  <Text style={styles.actionButtonText}>Duplikovat vybranou dlaždici</Text>
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
                Nová dlaždice se vloží za vybranou a hned se otevře k úpravě.
              </Text>
              {tileActionError ? <Text style={styles.error}>{tileActionError}</Text> : null}

              <Text style={styles.inputLabel}>Tabule</Text>
              <View style={styles.bottomActions}>
                <Pressable style={[styles.actionButton, styles.warningButton]} onPress={confirmResetBoard}>
                  <Text style={styles.actionButtonText}>Obnovit výchozí tabuli</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.copyButton]} onPress={confirmDuplicateBoard}>
                  <Text style={styles.actionButtonText}>Vytvořit kopii tabule</Text>
                </Pressable>
              </View>
              <Text style={styles.helperText}>
                Kopie vytvoří novou tabuli a automaticky na ni přepne.
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>Není vybraná dlaždice</Text>
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
  leftPanelHint: {
    color: '#4D6180',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  tileRow: {
    borderWidth: 2,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    padding: 8,
  },
  tileRowDragging: {
    zIndex: 15,
    elevation: 8,
    borderColor: '#1E293B',
    shadowColor: '#18253A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
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
  warningButton: {
    borderColor: '#A86B00',
    backgroundColor: '#DB8C00',
  },
  copyButton: {
    borderColor: '#6E42C6',
    backgroundColor: '#8658E1',
  },
  deleteTileButton: {
    borderColor: '#A61D32',
    backgroundColor: '#CA2943',
  },
  emptyText: {
    color: '#5E7390',
    fontWeight: '700',
  },
  helperText: {
    marginTop: 6,
    color: '#4F6481',
    fontSize: 13,
    lineHeight: 18,
  },
});
