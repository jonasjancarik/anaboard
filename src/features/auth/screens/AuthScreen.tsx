import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authService } from '../authService';

type AuthMode = 'signin' | 'signup';

export const AuthScreen = () => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6) {
      setError('Zadej e-mail a heslo (min 6 znaků)');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'signin') {
        await authService.signIn(normalizedEmail, password);
        setMessage('Přihlášení proběhlo');
      } else {
        await authService.signUp(normalizedEmail, password);
        setMessage('Účet vytvořen. Pokud máš potvrzení e-mailu zapnuté, potvrď ho.');
      }
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : 'Přihlášení selhalo';
      setError(nextError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AnaBoard účet</Text>
      <Text style={styles.subtitle}>Cloud sync a rodinné profily</Text>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeButton, mode === 'signin' && styles.modeButtonActive]}
          onPress={() => setMode('signin')}
        >
          <Text style={[styles.modeButtonText, mode === 'signin' && styles.modeButtonTextActive]}>
            Přihlásit
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeButton, mode === 'signup' && styles.modeButtonActive]}
          onPress={() => setMode('signup')}
        >
          <Text style={[styles.modeButtonText, mode === 'signup' && styles.modeButtonTextActive]}>
            Vytvořit účet
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        placeholderTextColor="#7C8DA7"
      />

      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholder="Heslo"
        placeholderTextColor="#7C8DA7"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable style={styles.submitButton} onPress={submit} disabled={isSubmitting}>
        <Text style={styles.submitText}>{isSubmitting ? 'Pracuju...' : 'Pokračovat'}</Text>
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
  modeRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CDD8EA',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#E3ECFF',
  },
  modeButtonText: {
    color: '#375074',
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#214D9A',
    fontWeight: '900',
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CDD8EA',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 16,
    marginTop: 10,
  },
  error: {
    marginTop: 10,
    color: '#BB2539',
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: '#2557A7',
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
