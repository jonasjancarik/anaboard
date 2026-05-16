import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

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

export const authenticateWithDeviceForCaregiver = async () => {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Odemkni režim pečovatele',
    promptSubtitle: 'ÁňaBoard',
    promptDescription: 'Použij biometriku nebo kód zařízení',
    cancelLabel: 'Zrušit',
    fallbackLabel: 'Použít kód zařízení',
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
