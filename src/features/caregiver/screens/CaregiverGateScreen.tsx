import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  authenticateWithDeviceForCaregiver,
  canUseNativeCaregiverAuth,
} from '../../../shared/utils/deviceAuth';
import { hashPin } from '../../../shared/utils/security';
import { useAppStore } from '../../../store/useAppStore';

type CaregiverGateScreenProps = {
  onPassed: () => void;
  onCancel: () => void;
};

export const CaregiverGateScreen = ({ onPassed, onCancel }: CaregiverGateScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const unlockCaregiver = useAppStore((state) => state.unlockCaregiver);
  const updateSettings = useAppStore((state) => state.updateSettings);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canRecoverWithDeviceAuth, setCanRecoverWithDeviceAuth] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const pinInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (!settings.lockEnabled) {
      unlockCaregiver();
      onPassed();
      return;
    }
  }, [onPassed, settings, unlockCaregiver]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      pinInputRef.current?.focus();
    }, 120);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const checkRecoveryPath = async () => {
      const nativeAvailable = await canUseNativeCaregiverAuth();
      if (!isCancelled) {
        setCanRecoverWithDeviceAuth(nativeAvailable);
      }
    };

    void checkRecoveryPath();

    return () => {
      isCancelled = true;
    };
  }, []);

  const recoverWithDeviceAuth = async () => {
    if (!settings || isRecovering) {
      return;
    }

    setError(null);
    setIsRecovering(true);

    try {
      const result = await authenticateWithDeviceForCaregiver();
      if (!result.success) {
        if (
          result.error === 'user_cancel' ||
          result.error === 'system_cancel' ||
          result.error === 'app_cancel'
        ) {
          return;
        }

        setError('Ověření telefonu se nepovedlo.');
        return;
      }

      await updateSettings({ backupPinEnabled: false });
      unlockCaregiver();
      onPassed();
    } catch {
      setError('Ověření telefonu se nepovedlo.');
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Režim pečovatele</Text>
      <Text style={styles.subtitle}>Zadej vlastní PIN pro úpravy tabule</Text>

      <Text style={styles.pinTitle}>Vlastní PIN v aplikaci</Text>

      <TextInput
        ref={pinInputRef}
        value={pin}
        onChangeText={(value) => {
          const nextPin = value.replace(/[^0-9]/g, '').slice(0, 4);
          setPin(nextPin);
          setError(null);

          if (nextPin.length === 4) {
            void (async () => {
              const incomingHash = await hashPin(nextPin);
              if (!settings) {
                setError('Nastavení není načtené');
                return;
              }

              if (incomingHash === settings.pinHash) {
                unlockCaregiver();
                setPin('');
                setError(null);
                onPassed();
                return;
              }

              setPin('');
              setError('Špatný PIN');
              pinInputRef.current?.focus();
            })();
          }
        }}
        keyboardType="number-pad"
        secureTextEntry
        placeholder="••••"
        style={styles.input}
        maxLength={4}
        autoFocus
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {canRecoverWithDeviceAuth ? (
        <Pressable
          style={[styles.recoveryButton, isRecovering && styles.recoveryButtonDisabled]}
          onPress={() => {
            void recoverWithDeviceAuth();
          }}
          disabled={isRecovering}
        >
          {isRecovering ? (
            <ActivityIndicator color="#355C9B" />
          ) : (
            <Text style={styles.recoveryButtonText}>Zapomněl(a) jsem PIN</Text>
          )}
        </Pressable>
      ) : null}

      <View style={styles.row}>
        <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
          <Text style={[styles.buttonText, styles.cancelText]}>Zpět</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>Výchozí PIN: 1234</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F3F7FC',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1E2D47',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#4D607B',
    textAlign: 'center',
  },
  pinTitle: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '800',
    color: '#344763',
  },
  input: {
    marginTop: 10,
    width: 180,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#BCCAE1',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 8,
  },
  error: {
    marginTop: 12,
    color: '#BE2B3A',
    fontWeight: '700',
  },
  recoveryButton: {
    marginTop: 16,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C8D6EC',
    backgroundColor: '#F7FAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryButtonDisabled: {
    opacity: 0.7,
  },
  recoveryButtonText: {
    color: '#355C9B',
    fontWeight: '800',
  },
  row: {
    marginTop: 24,
    flexDirection: 'row',
  },
  button: {
    width: 132,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  cancelButton: {
    borderColor: '#D4DCEB',
    backgroundColor: '#F9FAFF',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cancelText: {
    color: '#2B3D5C',
  },
  note: {
    marginTop: 16,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
});
