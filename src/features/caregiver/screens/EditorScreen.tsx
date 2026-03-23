import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import EmojiPicker, { cs, type EmojiType } from "rn-emoji-keyboard";
import { SafeAreaView } from "react-native-safe-area-context";

import { TileAppearanceSection } from "../components/TileAppearanceSection";
import { ScreenHeader } from "../components/ScreenHeader";
import { useTileImageDraft } from "../hooks/useTileImageDraft";
import { styles } from "./EditorScreen.styles";
import {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  SPEECH_MODE_LABELS,
} from "../../../shared/constants/defaults";
import type {
  Category,
  SpeechMode,
  TileVisualType,
} from "../../../shared/types/domain";
import { useAppStore } from "../../../store/useAppStore";
import { recordingService } from "../../speech/recordingService";
import type { TileUpdateInput } from "../../../shared/storage/repositories/tileRepository";

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
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isEmojiKeyboardVisible, setIsEmojiKeyboardVisible] = useState(false);
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

  const {
    visualType,
    setVisualType,
    imageLocalUri,
    imageRemotePath,
    hasPreviewImage,
    pickImageFromLibrary,
    takePhoto,
    removeImage,
    commitDraft,
  } = useTileImageDraft({
    tileId: selectedTile?.id ?? null,
    initialVisualType: selectedTile?.visualType ?? "emoji",
    initialImageLocalUri: selectedTile?.imageLocalUri,
    initialImageRemotePath: selectedTile?.imageRemotePath,
    onError: setTileActionError,
  });

  useEffect(() => {
    if (!selectedTile) {
      return;
    }

    setLabelCs(selectedTile.labelCs);
    setEmoji(selectedTile.emoji);
    setCategory(selectedTile.category);
    setSpeechMode(selectedTile.speechMode);
    setIsEmojiPickerOpen(false);
    setIsEmojiKeyboardVisible(false);
    setRecordingError(null);
    setTileActionError(null);
  }, [selectedTile]);

  const selectedClip = selectedTile?.audioClipId
    ? clipsById[selectedTile.audioClipId]
    : undefined;
  const previewColors = CATEGORY_COLORS[category];
  const showLabels = settings?.showLabels ?? true;
  const highContrast = settings?.highContrast ?? false;
  const trimmedLabel = labelCs.trim();
  const trimmedEmoji = emoji.trim();
  const previewLabel = selectedTile
    ? trimmedLabel || selectedTile.labelCs
    : "";
  const previewEmoji = selectedTile ? trimmedEmoji || selectedTile.emoji : "";
  const previewVisualType: TileVisualType =
    visualType === "image" && hasPreviewImage ? "image" : "emoji";
  const visualSelectionIncomplete =
    visualType === "image" && !hasPreviewImage;

  const buildTileUpdatePayload = (): TileUpdateInput | null => {
    if (!selectedTile) {
      return null;
    }

    if (visualSelectionIncomplete) {
      setTileActionError("Nejdřív přidej fotku z foťáku nebo knihovny.");
      return null;
    }

    return {
      labelCs: trimmedLabel || selectedTile.labelCs,
      emoji: trimmedEmoji || selectedTile.emoji,
      visualType: previewVisualType,
      imageLocalUri: previewVisualType === "image" ? imageLocalUri : null,
      imageRemotePath: previewVisualType === "image" ? imageRemotePath : null,
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
      await commitDraft(
        payload.visualType === "image" && Boolean(payload.imageLocalUri),
      );
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
      <ScreenHeader title="Upravit dlaždici" onBack={onBack} />

      <EmojiPicker
        open={isEmojiPickerOpen}
        onClose={() => {
          setIsEmojiPickerOpen(false);
        }}
        onEmojiSelected={(selected: EmojiType) => {
          setEmoji(selected.emoji);
          setTileActionError(null);
          setIsEmojiPickerOpen(false);
        }}
        translation={cs}
        enableSearchBar
        enableRecentlyUsed
      />

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
                <TileAppearanceSection
                  labelCs={labelCs}
                  onLabelChange={setLabelCs}
                  emoji={emoji}
                  onEmojiChange={(nextEmoji) => {
                    setEmoji(nextEmoji);
                    setTileActionError(null);
                  }}
                  isEmojiKeyboardVisible={isEmojiKeyboardVisible}
                  previewLabel={previewLabel}
                  previewEmoji={previewEmoji}
                  previewVisualType={previewVisualType}
                  visualType={visualType}
                  imageLocalUri={imageLocalUri}
                  imageRemotePath={imageRemotePath}
                  hasPreviewImage={hasPreviewImage}
                  showLabels={showLabels}
                  highContrast={highContrast}
                  previewBackgroundColor={previewColors.background}
                  onOpenEmojiPicker={() => {
                    setIsEmojiPickerOpen(true);
                    setIsEmojiKeyboardVisible(false);
                  }}
                  onToggleEmojiKeyboard={() => {
                    setIsEmojiPickerOpen(false);
                    setIsEmojiKeyboardVisible((current) => !current);
                  }}
                  onVisualTypeChange={(nextVisualType) => {
                    setVisualType(nextVisualType);
                    if (nextVisualType !== "emoji") {
                      setIsEmojiPickerOpen(false);
                      setIsEmojiKeyboardVisible(false);
                    }
                    setTileActionError(null);
                  }}
                  onPickImageFromLibrary={() => {
                    void pickImageFromLibrary();
                  }}
                  onTakePhoto={() => {
                    void takePhoto();
                  }}
                  onRemoveImage={() => {
                    void removeImage();
                  }}
                />

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
                      (isSaving || isRecording || visualSelectionIncomplete) &&
                        styles.actionButtonDisabled,
                    ]}
                    onPress={saveTile}
                    disabled={isSaving || isRecording || visualSelectionIncomplete}
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
