import { Pressable, Text, View } from "react-native";

import type { EmojiSuggestion } from "../../../shared/ai/contracts";
import { styles } from "../screens/EditorScreen.styles";

type EmojiSuggestionSectionProps = {
  visible: boolean;
  hasLabel: boolean;
  isLoading: boolean;
  error: string | null;
  suggestions: EmojiSuggestion[];
  onRequest: () => void;
  onSelect: (value: string) => void;
};

export const EmojiSuggestionSection = ({
  visible,
  hasLabel,
  isLoading,
  error,
  suggestions,
  onRequest,
  onSelect,
}: EmojiSuggestionSectionProps) => {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.aiSection}>
      <View style={styles.aiSectionHeader}>
        <Text style={styles.inputLabel}>Emoji návrh</Text>
        <Pressable
          style={[
            styles.aiActionButton,
            (!hasLabel || isLoading) && styles.actionButtonDisabled,
          ]}
          onPress={onRequest}
          disabled={!hasLabel || isLoading}
        >
          <Text style={styles.aiActionButtonText}>
            {isLoading ? "Hledám..." : "Navrhnout emoji"}
          </Text>
        </Pressable>
      </View>

      {!hasLabel ? (
        <Text style={styles.helperText}>Nejdřív napiš text dlaždice.</Text>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.aiSuggestionWrap}>
          {suggestions.map((suggestion) => (
            <Pressable
              key={`${suggestion.value}:${suggestion.confidence}`}
              style={[styles.chip, styles.aiSuggestionChip]}
              onPress={() => onSelect(suggestion.value)}
            >
              <Text style={styles.aiSuggestionChipText}>{suggestion.value}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.helperText}>{error}</Text> : null}
    </View>
  );
};
