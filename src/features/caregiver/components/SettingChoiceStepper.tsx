import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';

export type SettingChoiceOption = {
  value: string;
  label: string;
  detail?: string;
};

type SettingChoiceStepperProps = {
  title: string;
  value: string;
  options: SettingChoiceOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  previousLabel?: string;
  nextLabel?: string;
};

const findSelectedIndex = (value: string, options: SettingChoiceOption[]): number => {
  const exactIndex = options.findIndex((option) => option.value === value);
  return exactIndex >= 0 ? exactIndex : 0;
};

export const SettingChoiceStepper = ({
  title,
  value,
  options,
  onChange,
  disabled = false,
  previousLabel = 'předchozí',
  nextLabel = 'další',
}: SettingChoiceStepperProps) => {
  const selectedIndex = findSelectedIndex(value, options);
  const selectedOption = options[selectedIndex];
  const canGoBack = !disabled && selectedIndex > 0;
  const canGoForward = !disabled && selectedIndex < options.length - 1;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.countText}>
          {selectedIndex + 1}/{options.length}
        </Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} ${previousLabel}`}
          disabled={!canGoBack}
          onPress={() => {
            if (canGoBack) {
              void appHaptics.selection();
              onChange(options[selectedIndex - 1].value);
            }
          }}
          style={({ pressed }) => [
            styles.edgeButton,
            !canGoBack && styles.edgeButtonDisabled,
            pressed && canGoBack && styles.edgeButtonPressed,
          ]}
        >
          <Text style={styles.edgeButtonText}>‹</Text>
        </Pressable>

        <View style={styles.valueCard}>
          <Text style={styles.valueLabel} numberOfLines={2}>
            {selectedOption.label}
          </Text>
          {selectedOption.detail ? (
            <Text style={styles.valueDetail} numberOfLines={2}>
              {selectedOption.detail}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} ${nextLabel}`}
          disabled={!canGoForward}
          onPress={() => {
            if (canGoForward) {
              void appHaptics.selection();
              onChange(options[selectedIndex + 1].value);
            }
          }}
          style={({ pressed }) => [
            styles.edgeButton,
            !canGoForward && styles.edgeButtonDisabled,
            pressed && canGoForward && styles.edgeButtonPressed,
          ]}
        >
          <Text style={styles.edgeButtonText}>›</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  countText: {
    color: APP_THEME.primaryBorder,
    fontSize: 13,
    fontWeight: '800',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  edgeButton: {
    width: 40,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  edgeButtonDisabled: {
    opacity: 0.4,
  },
  edgeButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  edgeButtonText: {
    color: APP_THEME.text,
    fontSize: 24,
    lineHeight: 26,
    fontWeight: '500',
  },
  valueCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  valueLabel: {
    color: APP_THEME.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  valueDetail: {
    color: APP_THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
