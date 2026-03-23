import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authService } from '../../auth/authService';
import { speechEngine } from '../../speech/speechEngine';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingRowButton } from '../components/SettingRowButton';
import { SettingStepper, type SettingStepperOption } from '../components/SettingStepper';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { APP_THEME } from '../../../shared/constants/theme';
import { useAppStore } from '../../../store/useAppStore';

type SettingsScreenProps = {
  onBack: () => void;
  onOpenArchive: () => void;
  onOpenPinSettings: () => void;
};

const RATE_OPTIONS: SettingStepperOption[] = [
  { value: 0.6, label: 'Velmi pomalu' },
  { value: 0.75, label: 'Pomaleji' },
  { value: 0.86, label: 'Běžně' },
  { value: 1, label: 'Rychleji' },
  { value: 1.15, label: 'Velmi rychle' },
];

const PITCH_OPTIONS: SettingStepperOption[] = [
  { value: 0.8, label: 'Hlubší' },
  { value: 0.9, label: 'Spíš hlubší' },
  { value: 1, label: 'Běžný' },
  { value: 1.15, label: 'Spíš vyšší' },
  { value: 1.3, label: 'Vyšší' },
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

const VOICE_PREVIEW_TEXT = 'Tohle je ukázka hlasu.';

export const SettingsScreen = ({
  onBack,
  onOpenArchive,
  onOpenPinSettings,
}: SettingsScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const authStatus = useAppStore((state) => state.authStatus);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resetBoardToDefaults = useAppStore((state) => state.resetBoardToDefaults);

  const [ttsRate, setTtsRate] = useState(0.86);
  const [ttsPitch, setTtsPitch] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(true);
  const [backupPinEnabled, setBackupPinEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [isResettingBoard, setIsResettingBoard] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setTtsRate(settings.ttsRate);
    setTtsPitch(settings.ttsPitch);
    setHighContrast(settings.highContrast);
    setShowLabels(settings.showLabels);
    setLockEnabled(settings.lockEnabled);
    setBackupPinEnabled(settings.backupPinEnabled);
  }, [settings]);

  const updateSetting = async <T,>(
    previousValue: T,
    nextValue: T,
    setValue: (value: T) => void,
    update: Parameters<typeof updateSettings>[0],
    fallbackMessage: string,
    onSuccess?: () => Promise<void> | void
  ) => {
    setMessage(null);
    setValue(nextValue);

    try {
      await updateSettings(update);
      await onSuccess?.();
    } catch (error) {
      setValue(previousValue);
      setMessage(getErrorMessage(error, fallbackMessage));
    }
  };

  const previewVoice = async (nextRate: number, nextPitch: number) => {
    try {
      await speechEngine.previewTts(VOICE_PREVIEW_TEXT, {
        ttsRate: nextRate,
        ttsPitch: nextPitch,
        preferredVoice: settings?.preferredVoice,
      });
    } catch {
      // Preview should stay best-effort and never block settings changes.
    }
  };

  const signOut = async () => {
    setMessage(null);

    try {
      await authService.signOut();
      setMessage('Odhlášeno');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Odhlášení selhalo'));
    }
  };

  const performBoardReset = async () => {
    setIsResettingBoard(true);
    setMessage(null);

    try {
      await resetBoardToDefaults();
      setMessage('Tabule vrácena na výchozí stav');
    } catch (error) {
      setMessage(getErrorMessage(error, 'Obnovení tabule selhalo'));
    } finally {
      setIsResettingBoard(false);
    }
  };

  const confirmBoardReset = () => {
    Alert.alert(
      'Obnovit výchozí dlaždice?',
      'Vrátí původní pořadí a smaže vlastní nahrávky na tabuli.',
      [
        {
          text: 'Zrušit',
          style: 'cancel',
        },
        {
          text: 'Obnovit',
          style: 'destructive',
          onPress: () => {
            void performBoardReset();
          },
        },
      ]
    );
  };

  const pinDetail = !lockEnabled
    ? 'Použije se, až znovu zapneš ochranu nastavení.'
    : backupPinEnabled
      ? '4 číslice pro vstup do nastavení.'
      : 'Po uložení se tato volba automaticky zapne.';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Nastavení" onBack={onBack} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Hlas</Text>
          <View style={styles.cardStack}>
            <SettingStepper
              title="Rychlost hlasu"
              value={ttsRate}
              options={RATE_OPTIONS}
              onChange={(nextValue) => {
                void updateSetting(
                  ttsRate,
                  nextValue,
                  setTtsRate,
                  { ttsRate: nextValue },
                  'Rychlost hlasu nešla uložit',
                  () => previewVoice(nextValue, ttsPitch)
                );
              }}
            />

            <View style={styles.divider} />

            <SettingStepper
              title="Tón hlasu"
              value={ttsPitch}
              options={PITCH_OPTIONS}
              onChange={(nextValue) => {
                void updateSetting(
                  ttsPitch,
                  nextValue,
                  setTtsPitch,
                  { ttsPitch: nextValue },
                  'Tón hlasu nešel uložit',
                  () => previewVoice(ttsRate, nextValue)
                );
              }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Vzhled a ochrana</Text>
          <View style={styles.cardStack}>
            <SettingToggleRow
              title="Silnější kontrast"
              value={highContrast}
              onValueChange={(nextValue) => {
                void updateSetting(
                  highContrast,
                  nextValue,
                  setHighContrast,
                  { highContrast: nextValue },
                  'Kontrast nešel uložit'
                );
              }}
            />

            <View style={styles.divider} />

            <SettingToggleRow
              title="Zobrazit názvy na dlaždicích"
              value={showLabels}
              onValueChange={(nextValue) => {
                void updateSetting(
                  showLabels,
                  nextValue,
                  setShowLabels,
                  { showLabels: nextValue },
                  'Zobrazení názvů nešlo uložit'
                );
              }}
            />

            <View style={styles.divider} />

            <SettingToggleRow
              title="Chránit nastavení"
              detail="Před úpravami se ověří pečovatel."
              value={lockEnabled}
              onValueChange={(nextValue) => {
                void updateSetting(
                  lockEnabled,
                  nextValue,
                  setLockEnabled,
                  { lockEnabled: nextValue },
                  'Ochrana nastavení nešla uložit'
                );
              }}
            />

            <View style={styles.divider} />

            <SettingToggleRow
              title="PIN přímo v aplikaci"
              detail="Použij, když nechceš spoléhat jen na zámek telefonu."
              value={backupPinEnabled}
              onValueChange={(nextValue) => {
                void updateSetting(
                  backupPinEnabled,
                  nextValue,
                  setBackupPinEnabled,
                  { backupPinEnabled: nextValue },
                  'Volba PINu nešla uložit'
                );
              }}
            />

            <SettingRowButton
              title={backupPinEnabled ? 'Změnit PIN v aplikaci' : 'Nastavit PIN v aplikaci'}
              detail={pinDetail}
              onPress={onOpenPinSettings}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Správa tabule</Text>
          <View style={styles.cardStack}>
            <SettingRowButton
              title="Archiv smazaných dlaždic"
              detail="Vrátit dříve smazané položky."
              onPress={onOpenArchive}
            />

            <SettingRowButton
              title={isResettingBoard ? 'Obnovuji výchozí dlaždice…' : 'Obnovit výchozí dlaždice'}
              detail="Vrátí původní pořadí a smaže vlastní nahrávky."
              tone="danger"
              disabled={isResettingBoard}
              onPress={confirmBoardReset}
            />
          </View>
        </View>

        {authStatus === 'signed_in' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Účet</Text>
            <SettingRowButton
              title="Odhlásit"
              detail="Odhlásí tento telefon od cloud syncu."
              tone="danger"
              onPress={() => {
                void signOut();
              }}
            />
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
    backgroundColor: APP_THEME.background,
  },
  content: {
    padding: 12,
    gap: 10,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: APP_THEME.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    padding: 16,
    gap: 12,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  cardStack: {
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: APP_THEME.borderSoft,
  },
  message: {
    textAlign: 'center',
    color: APP_THEME.message,
    fontWeight: '700',
    paddingVertical: 2,
  },
});
