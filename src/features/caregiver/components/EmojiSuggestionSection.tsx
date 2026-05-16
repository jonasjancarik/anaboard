import { Pressable, Text, View } from "react-native";

import type { EmojiSuggestion } from "../../../shared/ai/contracts";
import { getAppCopy } from "../../../shared/i18n/appCopy";
import { styles } from "../screens/EditorScreen.styles";

type EmojiSuggestionSectionProps = {
  visible: boolean;
  hasLabel: boolean;
  isLoading: boolean;
  error: string | null;
  suggestions: EmojiSuggestion[];
  onRequest: () => void;
  onSelect: (value: string) => void;
  locale?: unknown;
};

export const EmojiSuggestionSection = ({
  visible,
  hasLabel,
  isLoading,
  error,
  suggestions,
  onRequest,
  onSelect,
  locale,
}: EmojiSuggestionSectionProps) => {
  if (!visible) {
    return null;
  }

  const copy = getAppCopy(locale).emojiSuggestion;

  return (
    <View style={styles.aiSection}>
      <View style={styles.aiSectionHeader}>
        <Text style={styles.inputLabel}>{copy.title}</Text>
        <Pressable
          style={[
            styles.aiActionButton,
            (!hasLabel || isLoading) && styles.actionButtonDisabled,
          ]}
          onPress={onRequest}
          disabled={!hasLabel || isLoading}
        >
          <Text style={styles.aiActionButtonText}>
            {isLoading ? copy.searching : copy.suggest}
          </Text>
        </Pressable>
      </View>

      {!hasLabel ? (
        <Text style={styles.helperText}>{copy.labelRequired}</Text>
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
