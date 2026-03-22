import { StyleSheet, Switch, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';

type SettingToggleRowProps = {
  title: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export const SettingToggleRow = ({
  title,
  detail,
  value,
  onValueChange,
}: SettingToggleRowProps) => {
  return (
    <View style={styles.row}>
      <View style={styles.copyWrap}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: APP_THEME.borderStrong,
          true: APP_THEME.success,
        }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={APP_THEME.borderStrong}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
    paddingRight: 6,
  },
  title: {
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  detail: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
