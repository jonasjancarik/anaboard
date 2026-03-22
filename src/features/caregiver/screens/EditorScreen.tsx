import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SPEECH_MODE_LABELS,
} from "../../../shared/constants/defaults";
import { APP_THEME } from "../../../shared/constants/theme";
import type { Category, SpeechMode } from "../../../shared/types/domain";
import { useAppStore } from "../../../store/useAppStore";
import { recordingService } from "../../speech/recordingService";

type EditorScreenProps = {
  onBack: () => void;
};

const categories: Category[] = ["needs", "feelings", "social", "food"];
const speechModes: SpeechMode[] = [
  "tts",
  "recording_with_tts_fallback",
  "recording_only",
];

export const EditorScreen = ({ onBack }: EditorScreenProps) => {
  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const settings = useAppStore((state) => state.settings);
  const updateTileDraft = useAppStore((state) => state.updateTileDraft);
  const deleteTile = useAppStore((state) => state.deleteTile);
  const saveClip = useAppStore((state) => state.saveClip);
  const deleteClip = useAppStore((state) => state.deleteClip);
  const editorTargetTileId = useAppStore((state) => state.editorTargetTileId);
  const setEditorTargetTileId = useAppStore(
    (state) => state.setEditorTargetTileId,
  );

  const [labelCs, setLabelCs] = useState("");
  const [emoji, setEmoji] = useState("");
  const [category, setCategory] = useState<Category>("needs");
  const [speechMode, setSpeechMode] = useState<SpeechMode>("tts");
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

    if (
      !editorTargetTileId ||
      !tiles.some((tile) => tile.id === editorTargetTileId)
    ) {
      setEditorTargetTileId(tiles[0].id);
    }
  }, [editorTargetTileId, setEditorTargetTileId, tiles]);

  const selectedTile = editorTargetTileId
    ? (tiles.find((tile) => tile.id === editorTargetTileId) ?? null)
    : null;

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

  const selectedClip = selectedTile?.audioClipId
    ? clipsById[selectedTile.audioClipId]
    : undefined;
  const previewColors = CATEGORY_COLORS[category];
  const previewLabel = selectedTile
    ? labelCs.trim() || selectedTile.labelCs
    : "";
  const previewEmoji = selectedTile ? emoji.trim() || selectedTile.emoji : "";
  const showLabels = settings?.showLabels ?? true;
  const highContrast = settings?.highContrast ?? false;

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
      setTileActionError(
        error instanceof Error ? error.message : "Dlaždici nešlo uložit",
      );
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
        setRecordingError(
          error instanceof Error ? error.message : "Nahrávání se nepovedlo",
        );
      }
      return;
    }

    try {
      const recording = await recordingService.stop();
      setIsRecording(false);

      if (!recording) {
        setRecordingError("Nahrávka je prázdná");
        return;
      }

      await saveClip(selectedTile.id, {
        localUri: recording.uri,
        durationMs: recording.durationMs,
        format: "m4a",
      });
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "Nahrávání se nepovedlo",
      );
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
      setRecordingError(
        error instanceof Error ? error.message : "Nahrávku nešlo smazat",
      );
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
      setTileActionError(
        error instanceof Error ? error.message : "Dlaždici nešlo smazat",
      );
    }
  };

  const handleDeleteTile = () => {
    if (!selectedTile) {
      return;
    }

    Alert.alert(
      "Smazat vybranou dlaždici?",
      "Dlaždice zmizí z tabule a zůstane dostupná v archivu.",
      [
        {
          text: "Zrušit",
          style: "cancel",
        },
        {
          text: "Smazat",
          style: "destructive",
          onPress: () => {
            void deleteSelectedTile();
          },
        },
      ],
    );
  };

  const handleRecordingAction = () => {
    if (isRecording) {
      void handleRecordToggle();
      return;
    }

    if (selectedClip) {
      void handleDeleteClip();
      return;
    }

    void handleRecordToggle();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <Pressable
          style={[styles.topButton, styles.neutralButton]}
          onPress={onBack}
        >
          <Text style={[styles.topButtonText, styles.neutralButtonText]}>
            Zpět
          </Text>
        </Pressable>
        <Text style={styles.title}>Upravit dlaždici</Text>
        <View style={styles.topButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        <ScrollView
          style={styles.editorScroll}
          contentContainerStyle={styles.editorPanelContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editorBody}>
            {selectedTile ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Vybraná dlaždice</Text>
                </View>

                <View style={styles.tilePreviewWrap}>
                  <View
                    style={[
                      styles.tilePreview,
                      highContrast
                        ? styles.tilePreviewHighContrast
                        : {
                            backgroundColor: previewColors.background,
                            borderColor: "transparent",
                          },
                    ]}
                  >
                    <Text style={styles.tilePreviewEmoji}>
                      {previewEmoji || "⬜️"}
                    </Text>
                    {showLabels ? (
                      <Text style={styles.tilePreviewLabel}>{previewLabel}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.inputLabel}>Text</Text>
                    <TextInput
                      value={labelCs}
                      onChangeText={setLabelCs}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.emojiFieldBlock}>
                    <Text style={styles.inputLabel}>Emoji</Text>
                    <TextInput
                      value={emoji}
                      onChangeText={setEmoji}
                      style={[styles.input, styles.emojiInput]}
                      maxLength={4}
                    />
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.inputLabel}>Kategorie</Text>
                <View style={styles.chipWrap}>
                  {categories.map((item) => {
                    const selected = category === item;

                    return (
                      <Pressable
                        key={item}
                        onPress={() => setCategory(item)}
                        style={[
                          styles.chip,
                          styles.categoryChip,
                          {
                            backgroundColor: CATEGORY_COLORS[item].background,
                            borderColor: CATEGORY_COLORS[item].border,
                          },
                          selected && styles.chipSelected,
                          selected && styles.categoryChipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            styles.categoryChipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {CATEGORY_LABELS[item]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>Režim řeči</Text>
                <View style={styles.chipWrap}>
                  {speechModes.map((mode) => {
                    const selected = speechMode === mode;

                    return (
                      <Pressable
                        key={mode}
                        onPress={() => setSpeechMode(mode)}
                        style={[
                          styles.chip,
                          styles.modeChip,
                          selected && styles.chipSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {SPEECH_MODE_LABELS[mode]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.divider} />

                <View style={styles.recordingRow}>
                  <Text style={styles.inputLabel}>Nahrávka</Text>
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.inlineActionButton,
                      isRecording
                        ? styles.stopButton
                        : selectedClip
                          ? styles.deleteRecordingButton
                          : styles.recordButton,
                    ]}
                    onPress={handleRecordingAction}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        selectedClip && !isRecording
                          ? styles.deleteTileButtonText
                          : null,
                      ]}
                    >
                      {isRecording ? "Stop" : selectedClip ? "Smazat" : "Nahrát"}
                    </Text>
                  </Pressable>
                </View>
                {recordingError ? (
                  <Text style={styles.error}>{recordingError}</Text>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.tileActionsRow}>
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.tileActionButton,
                      styles.deleteTileButton,
                      (tiles.length <= 1 || isSaving || isRecording) &&
                        styles.actionButtonDisabled,
                    ]}
                    onPress={handleDeleteTile}
                    disabled={tiles.length <= 1 || isSaving || isRecording}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        styles.deleteTileButtonText,
                      ]}
                    >
                      Smazat
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.actionButton,
                      styles.tileActionButton,
                      styles.saveButton,
                      (isSaving || isRecording) && styles.actionButtonDisabled,
                    ]}
                    onPress={saveTile}
                    disabled={isSaving || isRecording}
                  >
                    <Text style={styles.actionButtonText}>
                      {isSaving ? "Ukládám..." : "Uložit"}
                    </Text>
                  </Pressable>
                </View>

                {tileActionError ? (
                  <Text style={styles.error}>{tileActionError}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyText}>
                Dlaždice není vybraná. Otevři editor dlouhým podržením dlaždice
                na tabuli.
              </Text>
            )}
          </View>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  topButton: {
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 60,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  topButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  topButtonPlaceholder: {
    width: 60,
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
  },
  editorScroll: {
    flex: 1,
  },
  editorBody: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    gap: 10,
  },
  editorPanelContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 20,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  tilePreviewWrap: {
    alignItems: "center",
  },
  tilePreview: {
    width: 144,
    height: 144,
    borderRadius: 24,
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  tilePreviewHighContrast: {
    backgroundColor: "#FFFFFF",
    borderColor: "#111827",
    borderWidth: 2,
  },
  tilePreviewEmoji: {
    fontSize: 34,
  },
  tilePreviewLabel: {
    width: "90%",
    marginTop: 6,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
    color: APP_THEME.text,
  },
  divider: {
    height: 1,
    backgroundColor: APP_THEME.borderSoft,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  fieldBlock: {
    flex: 1,
    gap: 4,
  },
  emojiFieldBlock: {
    width: 92,
    gap: 4,
  },
  inputLabel: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    borderRadius: 16,
    backgroundColor: APP_THEME.surface,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: APP_THEME.text,
  },
  emojiInput: {
    textAlign: "center",
    fontSize: 24,
    paddingHorizontal: 10,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: APP_THEME.surface,
  },
  categoryChip: {
    minWidth: 68,
    alignItems: "center",
  },
  modeChip: {
    minHeight: 42,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: APP_THEME.primaryBorder,
    borderWidth: 2,
    opacity: 1,
  },
  categoryChipSelected: {
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: APP_THEME.text,
  },
  categoryChipText: {
    color: APP_THEME.text,
  },
  chipTextSelected: {
    color: APP_THEME.text,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  error: {
    color: APP_THEME.dangerBorder,
    marginTop: -2,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineActionButton: {
    minWidth: 88,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  recordButton: {
    borderColor: APP_THEME.successBorder,
    backgroundColor: APP_THEME.success,
  },
  stopButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.danger,
  },
  deleteRecordingButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.surface,
  },
  saveButton: {
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primary,
  },
  tileActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  tileActionButton: {
    flex: 1,
  },
  deleteTileButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.surface,
  },
  deleteTileButtonText: {
    color: APP_THEME.dangerBorder,
  },
  emptyText: {
    color: APP_THEME.textMuted,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
    paddingTop: 40,
  },
});
