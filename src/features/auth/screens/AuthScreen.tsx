import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authService } from '../authService';
import { getOriginalEmailAddress } from '../emailAddress';
import { SCREEN_CONTENT_PADDING } from '../../../shared/constants/layout';
import { APP_THEME } from '../../../shared/constants/theme';
import { getAppCopy } from '../../../shared/i18n/appCopy';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { useAppStore } from '../../../store/useAppStore';
import { ScreenHeader } from '../../caregiver/components/ScreenHeader';

type AuthScreenProps = {
  onBack: () => void;
};

const getErrorStatus = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
};

export const AuthScreen = ({ onBack }: AuthScreenProps) => {
  const authIsAnonymous = useAppStore((state) => state.authIsAnonymous);
  const board = useAppStore((state) => state.board);
  const copy = getAppCopy(board?.locale);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const submit = async () => {
    const originalEmail = getOriginalEmailAddress(email);
    if (!originalEmail) {
      setError(copy.auth.emailRequired);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const emailRedirectTo = isWebPlatform
        ? window.location.origin
        : Linking.createURL('auth');
      await authService.sendMagicLink(originalEmail, emailRedirectTo);
      setCodeSentTo(originalEmail);
      setCode('');
      setMessage(copy.auth.linkSent);
    } catch (submitError) {
      setError(getErrorStatus(submitError) === 429 ? copy.auth.tooManyEmails : copy.auth.sendFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyCode = async () => {
    const trimmedCode = code.replace(/\s+/g, '');
    if (!codeSentTo || trimmedCode.length === 0) {
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      await authService.verifyEmailCode(codeSentTo, trimmedCode);
      onBack();
    } catch (verifyError) {
      setError(getErrorStatus(verifyError) === 429 ? copy.auth.tooManyEmails : copy.auth.codeInvalid);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={24}
      >
        <View style={styles.header}>
          <ScreenHeader title="" onBack={onBack} backLabel={copy.common.back} />
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Cloud sync</Text>
          <Text style={styles.subtitle}>
            {authIsAnonymous
              ? copy.auth.anonymousSubtitle
              : copy.auth.signedOutSubtitle}
          </Text>

          <TextInput
            style={styles.input}
            editable={!codeSentTo}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor="#7C8DA7"
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          {codeSentTo ? (
            <>
              <Text style={styles.codeLabel}>{copy.auth.codeLabel}</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                autoFocus
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                keyboardType="number-pad"
                maxLength={10}
                value={code}
                onChangeText={setCode}
                onSubmitEditing={verifyCode}
                placeholder="123456"
                placeholderTextColor="#7C8DA7"
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {codeSentTo ? (
            <>
              <Pressable
                style={styles.submitButton}
                onPress={verifyCode}
                disabled={isVerifying || code.trim().length === 0}
              >
                <Text style={styles.submitText}>
                  {isVerifying ? copy.auth.verifying : copy.auth.verifyCode}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setCodeSentTo(null);
                  setMessage(null);
                  setError(null);
                }}
              >
                <Text style={styles.secondaryText}>{copy.auth.sendAgain}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.submitButton} onPress={submit} disabled={isSubmitting}>
              <Text style={styles.submitText}>
                {isSubmitting ? copy.auth.sending : copy.auth.sendLink}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: APP_THEME.background,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingTop: SCREEN_CONTENT_PADDING,
    paddingHorizontal: SCREEN_CONTENT_PADDING,
  },
  form: {
    paddingTop: 56,
    paddingHorizontal: 24,
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
  codeLabel: {
    marginTop: 20,
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
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
  secondaryButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: {
    color: APP_THEME.primaryBorder,
    fontSize: 16,
    fontWeight: '700',
  },
});
