import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_THEME } from '../shared/constants/theme';

type UnsupportedBrowserScreenProps = {
  message: string;
};

export const UnsupportedBrowserScreen = ({
  message,
}: UnsupportedBrowserScreenProps) => {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Web verze</Text>
        <Text style={styles.title}>Tento prohlížeč teď ÁňaBoard neutáhne</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.note}>
          Zkus aktuální prohlížeč s HTTPS a trvalým úložištěm.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: APP_THEME.background,
  },
  card: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 12,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  kicker: {
    color: APP_THEME.primaryBorder,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: APP_THEME.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  message: {
    color: APP_THEME.text,
    fontSize: 16,
    lineHeight: 24,
  },
  note: {
    color: APP_THEME.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});
