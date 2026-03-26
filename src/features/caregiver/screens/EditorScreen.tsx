import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import EmojiPicker, { cs, type EmojiType } from "rn-emoji-keyboard";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmojiKeyboardModal } from "../components/EmojiKeyboardModal";
import { SmartIconSuggestionsModal } from "../components/SmartIconSuggestionsModal";
import { TileAppearanceSection } from "../components/TileAppearanceSection";
import { TileVisualOptionsModal } from "../components/TileVisualOptionsModal";
import { useEmojiSuggestions } from "../hooks/useEmojiSuggestions";
import { imageDraftService } from "../../ai/imageDraftService";
import { ScreenHeader } from "../components/ScreenHeader";
import { useTileImageDraft } from "../hooks/useTileImageDraft";
import { styles } from "./EditorScreen.styles";
import { buildSpeechSegments, speechEngine } from "../../speech/speechEngine";
import { AI_FEATURE_FLAGS } from "../../ai/featureFlags";
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
import { logError, logEvent } from "../../../shared/telemetry/logger";

type EditorScreenProps = {
  onBack: () => void;
};

const categories: Category[] = ["needs", "feelings", "social", "food"];
const speechModes: SpeechMode[] = [
  "tts",
  "recording_only",
];

export const EditorScreen = ({ onBack }: EditorScreenProps) => {
  const authStatus = useAppStore((state) => state.authStatus);
  const authIsAnonymous = useAppStore((state) => state.authIsAnonymous);
  const remoteContext = useAppStore((state) => state.remoteContext);
  const board = useAppStore((state) => state.board);
  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const settings = useAppStore((state) => state.settings);
  const updateTileDraft = useAppStore((state) => state.updateTileDraft);
  const deleteTile = useAppStore((state) => state.deleteTile);
  const saveClip = useAppStore((state) => state.saveClip);
  const deleteClip = useAppStore((state) => state.deleteClip);
  const navigate = useAppStore((state) => state.navigate);
  const setAuthReturnScreen = useAppStore((state) => state.setAuthReturnScreen);
  const editorTargetTileId = useAppStore((state) => state.editorTargetTileId);
  const setEditorTargetTileId = useAppStore(
    (state) => state.setEditorTargetTileId,
  );

  const [labelCs, setLabelCs] = useState("");
  const [emoji, setEmoji] = useState("");
  const [category, setCategory] = useState<Category>("needs");
  const [speechMode, setSpeechMode] = useState<SpeechMode>("tts");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isEmojiKeyboardModalOpen, setIsEmojiKeyboardModalOpen] =
    useState(false);
  const [isVisualMenuOpen, setIsVisualMenuOpen] = useState(false);
  const [isSmartSuggestionsOpen, setIsSmartSuggestionsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [isApplyingAiImage, setIsApplyingAiImage] = useState(false);
  const [hasExplicitCategoryChoice, setHasExplicitCategoryChoice] = useState(false);
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
  const selectedTileId = selectedTile?.id ?? null;

  const {
    visualType,
    setVisualType,
    imageLocalUri,
    imageRemotePath,
    previewImageLocalUri,
    previewImageRemotePath,
    generatedDraft,
    hasPreviewImage,
    setGeneratedDraftPreview,
    clearGeneratedDraft,
    applyGeneratedDraft,
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
    setIsEmojiKeyboardModalOpen(false);
    setIsVisualMenuOpen(false);
    setIsSmartSuggestionsOpen(false);
    setIsGeneratingAiImage(false);
    setIsApplyingAiImage(false);
    setHasExplicitCategoryChoice(false);
    setRecordingError(null);
    setTileActionError(null);
  }, [selectedTileId]);

  const selectedClip = selectedTile?.audioClipId
    ? clipsById[selectedTile.audioClipId]
    : undefined;
  const previewColors = CATEGORY_COLORS[category];
  const promptCategory = hasExplicitCategoryChoice ? category : undefined;
  const highContrast = settings?.highContrast ?? false;
  const trimmedLabel = labelCs.trim();
  const effectiveLabel = selectedTile ? trimmedLabel || selectedTile.labelCs : "";
  const trimmedEmoji = emoji.trim();
  const previewEmoji = selectedTile ? trimmedEmoji || selectedTile.emoji : "";
  const previewVisualType: TileVisualType =
    visualType === "image" && hasPreviewImage ? "image" : "emoji";
  const visualSelectionIncomplete =
    visualType === "image" && !hasPreviewImage;
  const aiEmojiSuggestionsEnabled =
    AI_FEATURE_FLAGS.emojiSuggestions &&
    authStatus === "signed_in";
  const aiGeneratedTileImagesEnabled =
    AI_FEATURE_FLAGS.generatedTileImages &&
    authStatus === "signed_in";
  const {
    clearSuggestions: clearEmojiSuggestions,
    error: emojiSuggestionError,
    isLoading: isEmojiSuggestionsLoading,
    requestSuggestions: requestEmojiSuggestions,
    suggestions: emojiSuggestions,
  } = useEmojiSuggestions({
    enabled: aiEmojiSuggestionsEnabled,
    label: effectiveLabel,
    locale: board?.locale ?? "cs-CZ",
    category,
    existingEmoji: previewEmoji,
  });

  const buildTileUpdatePayload = (overrides?: {
    visualType?: TileVisualType;
    imageLocalUri?: string | null;
    imageRemotePath?: string | null;
  }): TileUpdateInput | null => {
    if (!selectedTile) {
      return null;
    }

    const nextVisualType = overrides?.visualType ?? previewVisualType;
    const nextImageLocalUri =
      overrides?.imageLocalUri === undefined ? imageLocalUri : overrides.imageLocalUri;
    const nextImageRemotePath =
      overrides?.imageRemotePath === undefined ? imageRemotePath : overrides.imageRemotePath;
    const nextVisualSelectionIncomplete =
      nextVisualType === "image" &&
      !nextImageLocalUri &&
      !nextImageRemotePath;

    if (nextVisualSelectionIncomplete) {
      setTileActionError("Nejdřív přidej fotku z foťáku nebo knihovny.");
      return null;
    }

    return {
      labelCs: trimmedLabel || selectedTile.labelCs,
      emoji: trimmedEmoji || selectedTile.emoji,
      visualType: nextVisualType,
      imageLocalUri: nextVisualType === "image" ? nextImageLocalUri : null,
      imageRemotePath: nextVisualType === "image" ? nextImageRemotePath : null,
      category,
      speechMode,
    };
  };

  const saveTile = async () => {
    if (!selectedTile) {
      return;
    }

    setIsSaving(true);
    setTileActionError(null);

    try {
      let payloadOverrides:
        | {
            visualType: TileVisualType;
            imageLocalUri: string | null;
            imageRemotePath: string | null;
          }
        | undefined;

      if (generatedDraft && previewVisualType === "image") {
        const promoted = await imageDraftService.promoteDraft({
          profileId: remoteContext?.profileId,
          tileId: selectedTile.id,
          draftId: generatedDraft.draftId,
          draftStoragePath: generatedDraft.storagePath,
          localUri: generatedDraft.localUri,
        });

        await applyGeneratedDraft({
          localUri: promoted.localUri,
          remotePath: promoted.storagePath,
        });
        setVisualType("image");
        payloadOverrides = {
          visualType: "image",
          imageLocalUri: promoted.localUri,
          imageRemotePath: promoted.storagePath,
        };
      }

      const payload = buildTileUpdatePayload(payloadOverrides);
      if (!payload) {
        return;
      }

      await updateTileDraft(selectedTile.id, payload);
      await commitDraft(
        payload.visualType === "image" && Boolean(payload.imageLocalUri),
        payload.imageLocalUri,
      );
    } catch (error) {
      setTileActionError(
        error instanceof Error ? error.message : "Dlaždici nešlo uložit",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditVisual = () => {
    setIsVisualMenuOpen(true);
  };

  const openSmartSuggestions = () => {
    setIsVisualMenuOpen(false);
    setIsEmojiPickerOpen(false);
    setIsEmojiKeyboardModalOpen(false);
    setIsSmartSuggestionsOpen(true);

    if (effectiveLabel.trim()) {
      if (!isEmojiSuggestionsLoading && emojiSuggestions.length === 0) {
        void requestEmojiSuggestions();
      }

      if (!generatedDraft && !isGeneratingAiImage) {
        void handleGenerateAiImage();
      }
    }
  };

  const handleGenerateAiImage = async () => {
    if (!selectedTile) {
      return;
    }

    const normalizedLabel = effectiveLabel.trim();
    if (!normalizedLabel) {
      setTileActionError("Nejdřív napiš text dlaždice.");
      return;
    }

    setIsGeneratingAiImage(true);
    setTileActionError(null);
    const startedAtMs = Date.now();

    try {
      const draft = await imageDraftService.generateDraft({
        profileId: remoteContext?.profileId,
        tileId: selectedTile.id,
        label: normalizedLabel,
        locale: board?.locale ?? "cs-CZ",
        category: promptCategory,
      });

      logEvent("ai_image_generate_success", {
        duration_ms: Date.now() - startedAtMs,
        anonymous: authIsAnonymous,
        locale: board?.locale ?? "cs-CZ",
        category: promptCategory ?? null,
        label_length: normalizedLabel.length,
        trial_remaining:
          typeof draft.trialRemaining === "number" ? draft.trialRemaining : null,
      });
      setGeneratedDraftPreview({
        draftId: draft.draftId,
        storagePath: draft.storagePath,
        previewUrl: draft.signedUrl,
        localUri: draft.localUri,
      });
    } catch (error) {
      logError("ai_image_generate_error", error, {
        duration_ms: Date.now() - startedAtMs,
        anonymous: authIsAnonymous,
        locale: board?.locale ?? "cs-CZ",
        category: promptCategory ?? null,
        label_length: normalizedLabel.length,
      });
      setTileActionError(
        error instanceof Error ? error.message : "AI obrázek nešel vytvořit",
      );
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  const handleApplyAiImage = async () => {
    if (!selectedTile || !generatedDraft) {
      return;
    }

    setIsApplyingAiImage(true);
    setTileActionError(null);

    try {
      const promoted = await imageDraftService.promoteDraft({
        profileId: remoteContext?.profileId,
        tileId: selectedTile.id,
        draftId: generatedDraft.draftId,
        draftStoragePath: generatedDraft.storagePath,
        localUri: generatedDraft.localUri,
      });

      await applyGeneratedDraft({
        localUri: promoted.localUri,
        remotePath: promoted.storagePath,
      });
      setVisualType("image");
    } catch (error) {
      setTileActionError(
        error instanceof Error ? error.message : "AI obrázek nešel použít",
      );
    } finally {
      setIsApplyingAiImage(false);
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

  const canTestSpeech =
    !isRecording &&
    !!selectedTile &&
    !!settings &&
    (speechMode === "tts" || Boolean(selectedClip));

  const handleTestSpeech = async () => {
    if (isTestingSpeech) {
      await speechEngine.cancel();
      setIsTestingSpeech(false);
      return;
    }

    if (!selectedTile || !settings) {
      return;
    }

    setRecordingError(null);

    const previewTile = {
      ...selectedTile,
      labelCs: effectiveLabel,
      emoji: previewEmoji,
      visualType: previewVisualType,
      imageLocalUri:
        previewVisualType === "image" ? previewImageLocalUri ?? undefined : undefined,
      imageRemotePath:
        previewVisualType === "image" ? previewImageRemotePath ?? undefined : undefined,
      category,
      speechMode,
    };

    const segments = await buildSpeechSegments({
      tokens: [
        {
          tokenId: "editor-preview",
          tileId: selectedTile.id,
          label: effectiveLabel,
          emoji: previewEmoji,
          visualType: previewVisualType,
          imageLocalUri: previewTile.imageLocalUri,
          imageRemotePath: previewTile.imageRemotePath,
        },
      ],
      tilesById: {
        [selectedTile.id]: previewTile,
      },
      clipsById,
    });

    if (segments.length === 0) {
      setRecordingError("V tomto režimu teď není co přehrát.");
      return;
    }

    speechEngine.setSettings({
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      preferredVoice: settings.preferredVoice,
    });

    setIsTestingSpeech(true);
    try {
      await speechEngine.playSegments(segments);
    } finally {
      setIsTestingSpeech(false);
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

  const showAuthCtaForTileError =
    authIsAnonymous &&
    Boolean(tileActionError && /bez účtu|přihlas/i.test(tileActionError));

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

      <EmojiKeyboardModal
        visible={isEmojiKeyboardModalOpen}
        value={emoji}
        onChange={(nextEmoji) => {
          setEmoji(nextEmoji);
          setTileActionError(null);
        }}
        onClose={() => {
          setIsEmojiKeyboardModalOpen(false);
        }}
      />

      <TileVisualOptionsModal
        visible={isVisualMenuOpen}
        hasPreviewImage={hasPreviewImage}
        showGenerateImageAction={aiGeneratedTileImagesEnabled}
        canGenerateImage={Boolean(effectiveLabel.trim())}
        isGeneratingImage={isGeneratingAiImage}
        onClose={() => {
          setIsVisualMenuOpen(false);
        }}
        onSelectEmoji={() => {
          setIsVisualMenuOpen(false);
          setVisualType("emoji");
          clearGeneratedDraft();
          setIsEmojiKeyboardModalOpen(false);
          setIsEmojiPickerOpen(true);
          setTileActionError(null);
        }}
        onSelectEmojiKeyboard={() => {
          setIsVisualMenuOpen(false);
          setVisualType("emoji");
          clearGeneratedDraft();
          setIsEmojiPickerOpen(false);
          setIsEmojiKeyboardModalOpen(true);
          setTileActionError(null);
        }}
        onSelectPhotoLibrary={() => {
          setIsVisualMenuOpen(false);
          setVisualType("image");
          clearGeneratedDraft();
          setIsEmojiPickerOpen(false);
          setIsEmojiKeyboardModalOpen(false);
          void pickImageFromLibrary();
        }}
        onSelectCamera={() => {
          setIsVisualMenuOpen(false);
          setVisualType("image");
          clearGeneratedDraft();
          setIsEmojiPickerOpen(false);
          setIsEmojiKeyboardModalOpen(false);
          void takePhoto();
        }}
        onGenerateImage={() => {
          openSmartSuggestions();
        }}
        onRemoveImage={() => {
          setIsVisualMenuOpen(false);
          clearGeneratedDraft();
          void removeImage();
        }}
      />

      <SmartIconSuggestionsModal
        visible={isSmartSuggestionsOpen}
        label={effectiveLabel}
        previewEmoji={previewEmoji}
        previewVisualType={previewVisualType}
        previewImageLocalUri={previewImageLocalUri}
        previewImageRemotePath={previewImageRemotePath}
        generatedImageLocalUri={generatedDraft?.localUri}
        generatedImageRemotePath={generatedDraft?.previewUrl}
        emojiSuggestions={emojiSuggestions}
        isEmojiLoading={isEmojiSuggestionsLoading}
        isImageLoading={isGeneratingAiImage}
        hasGeneratedImage={Boolean(generatedDraft)}
        error={tileActionError}
        showAuthCta={showAuthCtaForTileError}
        onClose={() => {
          setIsSmartSuggestionsOpen(false);
        }}
        onSelectEmoji={(suggestedEmoji) => {
          setEmoji(suggestedEmoji);
          setVisualType("emoji");
          setTileActionError(null);
        }}
        onUseGeneratedImage={() => {
          setVisualType("image");
          setTileActionError(null);
        }}
        onRegenerateImage={() => {
          void handleGenerateAiImage();
        }}
        onAuth={() => {
          setAuthReturnScreen("editor");
          navigate("auth");
        }}
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
                  previewEmoji={previewEmoji}
                  previewVisualType={previewVisualType}
                  imageLocalUri={previewImageLocalUri}
                  imageRemotePath={previewImageRemotePath}
                  highContrast={highContrast}
                  previewBackgroundColor={previewColors.background}
                  onEditVisual={handleEditVisual}
                />

                <View style={styles.divider} />

                <Text style={styles.inputLabel}>Kategorie</Text>
                <View style={styles.chipWrap}>
                  {categories.map((item) => {
                    const selected = category === item;

                    return (
                      <Pressable
                        key={item}
                        onPress={() => {
                          setCategory(item);
                          setHasExplicitCategoryChoice(true);
                        }}
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
                <View style={styles.speechModeRow}>
                  <View style={styles.speechModeChipRow}>
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
                  <Pressable
                    style={[
                      styles.modeTestButton,
                      !canTestSpeech && styles.actionButtonDisabled,
                    ]}
                    onPress={() => {
                      void handleTestSpeech();
                    }}
                    disabled={!canTestSpeech && !isTestingSpeech}
                  >
                    <Text style={styles.modeTestButtonText}>
                      {isTestingSpeech ? "■ Stop" : "🔊 Test"}
                    </Text>
                  </Pressable>
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
                  <>
                    <Text style={styles.error}>{tileActionError}</Text>
                    {showAuthCtaForTileError ? (
                      <Pressable
                        style={styles.inlineAuthLink}
                        onPress={() => {
                          setAuthReturnScreen("editor");
                          navigate("auth");
                        }}
                      >
                        <Text style={styles.inlineAuthLinkText}>
                          Přihlásit / založit účet
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
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
