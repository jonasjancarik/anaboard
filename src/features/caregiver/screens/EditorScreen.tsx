import { useEffect, useState, type MutableRefObject } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import EmojiPicker, { cs, type EmojiType } from "rn-emoji-keyboard";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmojiKeyboardModal } from "../components/EmojiKeyboardModal";
import { TileAppearanceSection } from "../components/TileAppearanceSection";
import { TileIconSheet } from "../components/TileIconSheet";
import { useEmojiSuggestions } from "../hooks/useEmojiSuggestions";
import { AiUnavailableError } from "../../ai/aiClient";
import { imageDraftService } from "../../ai/imageDraftService";
import { ScreenHeader } from "../components/ScreenHeader";
import { useTileImageDraft } from "../hooks/useTileImageDraft";
import { styles } from "./EditorScreen.styles";
import { buildSpeechSegments, speechEngine } from "../../speech/speechEngine";
import { AI_FEATURE_FLAGS } from "../../ai/featureFlags";
import {
  CATEGORY_COLORS,
} from "../../../shared/constants/defaults";
import { appHaptics } from "../../../shared/feedback/haptics";
import { isWebPlatform } from "../../../shared/platform/runtime";
import { getAppCopy } from "../../../shared/i18n/appCopy";
import { normalizeSupportedLocale } from "../../../shared/i18n/profileLanguage";
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
  backHandlerRef?: MutableRefObject<(() => void) | null>;
};

const categories: Category[] = [
  "needs",
  "feelings",
  "social",
  "activities",
  "food",
];
const speechModes: SpeechMode[] = [
  "tts",
  "recording_only",
];

