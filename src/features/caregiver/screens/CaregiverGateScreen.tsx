import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { hashPin, isValidPin } from '../../../shared/utils/security';
import { useAppStore } from '../../../store/useAppStore';

type CaregiverGateScreenProps = {
  onPassed: () => void;
  onCancel: () => void;
};

export const CaregiverGateScreen = ({ onPassed, onCancel }: CaregiverGateScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const lockoutUntil = useAppStore((state) => state.lockoutUntil);
  const failedPinAttempts = useAppStore((state) => state.failedPinAttempts);
  const unlockCaregiver = useAppStore((state) => state.unlockCaregiver);
  const registerPinFailure = useAppStore((state) => state.registerPinFailure);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lockoutSeconds = useMemo(() => {
    if (!lockoutUntil) {
      return 0;
    }

    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    return Math.max(0, remaining);
  }, [lockoutUntil]);

  const handleSubmit = async () => {
    if (lockoutSeconds > 0) {
      setError(`Zkus to znovu za ${lockoutSeconds}s`);
      return;
    }

    if (!settings) {
      setError('Nastavení není načtené');
      return;
    }

    if (!isValidPin(pin)) {
      setError('PIN musí mít 4 číslice');
      return;
    }

    const incomingHash = await hashPin(pin);
    if (incomingHash === settings.pinHash) {
      unlockCaregiver();
      setPin('');
      setError(null);
      onPassed();
      return;
    }

    registerPinFailure();
    setPin('');
    setError('Špatný PIN');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.title}>Režim pečovatele</Text>
      <Text style={styles.subtitle}>Zadej PIN pro úpravy tabule</Text>

      <TextInput
        value={pin}
        onChangeText={(value) => {
          setPin(value.replace(/[^0-9]/g, '').slice(0, 4));
        }}
        keyboardType="number-pad"
        secureTextEntry
        placeholder="••••"
        style={styles.input}
        maxLength={4}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {lockoutSeconds > 0 ? (
        <Text style={styles.warning}>Dočasný zámek: {lockoutSeconds}s</Text>
      ) : (
        <Text style={styles.warning}>Pokusy: {failedPinAttempts}/3</Text>
      )}

      <View style={styles.row}>
        <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
          <Text style={[styles.buttonText, styles.cancelText]}>Zpět</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.submitButton]} onPress={handleSubmit}>
          <Text style={styles.buttonText}>Odemknout</Text>
        </Pressable>
      </View>

      <Text style={styles.note}>Výchozí PIN: 1234 (změň v nastavení)</Text>
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
  },
  input: {
    marginTop: 24,
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
  warning: {
    marginTop: 8,
    color: '#445873',
    fontSize: 14,
  },
  row: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 12,
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
  submitButton: {
    borderColor: '#327944',
    backgroundColor: '#2AA34A',
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
  },
});
