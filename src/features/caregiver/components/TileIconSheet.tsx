import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { EmojiSuggestion } from "../../../shared/ai/contracts";
import { TileVisual } from "../../../shared/components/TileVisual";
import { APP_THEME } from "../../../shared/constants/theme";
import { getAppCopy } from "../../../shared/i18n/appCopy";
import type { TileVisualType } from "../../../shared/types/domain";
import type { GeneratedTileImageDraft } from "../hooks/useTileImageDraft";

type TileIconSheetProps = {
  visible: boolean;
  locale?: unknown;
  label: string;
  previewEmoji: string;
  previewVisualType: TileVisualType;
  previewImageLocalUri?: string | null;
  previewImageRemotePath?: string | null;
  previewBackgroundColor: string;
  hasImage: boolean;
  showEmojiSuggestions: boolean;
  emojiSuggestions: EmojiSuggestion[];
  isEmojiLoading: boolean;
  emojiError: string | null;
  showAiImages: boolean;
  generatedDrafts: GeneratedTileImageDraft[];
  selectedDraftId: string | null;
  isGeneratingImage: boolean;
  trialRemaining: number | null;
  error: string | null;
  showAuthCta: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onOpenEmojiKeyboard: () => void;
  onPickPhoto: () => void;
  onTakePhoto: () => void;
  onGenerateImage: () => void;
  onSelectDraft: (draftId: string) => void;
  onRemoveImage: () => void;
  onAuth: () => void;
};

const PREVIEW_SIZE = 76;
const DRAFT_SIZE = 84;

