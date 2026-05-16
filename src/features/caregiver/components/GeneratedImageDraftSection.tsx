import { Pressable, Text, View } from "react-native";

import { getAppCopy } from "../../../shared/i18n/appCopy";
import { styles } from "../screens/EditorScreen.styles";

type GeneratedImageDraftSectionProps = {
  visible: boolean;
  isGenerating: boolean;
  isApplying: boolean;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
  locale?: unknown;
};

export const GeneratedImageDraftSection = ({
  visible,
  isGenerating,
  isApplying,
  onApply,
  onRetry,
  onDiscard,
  locale,
}: GeneratedImageDraftSectionProps) => {
  if (!visible) {
    return null;
  }

  const copy = getAppCopy(locale).imageDraft;

  return (
    <View style={styles.aiSection}>
      <Text style={styles.inputLabel}>{copy.title}</Text>
      <Text style={styles.helperText}>
        {isGenerating
          ? copy.generating
          : copy.draftReady}
      </Text>

      {!isGenerating ? (
        <View style={styles.aiImageActions}>
          <Pressable
            style={[
              styles.aiActionButton,
              isApplying && styles.actionButtonDisabled,
            ]}
            onPress={onApply}
            disabled={isApplying}
          >
            <Text style={styles.aiActionButtonText}>
              {isApplying ? copy.applying : copy.apply}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.aiActionButton,
              isApplying && styles.actionButtonDisabled,
            ]}
            onPress={onRetry}
            disabled={isApplying}
          >
            <Text style={styles.aiActionButtonText}>{copy.retry}</Text>
          </Pressable>

          <Pressable
            style={[
              styles.aiActionButton,
              styles.aiSecondaryButton,
              isApplying && styles.actionButtonDisabled,
            ]}
            onPress={onDiscard}
            disabled={isApplying}
          >
            <Text style={styles.aiSecondaryButtonText}>{copy.discard}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};
