import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';

type SettingRowButtonProps = {
  title: string;
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
};

export const SettingRowButton = ({
  title,
  detail,
  onPress,
  disabled = false,
  tone = 'default',
}: SettingRowButtonProps) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.rowButton,
        tone === 'danger' && styles.rowButtonDanger,
        disabled && styles.rowButtonDisabled,
        pressed && !disabled && styles.rowButtonPressed,
      ]}
    >
      <View style={styles.copyWrap}>
        <Text style={[styles.title, tone === 'danger' && styles.titleDanger]}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Text style={[styles.chevron, tone === 'danger' && styles.titleDanger]}>›</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  rowButton: {
    minHeight: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowButtonDanger: {
    backgroundColor: APP_THEME.criticalSoft,
    borderColor: APP_THEME.critical,
  },
  rowButtonDisabled: {
    opacity: 0.55,
  },
  rowButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  copyWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '800',
  },
  titleDanger: {
    color: APP_THEME.criticalBorder,
  },
  detail: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    color: APP_THEME.textSoft,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '500',
  },
});
