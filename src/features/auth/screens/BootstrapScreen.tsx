import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authService } from '../authService';
import { APP_THEME } from '../../../shared/constants/theme';
import { useAppStore } from '../../../store/useAppStore';

export const BootstrapScreen = () => {
  const setRemoteContext = useAppStore((state) => state.setRemoteContext);
  const setRequiresBootstrap = useAppStore((state) => state.setRequiresBootstrap);

  const [familyName, setFamilyName] = useState('Moje rodina');
  const [childName, setChildName] = useState('Dítě');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const context = await authService.bootstrapCurrentUser({
        familyName,
        childName,
      });

      setRemoteContext(context);
      setRequiresBootstrap(false);
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : 'Bootstrap selhal';
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>První nastavení</Text>
      <Text style={styles.subtitle}>Vytvoř rodinu a profil dítěte pro sync</Text>

      <Text style={styles.label}>Název rodiny</Text>
      <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName} />

      <Text style={styles.label}>Jméno profilu dítěte</Text>
      <TextInput style={styles.input} value={childName} onChangeText={setChildName} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.submitButton} onPress={submit} disabled={isSaving}>
        <Text style={styles.submitText}>{isSaving ? 'Ukládám...' : 'Vytvořit profil'}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: APP_THEME.background,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: APP_THEME.textMuted,
    fontSize: 16,
  },
  label: {
    marginTop: 8,
    color: APP_THEME.text,
    fontWeight: '700',
  },
  input: {
    marginTop: 4,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: {
    marginTop: 12,
    color: APP_THEME.dangerBorder,
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