export const TileIconSheet = ({
  visible,
  locale,
  label,
  previewEmoji,
  previewVisualType,
  previewImageLocalUri,
  previewImageRemotePath,
  previewBackgroundColor,
  hasImage,
  showEmojiSuggestions,
  emojiSuggestions,
  isEmojiLoading,
  emojiError,
  showAiImages,
  generatedDrafts,
  selectedDraftId,
  isGeneratingImage,
  trialRemaining,
  error,
  showAuthCta,
  onClose,
  onSelectEmoji,
  onOpenEmojiPicker,
  onOpenEmojiKeyboard,
  onPickPhoto,
  onTakePhoto,
  onGenerateImage,
  onSelectDraft,
  onRemoveImage,
  onAuth,
}: TileIconSheetProps) => {
  const insets = useSafeAreaInsets();
  const appCopy = getAppCopy(locale);
  const copy = appCopy.tileIconSheet;
  const hasLabel = label.trim().length > 0;
  const isEmojiActive = previewVisualType === "emoji";
  const suggestedEmoji = emojiSuggestions
    .map((suggestion) => suggestion.value)
    .filter((value, index, values) => values.indexOf(value) === index);
  // Keep the current emoji visible next to the suggestions so it is clear what is chosen.
  const emojiChoices =
    previewEmoji && !suggestedEmoji.includes(previewEmoji)
      ? [previewEmoji, ...suggestedEmoji]
      : suggestedEmoji;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={appCopy.common.done}
        />

        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 12 },
          ]}
        >
          <View style={styles.handle} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View
                style={[
                  styles.previewTile,
                  { backgroundColor: previewBackgroundColor },
                ]}
              >
                <TileVisual
                  emoji={previewEmoji}
                  visualType={previewVisualType}
                  imageLocalUri={previewImageLocalUri}
                  imageRemotePath={previewImageRemotePath}
                  size={PREVIEW_SIZE}
                />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.subtitle}>{copy.saveHint}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.emojiSection}</Text>

              {emojiChoices.length > 0 || isEmojiLoading ? (
                <View style={styles.emojiRow}>
                  {emojiChoices.map((value) => {
                    const selected = isEmojiActive && value === previewEmoji;
                    return (
                      <Pressable
                        key={value}
                        style={[
                          styles.emojiChip,
                          selected && styles.emojiChipSelected,
                        ]}
                        onPress={() => onSelectEmoji(value)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={styles.emojiChipText} numberOfLines={1}>
                          {value}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {isEmojiLoading ? (
                    <View style={[styles.emojiChip, styles.emojiChipLoading]}>
                      <ActivityIndicator color={APP_THEME.textMuted} />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {showEmojiSuggestions && emojiError && !isEmojiLoading ? (
                <Text style={styles.hint}>{emojiError}</Text>
              ) : null}

              <View style={styles.linkRow}>
                <Pressable
                  style={styles.pillButton}
                  onPress={onOpenEmojiPicker}
                  accessibilityRole="button"
                >
                  <Text style={styles.pillButtonText}>{copy.moreEmoji}</Text>
                </Pressable>
                <Pressable
                  style={styles.pillButton}
                  onPress={onOpenEmojiKeyboard}
                  accessibilityRole="button"
                >
                  <Text style={styles.pillButtonText}>{copy.typeOwn}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.photoSection}</Text>
              <View style={styles.sourceRow}>
                <Pressable
                  style={styles.sourceTile}
                  onPress={onPickPhoto}
                  accessibilityRole="button"
                >
                  <Text style={styles.sourceIcon}>🖼️</Text>
                  <Text style={styles.sourceLabel}>{copy.photoLibrary}</Text>
                </Pressable>
                <Pressable
                  style={styles.sourceTile}
                  onPress={onTakePhoto}
                  accessibilityRole="button"
                >
                  <Text style={styles.sourceIcon}>📷</Text>
                  <Text style={styles.sourceLabel}>{copy.camera}</Text>
                </Pressable>
              </View>
            </View>

            {showAiImages ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{copy.aiSection}</Text>

                {generatedDrafts.length > 0 || isGeneratingImage ? (
                  <View style={styles.draftRow}>
                    {isGeneratingImage ? (
                      <View style={[styles.draftTile, styles.draftLoading]}>
                        <ActivityIndicator color={APP_THEME.primaryBorder} />
                      </View>
                    ) : null}
                    {generatedDrafts.map((draft) => {
                      const selected = draft.draftId === selectedDraftId;
                      return (
                        <Pressable
                          key={draft.draftId}
                          style={[
                            styles.draftTile,
                            selected && styles.draftTileSelected,
                          ]}
                          onPress={() => onSelectDraft(draft.draftId)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                        >
                          <TileVisual
                            emoji={previewEmoji}
                            visualType="image"
                            imageLocalUri={draft.localUri}
                            imageRemotePath={draft.previewUrl}
                            size={DRAFT_SIZE - 12}
                          />
                          {selected ? (
                            <View style={styles.checkBadge}>
                              <Text style={styles.checkBadgeText}>✓</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {isGeneratingImage ? (
                  <Text style={styles.hint}>{copy.aiGenerating}</Text>
                ) : !hasLabel ? (
                  <Text style={styles.hint}>{copy.aiNeedsLabel}</Text>
                ) : null}

                <Pressable
                  style={[
                    styles.aiButton,
                    (!hasLabel || isGeneratingImage) && styles.disabled,
                  ]}
                  onPress={onGenerateImage}
                  disabled={!hasLabel || isGeneratingImage}
                  accessibilityRole="button"
                >
                  <Text style={styles.aiButtonText}>
                    {generatedDrafts.length > 0
                      ? copy.aiGenerateAnother
                      : copy.aiGenerate(label.trim())}
                  </Text>
                </Pressable>

                {typeof trialRemaining === "number" ? (
                  <Text style={styles.hint}>{copy.aiRemaining(trialRemaining)}</Text>
                ) : null}
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.error}>{error}</Text>
                {showAuthCta ? (
                  <Pressable style={styles.authLink} onPress={onAuth}>
                    <Text style={styles.authLinkText}>
                      {appCopy.editor.signInCta}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {hasImage ? (
              <Pressable
                style={styles.removeButton}
                onPress={onRemoveImage}
                accessibilityRole="button"
              >
                <Text style={styles.removeButtonText}>{copy.removeImage}</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              style={styles.doneButton}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.doneButtonText}>{appCopy.common.done}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(24, 31, 45, 0.28)",
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    alignSelf: "center",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: APP_THEME.surface,
    paddingTop: 8,
    boxShadow: "0px -8px 24px rgba(31, 26, 20, 0.12)",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: APP_THEME.borderSoft,
    marginBottom: 8,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  previewTile: {
    width: PREVIEW_SIZE + 24,
    height: PREVIEW_SIZE + 24,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 10px rgba(31, 26, 20, 0.07)",
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: APP_THEME.textMuted,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: APP_THEME.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  emojiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiChip: {
    minWidth: 56,
    height: 56,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: APP_THEME.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiChipSelected: {
    borderColor: APP_THEME.primary,
    backgroundColor: APP_THEME.primarySoft,
  },
  emojiChipLoading: {
    backgroundColor: APP_THEME.surfaceTint,
  },
  emojiChipText: {
    fontSize: 28,
    lineHeight: 34,
    color: APP_THEME.text,
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pillButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: APP_THEME.surfaceTint,
    borderWidth: 1,
    borderColor: APP_THEME.borderSoft,
  },
  pillButtonText: {
    color: APP_THEME.text,
    fontSize: 14,
    fontWeight: "700",
  },
  sourceRow: {
    flexDirection: "row",
    gap: 10,
  },
  sourceTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 20,
    backgroundColor: APP_THEME.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  sourceIcon: {
    fontSize: 28,
    lineHeight: 34,
  },
  sourceLabel: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  draftRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  draftTile: {
    width: DRAFT_SIZE,
    height: DRAFT_SIZE,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "transparent",
    backgroundColor: APP_THEME.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  draftTileSelected: {
    borderColor: APP_THEME.primary,
  },
  draftLoading: {
    backgroundColor: APP_THEME.primarySoft,
  },
  checkBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: APP_THEME.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  aiButton: {
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: APP_THEME.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  aiButtonText: {
    color: APP_THEME.accentBorder,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  disabled: {
    opacity: 0.5,
  },
  hint: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  errorWrap: {
    gap: 4,
  },
  error: {
    color: APP_THEME.dangerBorder,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  authLink: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  authLinkText: {
    color: APP_THEME.primaryBorder,
    fontSize: 13,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: APP_THEME.borderSoft,
  },
  removeButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  removeButtonText: {
    color: APP_THEME.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  doneButton: {
    minHeight: 48,
    minWidth: 120,
    borderRadius: 16,
    backgroundColor: APP_THEME.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  doneButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
