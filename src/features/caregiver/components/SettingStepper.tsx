import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';

export type SettingStepperOption = {
  value: number;
  label: string;
};

type SettingStepperProps = {
  title: string;
  value: number;
  options: SettingStepperOption[];
  onChange: (value: number) => void;
};

const findClosestIndex = (value: number, options: SettingStepperOption[]): number => {
  return options.reduce((closestIndex, option, index) => {
    const currentDistance = Math.abs(option.value - value);
    const closestDistance = Math.abs(options[closestIndex].value - value);
    return currentDistance < closestDistance ? index : closestIndex;
  }, 0);
};

export const SettingStepper = ({
  title,
  value,
  options,
  onChange,
}: SettingStepperProps) => {
  const selectedIndex = findClosestIndex(value, options);

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.valueText}>{options[selectedIndex].label}</Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} snížit`}
          disabled={selectedIndex === 0}
          onPress={() => {
            if (selectedIndex > 0) {
              void appHaptics.selection();
              onChange(options[selectedIndex - 1].value);
            }
          }}
          style={({ pressed }) => [
            styles.edgeButton,
            selectedIndex === 0 && styles.edgeButtonDisabled,
            pressed && selectedIndex > 0 && styles.edgeButtonPressed,
          ]}
        >
          <Text style={styles.edgeButtonText}>−</Text>
        </Pressable>

        <View style={styles.track}>
          {options.map((option, index) => {
            const isPast = index < selectedIndex;
            const isCurrent = index === selectedIndex;

            return (
              <Pressable
                key={`${title}-${option.value}`}
                accessibilityRole="button"
                accessibilityLabel={`${title}: ${option.label}`}
                onPress={() => {
                  void appHaptics.selection();
                  onChange(option.value);
                }}
                style={styles.trackTap}
              >
                <View
                  style={[
                    styles.trackSegment,
                    isPast && styles.trackSegmentFilled,
                    isCurrent && styles.trackSegmentCurrent,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title} zvýšit`}
          disabled={selectedIndex === options.length - 1}
          onPress={() => {
            if (selectedIndex < options.length - 1) {
              void appHaptics.selection();
              onChange(options[selectedIndex + 1].value);
            }
          }}
          style={({ pressed }) => [
            styles.edgeButton,
            selectedIndex === options.length - 1 && styles.edgeButtonDisabled,
            pressed && selectedIndex < options.length - 1 && styles.edgeButtonPressed,
          ]}
        >
          <Text style={styles.edgeButtonText}>+</Text>
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
  valueText: {
    color: APP_THEME.primaryBorder,
    fontSize: 14,
    fontWeight: '800',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  edgeButton: {
    width: 40,
    height: 40,
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
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackTap: {
    flex: 1,
    paddingVertical: 8,
  },
  trackSegment: {
    height: 10,
    borderRadius: 999,
    backgroundColor: APP_THEME.borderSoft,
  },
  trackSegmentFilled: {
    backgroundColor: APP_THEME.primarySoft,
  },
  trackSegmentCurrent: {
    backgroundColor: APP_THEME.primary,
    height: 12,
  },
});
