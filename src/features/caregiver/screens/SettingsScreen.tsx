import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authService } from '../../auth/authService';
import { hashPin, isValidPin } from '../../../shared/utils/security';
import { useAppStore } from '../../../store/useAppStore';

type SettingsScreenProps = {
  onBack: () => void;
  onOpenArchive: () => void;
  onLock: () => void;
};

export const SettingsScreen = ({ onBack, onOpenArchive, onLock }: SettingsScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const authStatus = useAppStore((state) => state.authStatus);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resetBoardToDefaults = useAppStore((state) => state.resetBoardToDefaults);

  const [ttsRateText, setTtsRateText] = useState('0.86');
  const [ttsPitchText, setTtsPitchText] = useState('1');
  const [highContrast, setHighContrast] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(true);
  const [backupPinEnabled, setBackupPinEnabled] = useState(true);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isResettingBoard, setIsResettingBoard] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setTtsRateText(String(settings.ttsRate));
    setTtsPitchText(String(settings.ttsPitch));
    setHighContrast(settings.highContrast);
    setShowLabels(settings.showLabels);
    setLockEnabled(settings.lockEnabled);
    setBackupPinEnabled(settings.backupPinEnabled);
  }, [settings]);

  const saveAudioSettings = async () => {
    const nextRate = Number(ttsRateText);
    const nextPitch = Number(ttsPitchText);

    if (!Number.isFinite(nextRate) || !Number.isFinite(nextPitch)) {
      setMessage('Rate/Pitch musí být číslo');
      return;
    }

    await updateSettings({
      ttsRate: Math.min(1.2, Math.max(0.5, nextRate)),
      ttsPitch: Math.min(2, Math.max(0.5, nextPitch)),
      highContrast,
      showLabels,
      lockEnabled,
      backupPinEnabled,
    });

    setMessage('Nastavení uloženo');
  };

  const savePin = async () => {
    if (!settings) {
      setMessage('Nastavení není načtené');
      return;
    }

    if (!isValidPin(newPin) || !isValidPin(confirmPin)) {
      setMessage('Nový PIN musí mít 4 číslice');
      return;
    }

    if (newPin !== confirmPin) {
      setMessage('PINy se neshodují');
      return;
    }

    const currentHash = await hashPin(currentPin);
    if (currentHash !== settings.pinHash) {
      setMessage('Aktuální PIN je špatně');
      return;
    }

    const newPinHash = await hashPin(newPin);
    await updateSettings({ pinHash: newPinHash });

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setMessage('PIN změněn');
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      setMessage('Odhlášeno');
    } catch (signOutError) {
      const nextMessage =
        signOutError instanceof Error ? signOutError.message : 'Odhlášení selhalo';
      setMessage(nextMessage);
    }
  };

  const performBoardReset = async () => {
    setIsResettingBoard(true);
    setMessage(null);

    try {
      await resetBoardToDefaults();
      setMessage('Tabule vrácena na výchozí stav');
    } catch (resetError) {
      const nextMessage =
        resetError instanceof Error ? resetError.message : 'Reset tabule selhal';
      setMessage(nextMessage);
    } finally {
      setIsResettingBoard(false);
    }
  };

  const confirmBoardReset = () => {
    Alert.alert(
      'Resetovat tabuli?',
      'Vrátí výchozí dlaždice a pořadí. Vlastní nahrávky na tabuli se smažou.',
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Resetovat',
          style: 'destructive',
          onPress: () => {
            void performBoardReset();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Zpět</Text>
          </Pressable>
          <Text style={styles.title}>Nastavení</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Správa tabule</Text>

          <Pressable style={[styles.primaryButton, styles.archiveButton]} onPress={onOpenArchive}>
            <Text style={styles.primaryButtonText}>Archiv smazaných dlaždic</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, styles.resetButton, isResettingBoard && styles.buttonDisabled]}
            onPress={confirmBoardReset}
            disabled={isResettingBoard}
          >
            <Text style={styles.primaryButtonText}>
              {isResettingBoard ? 'Resetuji tabuli…' : 'Resetovat na výchozí set'}
            </Text>
          </Pressable>

          <Pressable style={[styles.primaryButton, styles.lockButton]} onPress={onLock}>
            <Text style={styles.primaryButtonText}>Zamknout režim pečovatele</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Řeč a vzhled</Text>

          <Text style={styles.label}>TTS rate (0.5 - 1.2)</Text>
          <TextInput
            value={ttsRateText}
            onChangeText={setTtsRateText}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>TTS pitch (0.5 - 2)</Text>
          <TextInput
            value={ttsPitchText}
            onChangeText={setTtsPitchText}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <View style={styles.switchRow}>
            <Text style={styles.label}>Vysoký kontrast</Text>
            <Switch value={highContrast} onValueChange={setHighContrast} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Zobrazit texty na dlaždicích</Text>
            <Switch value={showLabels} onValueChange={setShowLabels} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Zámek pečovatele</Text>
            <Switch value={lockEnabled} onValueChange={setLockEnabled} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Vlastní PIN v aplikaci</Text>
            <Switch value={backupPinEnabled} onValueChange={setBackupPinEnabled} />
          </View>
          <Text style={styles.helperText}>
            Jen pokud nechceš používat Face ID / kód telefonu. Dá se obnovit přes ověření telefonu.
          </Text>

          <Pressable style={[styles.primaryButton, styles.saveButton]} onPress={saveAudioSettings}>
            <Text style={styles.primaryButtonText}>Uložit nastavení</Text>
          </Pressable>
        </View>

        {backupPinEnabled ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Změna vlastního PINu</Text>

            <Text style={styles.label}>Aktuální PIN</Text>
            <TextInput
              value={currentPin}
              onChangeText={(value) => setCurrentPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
              maxLength={4}
            />

            <Text style={styles.label}>Nový PIN</Text>
            <TextInput
              value={newPin}
              onChangeText={(value) => setNewPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
              maxLength={4}
            />

            <Text style={styles.label}>Potvrď nový PIN</Text>
            <TextInput
              value={confirmPin}
              onChangeText={(value) => setConfirmPin(value.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
              maxLength={4}
            />

            <Pressable style={[styles.primaryButton, styles.pinButton]} onPress={savePin}>
              <Text style={styles.primaryButtonText}>Uložit PIN</Text>
            </Pressable>
          </View>
        ) : null}

        {authStatus === 'signed_in' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Účet</Text>
            <Pressable style={[styles.primaryButton, styles.signOutButton]} onPress={signOut}>
              <Text style={styles.primaryButtonText}>Odhlásit</Text>
            </Pressable>
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7FC',
  },
  content: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1D2E4A',
  },
  backButton: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CFD8EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backButtonText: {
    color: '#2D3F5E',
    fontWeight: '800',
  },
  backButtonPlaceholder: {
    width: 58,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#D0DAED',
    padding: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#223450',
    marginBottom: 8,
  },
  label: {
    color: '#364A67',
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CDD7EA',
    paddingHorizontal: 10,
    fontSize: 16,
  },
  switchRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helperText: {
    marginTop: 6,
    color: '#61738F',
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  saveButton: {
    backgroundColor: '#2E73CD',
    borderColor: '#1F5BA8',
  },
  pinButton: {
    backgroundColor: '#24A44A',
    borderColor: '#1B7C38',
  },
  signOutButton: {
    backgroundColor: '#C6394F',
    borderColor: '#9E2B3E',
  },
  archiveButton: {
    backgroundColor: '#596BDF',
    borderColor: '#4053CB',
  },
  resetButton: {
    backgroundColor: '#D35C3A',
    borderColor: '#AE4425',
  },
  lockButton: {
    backgroundColor: '#7A879A',
    borderColor: '#5B6676',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  message: {
    textAlign: 'center',
    color: '#2E4768',
    fontWeight: '700',
  },
});
