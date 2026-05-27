import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { EmojiSuggestion } from "../../../shared/ai/contracts";
import { TileVisual } from "../../../shared/components/TileVisual";
import { APP_THEME } from "../../../shared/constants/theme";
import { getAppCopy } from "../../../shared/i18n/appCopy";
import type { TileVisualType } from "../../../shared/types/domain";

type SmartIconSuggestionsModalProps = {
  visible: boolean;
  label: string;
  previewEmoji: string;
  previewVisualType: TileVisualType;
  previewImageLocalUri?: string | null;
  previewImageRemotePath?: string | null;
  generatedImageLocalUri?: string | null;
  generatedImageRemotePath?: string | null;
  emojiSuggestions: EmojiSuggestion[];
  isEmojiLoading: boolean;
  isImageLoading: boolean;
  isImageApplying: boolean;
  hasGeneratedImage: boolean;
  error: string | null;
  showAuthCta: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  onUseGeneratedImage: () => void;
  onRegenerateImage: () => void;
  onAuth: () => void;
  locale?: unknown;
};

export const SmartIconSuggestionsModal = ({
  visible,
  label,
  previewEmoji,
  previewVisualType,
  previewImageLocalUri,
  previewImageRemotePath,
  generatedImageLocalUri,
  generatedImageRemotePath,
  emojiSuggestions,
  isEmojiLoading,
  isImageLoading,
  isImageApplying,
  hasGeneratedImage,
  error,
  showAuthCta,
  onClose,
  onSelectEmoji,
  onUseGeneratedImage,
  onRegenerateImage,
  onAuth,
  locale,
}: SmartIconSuggestionsModalProps) => {
  const copy = getAppCopy(locale);
  const isImageActionDisabled = isImageLoading || isImageApplying;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheet}>
          <Text style={styles.title}>{copy.smartIcon.title}</Text>
          <Text style={styles.subtitle}>
            {copy.smartIcon.subtitle(label)}
          </Text>

          <View style={styles.previewCard}>
            <TileVisual
              emoji={previewEmoji}
              visualType={previewVisualType}
              imageLocalUri={previewImageLocalUri}
              imageRemotePath={previewImageRemotePath}
              size={92}
            />
            <Text style={styles.previewLabel}>{copy.smartIcon.currentPreview}</Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{copy.smartIcon.emojiSuggestions}</Text>
              {isEmojiLoading ? (
                <Text style={styles.sectionHint}>{copy.smartIcon.searching}</Text>
              ) : null}
            </View>

            {emojiSuggestions.length > 0 ? (
              <View style={styles.emojiWrap}>
                {emojiSuggestions.map((suggestion) => (
                  <Pressable
                    key={`${suggestion.value}:${suggestion.confidence}`}
                    style={styles.emojiChip}
                    onPress={() => onSelectEmoji(suggestion.value)}
                  >
                    <Text style={styles.emojiChipText}>{suggestion.value}</Text>
                  </Pressable>
                ))}
              </View>
            ) : !isEmojiLoading ? (
              <Text style={styles.emptyText}>{copy.smartIcon.noEmoji}</Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{copy.smartIcon.imageSuggestion}</Text>
              {isImageLoading ? (
                <Text style={styles.sectionHint}>{copy.smartIcon.generating}</Text>
              ) : null}
            </View>

            {hasGeneratedImage ? (
              <View style={styles.imageCard}>
                <TileVisual
                  emoji={previewEmoji}
                  visualType="image"
                  imageLocalUri={generatedImageLocalUri}
                  imageRemotePath={generatedImageRemotePath}
                  size={92}
                />
                <View style={styles.imageActions}>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      isImageActionDisabled && styles.disabledButton,
                    ]}
                    onPress={onUseGeneratedImage}
                    disabled={isImageActionDisabled}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isImageApplying ? copy.imageDraft.applying : copy.smartIcon.useImage}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      isImageActionDisabled && styles.disabledButton,
                    ]}
                    onPress={onRegenerateImage}
                    disabled={isImageActionDisabled}
                  >
                    <Text style={styles.secondaryButtonText}>{copy.smartIcon.retryImage}</Text>
                  </Pressable>
                </View>
              </View>
            ) : isImageLoading ? null : (
              <View style={styles.imageActions}>
                <Text style={styles.emptyText}>{copy.smartIcon.noImage}</Text>
                <Pressable style={styles.secondaryButton} onPress={onRegenerateImage}>
                  <Text style={styles.secondaryButtonText}>{copy.smartIcon.suggestImage}</Text>
                </Pressable>
              </View>
            )}
          </View>

          {error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.error}>{error}</Text>
              {showAuthCta ? (
                <Pressable style={styles.authLink} onPress={onAuth}>
                  <Text style={styles.authLinkText}>{copy.editor.signInCta}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{copy.common.done}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(24, 31, 45, 0.28)",
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: APP_THEME.surface,
    padding: 18,
    gap: 16,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  subtitle: {
    marginTop: -8,
    fontSize: 13,
    lineHeight: 18,
    color: APP_THEME.textMuted,
  },
  previewCard: {
    alignItems: "center",
    gap: 8,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: APP_THEME.textMuted,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  sectionHint: {
    fontSize: 13,
    fontWeight: "700",
    color: APP_THEME.textMuted,
  },
  emojiWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  emojiChip: {
    minWidth: 52,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emojiChipText: {
    fontSize: 24,
    lineHeight: 28,
  },
  imageCard: {
    gap: 12,
    alignItems: "center",
  },
  imageActions: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primary,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    backgroundColor: APP_THEME.surfaceTint,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: APP_THEME.text,
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
  emptyText: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
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
  closeButton: {
    minHeight: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    backgroundColor: APP_THEME.surfaceTint,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: "800",
  },
});
