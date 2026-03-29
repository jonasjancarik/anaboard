import { Pressable, StyleSheet, Text } from 'react-native';

import { APP_THEME } from '../constants/theme';
import { appHaptics } from '../feedback/haptics';

type BackButtonProps = {
  onPress: () => void;
  label?: string;
};

export const BackButton = ({ onPress, label = 'Zpět' }: BackButtonProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        void appHaptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.chevron} allowFontScaling={false}>
        ‹
      </Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 6,
  },
  buttonPressed: {
    opacity: 0.55,
  },
  chevron: {
    marginTop: -1,
    fontSize: 28,
    lineHeight: 28,
    color: APP_THEME.primaryBorder,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
    color: APP_THEME.primaryBorder,
  },
});