export const EditorScreen = ({ onBack, backHandlerRef }: EditorScreenProps) => {
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
  const [isIconSheetOpen, setIsIconSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTestingSpeech, setIsTestingSpeech] = useState(false);
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [aiTrialRemaining, setAiTrialRemaining] = useState<number | null>(null);
  const [hasExplicitCategoryChoice, setHasExplicitCategoryChoice] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [tileActionError, setTileActionError] = useState<string | null>(null);
  const locale = normalizeSupportedLocale(board?.locale);
  const copy = getAppCopy(locale);

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
    imageLocalUri,
    imageRemotePath,
    previewImageLocalUri,
    previewImageRemotePath,
    generatedDrafts,
    selectedDraft,
    hasPreviewImage,
    chooseEmojiVisual,
    addGeneratedDraft,
    selectGeneratedDraft,
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
    locale,
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
    setIsIconSheetOpen(false);
    setIsGeneratingAiImage(false);
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
    locale,
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
      setTileActionError(copy.editor.imageRequired);
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
      return false;
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

      // A chosen AI picture is only a draft until Save; promote it now.
      if (selectedDraft && previewVisualType === "image") {
        let promoted;
        try {
          promoted = await imageDraftService.promoteDraft({
            profileId: remoteContext?.profileId,
            tileId: selectedTile.id,
            draftId: selectedDraft.draftId,
            draftStoragePath: selectedDraft.storagePath,
            localUri: selectedDraft.localUri,
          });
        } catch (error) {
          throw new Error(
            error instanceof Error &&
              error.message &&
              !(error instanceof AiUnavailableError)
              ? error.message
              : copy.editor.aiImageApplyError,
          );
        }

        await applyGeneratedDraft({
          localUri: promoted.localUri,
          remotePath: promoted.storagePath,
        });
        payloadOverrides = {
          visualType: "image",
          imageLocalUri: promoted.localUri,
          imageRemotePath: promoted.storagePath,
        };
      }

      const payload = buildTileUpdatePayload(payloadOverrides);
      if (!payload) {
        return false;
      }

      await updateTileDraft(selectedTile.id, payload);
      await commitDraft(
        payload.visualType === "image" && Boolean(payload.imageLocalUri),
        payload.imageLocalUri,
      );
      void appHaptics.success();
      return true;
    } catch (error) {
      void appHaptics.error();
      setTileActionError(
        error instanceof Error ? error.message : copy.editor.saveTileError,
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty = Boolean(
    selectedTile &&
      (effectiveLabel !== selectedTile.labelCs ||
        previewEmoji !== selectedTile.emoji ||
        category !== selectedTile.category ||
        speechMode !== selectedTile.speechMode ||
        previewVisualType !== selectedTile.visualType ||
        (previewVisualType === "image" &&
          (selectedDraft !== null ||
            (imageLocalUri ?? null) !== (selectedTile.imageLocalUri ?? null) ||
            (imageRemotePath ?? null) !==
              (selectedTile.imageRemotePath ?? null)))),
  );

  const requestLeave = () => {
    if (!isDirty || isSaving) {
      onBack();
      return;
    }

    if (isWebPlatform && typeof window !== "undefined") {
      const confirmed = window.confirm(
        `${copy.editor.unsavedTitle}\n\n${copy.editor.unsavedBody}\n\n${copy.editor.unsavedDiscard}?`,
      );
      if (confirmed) {
        onBack();
      }
      return;
    }

    Alert.alert(copy.editor.unsavedTitle, copy.editor.unsavedBody, [
      { text: copy.editor.unsavedKeepEditing, style: "cancel" },
      {
        text: copy.editor.unsavedDiscard,
        style: "destructive",
        onPress: onBack,
      },
      {
        text: copy.common.save,
        onPress: () => {
          void saveTile().then((saved) => {
            if (saved) {
              onBack();
            }
          });
        },
      },
    ]);
  };

  if (backHandlerRef) {
    backHandlerRef.current = requestLeave;
  }

  useEffect(() => {
    if (!backHandlerRef) {
      return;
    }

    return () => {
      backHandlerRef.current = null;
    };
  }, [backHandlerRef]);

  const handleEditVisual = () => {
    setIsEmojiPickerOpen(false);
    setIsEmojiKeyboardModalOpen(false);
    setIsIconSheetOpen(true);

    if (
      aiEmojiSuggestionsEnabled &&
      effectiveLabel.trim() &&
      !isEmojiSuggestionsLoading &&
      emojiSuggestions.length === 0
    ) {
      void requestEmojiSuggestions();
    }
  };

  const handleGenerateAiImage = async () => {
    if (!selectedTile) {
      return;
    }

    const normalizedLabel = effectiveLabel.trim();
    if (!normalizedLabel) {
      setTileActionError(copy.editor.labelRequired);
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
        locale,
        category: promptCategory,
      });

      logEvent("ai_image_generate_success", {
        duration_ms: Date.now() - startedAtMs,
        anonymous: authIsAnonymous,
        locale,
        category: promptCategory ?? null,
        label_length: normalizedLabel.length,
        trial_remaining:
          typeof draft.trialRemaining === "number" ? draft.trialRemaining : null,
      });
      addGeneratedDraft({
        draftId: draft.draftId,
        storagePath: draft.storagePath,
        previewUrl: draft.signedUrl,
        localUri: draft.localUri,
      });
      if (typeof draft.trialRemaining === "number") {
        setAiTrialRemaining(draft.trialRemaining);
      }
      void appHaptics.success();
    } catch (error) {
      logError("ai_image_generate_error", error, {
        duration_ms: Date.now() - startedAtMs,
        anonymous: authIsAnonymous,
        locale,
        category: promptCategory ?? null,
        label_length: normalizedLabel.length,
      });
      void appHaptics.error();
      setTileActionError(
        error instanceof Error && !(error instanceof AiUnavailableError)
          ? error.message
          : copy.editor.aiImageGenerateError,
      );
    } finally {
      setIsGeneratingAiImage(false);
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
        void appHaptics.tap();
      } catch (error) {
        void appHaptics.error();
        setRecordingError(
          error instanceof Error ? error.message : copy.editor.recordingError,
        );
      }
      return;
    }

    try {
      const recording = await recordingService.stop();
      setIsRecording(false);

      if (!recording) {
        void appHaptics.error();
        setRecordingError(copy.editor.recordingEmpty);
        return;
      }

      await saveClip(selectedTile.id, {
        localUri: recording.uri,
        durationMs: recording.durationMs,
        format: "m4a",
      });
      void appHaptics.success();
    } catch (error) {
      void appHaptics.error();
      setRecordingError(
        error instanceof Error ? error.message : copy.editor.recordingError,
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
      setRecordingError(copy.editor.noSpeechPreview);
      return;
    }

    speechEngine.setSettings({
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      preferredVoice: settings.preferredVoice,
      locale,
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
      void appHaptics.warning();
    } catch (error) {
      void appHaptics.error();
      setRecordingError(
        error instanceof Error ? error.message : copy.editor.deleteRecordingError,
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
      void appHaptics.warning();
      onBack();
    } catch (error) {
      void appHaptics.error();
      setTileActionError(
        error instanceof Error ? error.message : copy.editor.deleteTileError,
      );
    }
  };

  const handleDeleteTile = () => {
    if (!selectedTile) {
      return;
    }

    Alert.alert(
      copy.editor.deleteTileTitle,
      copy.editor.deleteTileBody,
      [
        {
          text: copy.common.cancel,
          style: "cancel",
        },
        {
          text: copy.common.delete,
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
    Boolean(tileActionError && /bez účtu|přihlas|account|sign in/i.test(tileActionError));

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScreenHeader title={copy.editor.title} onBack={requestLeave} backLabel={copy.common.back} />

      <EmojiPicker
        open={isEmojiPickerOpen}
        onClose={() => {
          setIsEmojiPickerOpen(false);
        }}
        onEmojiSelected={(selected: EmojiType) => {
          setEmoji(selected.emoji);
          chooseEmojiVisual();
          setTileActionError(null);
          setIsEmojiPickerOpen(false);
        }}
        translation={locale === "cs-CZ" ? cs : undefined}
        enableSearchBar
        enableRecentlyUsed
      />

      <EmojiKeyboardModal
        visible={isEmojiKeyboardModalOpen}
        value={emoji}
        locale={locale}
        onChange={(nextEmoji) => {
          setEmoji(nextEmoji);
          chooseEmojiVisual();
          setTileActionError(null);
        }}
        onClose={() => {
          setIsEmojiKeyboardModalOpen(false);
        }}
      />

      <TileIconSheet
        visible={isIconSheetOpen}
        locale={locale}
        label={effectiveLabel}
        previewEmoji={previewEmoji}
        previewVisualType={previewVisualType}
        previewImageLocalUri={previewImageLocalUri}
        previewImageRemotePath={previewImageRemotePath}
        previewBackgroundColor={previewColors.background}
        hasImage={hasPreviewImage && previewVisualType === "image"}
        showEmojiSuggestions={aiEmojiSuggestionsEnabled}
        emojiSuggestions={emojiSuggestions}
        isEmojiLoading={isEmojiSuggestionsLoading}
        emojiError={emojiSuggestionError}
        showAiImages={aiGeneratedTileImagesEnabled}
        generatedDrafts={generatedDrafts}
        selectedDraftId={selectedDraft?.draftId ?? null}
        isGeneratingImage={isGeneratingAiImage}
        trialRemaining={authIsAnonymous ? aiTrialRemaining : null}
        error={tileActionError}
        showAuthCta={showAuthCtaForTileError}
        onClose={() => {
          setIsIconSheetOpen(false);
        }}
        onSelectEmoji={(value) => {
          void appHaptics.selection();
          setEmoji(value);
          chooseEmojiVisual();
          setTileActionError(null);
        }}
        onOpenEmojiPicker={() => {
          setIsIconSheetOpen(false);
          setTileActionError(null);
          setIsEmojiPickerOpen(true);
        }}
        onOpenEmojiKeyboard={() => {
          setIsIconSheetOpen(false);
          setTileActionError(null);
          setIsEmojiKeyboardModalOpen(true);
        }}
        onPickPhoto={() => {
          setIsIconSheetOpen(false);
          void pickImageFromLibrary();
        }}
        onTakePhoto={() => {
          setIsIconSheetOpen(false);
          void takePhoto();
        }}
        onGenerateImage={() => {
          void handleGenerateAiImage();
        }}
        onSelectDraft={(draftId) => {
          void appHaptics.selection();
          selectGeneratedDraft(draftId);
        }}
        onRemoveImage={() => {
          void removeImage();
        }}
        onAuth={() => {
          setIsIconSheetOpen(false);
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
                  labelPlaceholder={copy.tileAppearance.labelPlaceholder}
                  previewEmoji={previewEmoji}
                  previewVisualType={previewVisualType}
                  imageLocalUri={previewImageLocalUri}
                  imageRemotePath={previewImageRemotePath}
                  highContrast={highContrast}
                  previewBackgroundColor={previewColors.background}
                  onEditVisual={handleEditVisual}
                />

                <View style={styles.divider} />

                <Text style={styles.inputLabel}>{copy.editor.category}</Text>
                <View style={styles.chipWrap}>
                  {categories.map((item) => {
                    const selected = category === item;

                    return (
                      <Pressable
                        key={item}
                        onPress={() => {
                          void appHaptics.selection();
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
                          {copy.categories[item]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.inputLabel}>{copy.editor.speechMode}</Text>
                <View style={styles.speechModeRow}>
                  <View style={styles.speechModeChipRow}>
                    {speechModes.map((mode) => {
                      const selected = speechMode === mode;

                      return (
                        <Pressable
                          key={mode}
                          onPress={() => {
                            void appHaptics.selection();
                            setSpeechMode(mode);
                          }}
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
                            {copy.speechModes[mode]}
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
                      {isTestingSpeech ? copy.editor.stopTest : copy.editor.test}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.divider} />

                <View style={styles.recordingRow}>
                  <Text style={styles.inputLabel}>{copy.editor.recording}</Text>
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
                      {isRecording ? copy.common.stop : selectedClip ? copy.common.delete : copy.editor.record}
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
                      {copy.common.delete}
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
                    onPress={() => {
                      void saveTile();
                    }}
                    disabled={isSaving || isRecording || visualSelectionIncomplete}
                  >
                    <Text style={styles.actionButtonText}>
                      {isSaving ? copy.common.saving : copy.common.save}
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
                          {copy.editor.signInCta}
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyText}>
                {copy.editor.empty}
              </Text>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};
