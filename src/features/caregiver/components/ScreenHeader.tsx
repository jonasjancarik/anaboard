import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  backLabel?: string;
};

export const ScreenHeader = ({
  title,
  onBack,
  backLabel = 'Zpět',
}: ScreenHeaderProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
        >
          <Text style={styles.chevron} allowFontScaling={false}>
            ‹
          </Text>
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.side} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 8,
  },
  side: {
    width: 96,
    justifyContent: 'center',
  },
  backButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 4,
    paddingRight: 6,
  },
  backButtonPressed: {
    opacity: 0.55,
  },
  chevron: {
    marginTop: -1,
    fontSize: 28,
    lineHeight: 28,
    color: APP_THEME.primaryBorder,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: APP_THEME.primaryBorder,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: APP_THEME.text,
  },
});
