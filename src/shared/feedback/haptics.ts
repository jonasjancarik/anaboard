import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const runHaptic = async (
  iosAndWeb: () => Promise<void>,
  android?: () => Promise<void>
) => {
  try {
    if (Platform.OS === 'android' && android) {
      await android();
      return;
    }

    await iosAndWeb();
  } catch {
    // Haptics should stay delight, never a blocker.
  }
};

export const appHaptics = {
  selection: () =>
    runHaptic(
      () => Haptics.selectionAsync(),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
    ),
  tileTap: () =>
    runHaptic(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Press)
    ),
  tap: () =>
    runHaptic(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click)
    ),
  page: () =>
    runHaptic(
      () => Haptics.selectionAsync(),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
    ),
  longPress: () =>
    runHaptic(
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
    ),
  toggle: (nextValue: boolean) =>
    runHaptic(
      () => Haptics.selectionAsync(),
      () =>
        Haptics.performAndroidHapticsAsync(
          nextValue ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off
        )
    ),
  success: () =>
    runHaptic(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
    ),
  error: () =>
    runHaptic(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
    ),
  warning: () =>
    runHaptic(
      () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
      () => Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
    ),
};
