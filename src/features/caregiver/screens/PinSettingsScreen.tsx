import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/ScreenHeader';
import { APP_THEME } from '../../../shared/constants/theme';
import { getAppCopy } from '../../../shared/i18n/appCopy';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { hashPin, isValidPin } from '../../../shared/utils/security';
import { useAppStore } from '../../../store/useAppStore';

type PinSettingsScreenProps = {
  onBack: () => void;
};

const normalizePin = (value: string): string => {
  return value.replace(/[^0-9]/g, '').slice(0, 4);
};

export const PinSettingsScreen = ({ onBack }: PinSettingsScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const board = useAppStore((state) => state.board);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const copy = getAppCopy(board?.locale);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const title = useMemo(() => {
    return isWebPlatform || settings?.backupPinEnabled
      ? copy.pinSettings.changeTitle
      : copy.pinSettings.setTitle;
  }, [copy, settings?.backupPinEnabled]);

  const savePin = async () => {
    setMessage(null);

    if (!isValidPin(newPin) || !isValidPin(confirmPin)) {
      setMessage(copy.pinSettings.invalidPin);
      return;
    }

    if (newPin !== confirmPin) {
      setMessage(copy.pinSettings.mismatch);
      return;
    }

    setIsSaving(true);

    try {
      const newPinHash = await hashPin(newPin);
      await updateSettings({
        pinHash: newPinHash,
        backupPinEnabled: true,
      });

      setNewPin('');
      setConfirmPin('');
      setMessage(copy.pinSettings.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.pinSettings.saveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader title={copy.pinSettings.title} onBack={onBack} backLabel={copy.common.back} />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.helperText}>
          {isWebPlatform
            ? copy.pinSettings.webHelper
            : copy.pinSettings.nativeHelper}
        </Text>

        <Text style={styles.label}>{copy.pinSettings.newPin}</Text>
        <TextInput
          value={newPin}
          onChangeText={(value) => setNewPin(normalizePin(value))}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.input}
          maxLength={4}
        />

        <Text style={styles.label}>{copy.pinSettings.confirmPin}</Text>
        <TextInput
          value={confirmPin}
          onChangeText={(value) => setConfirmPin(normalizePin(value))}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.input}
          maxLength={4}
        />

        <Pressable
          onPress={() => {
            void savePin();
          }}
          disabled={isSaving}
          style={({ pressed }) => [
            styles.saveButton,
            isSaving && styles.saveButtonDisabled,
            pressed && !isSaving && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? copy.common.saving : copy.pinSettings.saveButton}
          </Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_THEME.background,
    padding: 12,
    gap: 10,
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
    fontSize: 18,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  helperText: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    marginTop: 4,
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 2,
  },
  saveButton: {
    marginTop: 6,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.successBorder,
    backgroundColor: APP_THEME.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  message: {
    color: APP_THEME.message,
    fontWeight: '700',
  },
});
