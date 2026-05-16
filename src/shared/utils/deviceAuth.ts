import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { getAppCopy } from '../i18n/appCopy';

export const canUseNativeCaregiverAuth = async (): Promise<boolean> => {
  try {
    const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();
    return enrolledLevel !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
};

export const getNativeCaregiverAuthLabel = async (): Promise<string> => {
  try {
    const authTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (Platform.OS === 'ios' && authTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Použít Face ID';
    }

    if (Platform.OS === 'ios' && authTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Použít Touch ID';
    }

    if (authTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Použít otisk';
    }

    if (authTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Použít odemknutí obličejem';
    }
  } catch {
    // Ignore label detection failures and fall back to a generic CTA.
  }

  return 'Ověřit telefonem';
};

export const authenticateWithDeviceForCaregiver = async (locale?: unknown) => {
  const copy = getAppCopy(locale);
  return LocalAuthentication.authenticateAsync({
    promptMessage:
      locale === 'en-US' ? 'Unlock caregiver mode' : 'Odemkni režim pečovatele',
    promptSubtitle: 'ÁňaBoard',
    promptDescription:
      locale === 'en-US'
        ? 'Use biometrics or the device passcode'
        : 'Použij biometriku nebo kód zařízení',
    cancelLabel: copy.common.cancel,
    fallbackLabel:
      locale === 'en-US' ? 'Use device passcode' : 'Použít kód zařízení',
    disableDeviceFallback: false,
    requireConfirmation: false,
    biometricsSecurityLevel: 'weak',
  });
};

export const cancelNativeCaregiverAuth = async (): Promise<void> => {
  try {
    await LocalAuthentication.cancelAuthenticate();
  } catch {
    // Android-only; best effort.
  }
};
