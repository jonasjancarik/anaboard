import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authService } from '../authService';
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
    backgroundColor: '#F3F7FC',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1F2E48',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: '#4E6380',
    fontSize: 16,
  },
  label: {
    marginTop: 8,
    color: '#314A6B',
    fontWeight: '700',
  },
  input: {
    marginTop: 4,
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CDD8EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: {
    marginTop: 12,
    color: '#BB2539',
    fontWeight: '700',
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1F5DAE',
    backgroundColor: '#2F73CD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});
