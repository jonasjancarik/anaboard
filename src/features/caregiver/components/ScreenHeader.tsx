import { Platform, StyleSheet, Text, View } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { BackButton } from '../../../shared/components/BackButton';

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
  const showBackButton = Platform.OS === 'ios' || isWebPlatform;
  return (
    <View style={styles.container}>
      <View style={styles.side}>
        {showBackButton ? <BackButton onPress={onBack} label={backLabel} /> : null}
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
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: APP_THEME.text,
  },
});
