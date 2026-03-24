import { Pressable, Text, View } from "react-native";

import { styles } from "../screens/EditorScreen.styles";

type GeneratedImageDraftSectionProps = {
  visible: boolean;
  isGenerating: boolean;
  isApplying: boolean;
  onApply: () => void;
  onRetry: () => void;
  onDiscard: () => void;
};

export const GeneratedImageDraftSection = ({
  visible,
  isGenerating,
  isApplying,
  onApply,
  onRetry,
  onDiscard,
}: GeneratedImageDraftSectionProps) => {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.aiSection}>
      <Text style={styles.inputLabel}>AI obrázek</Text>
      <Text style={styles.helperText}>
        {isGenerating
          ? "Vytvářím náhled obrázku..."
          : "AI náhled ještě není uložený do dlaždice."}
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
              {isApplying ? "Používám..." : "Použít"}
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
            <Text style={styles.aiActionButtonText}>Zkusit znovu</Text>
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
            <Text style={styles.aiSecondaryButtonText}>Zahodit</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};
