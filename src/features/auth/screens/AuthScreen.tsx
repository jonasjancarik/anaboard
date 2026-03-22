import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { authService } from '../authService';
import { APP_THEME } from '../../../shared/constants/theme';

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
  modeRow: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: APP_THEME.primarySoft,
  },
  modeButtonText: {
    color: APP_THEME.textMuted,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: APP_THEME.primaryBorder,
    fontWeight: '800',
  },
  input: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    marginTop: 10,
  },
  error: {
    marginTop: 10,
    color: APP_THEME.dangerBorder,
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: APP_THEME.primaryBorder,
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
