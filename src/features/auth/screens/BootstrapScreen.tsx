import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { authService } from '../authService';
import { APP_THEME } from '../../../shared/constants/theme';
import {
  DEFAULT_CHILD_GENDER,
  DEFAULT_PROFILE_LOCALE,
  SUPPORTED_LANGUAGES,
  getSupportedLanguage,
  isGenderedLocale,
  type ChildGender,
  type SupportedLocale,
} from '../../../shared/i18n/profileLanguage';
import {
  getAppCopy,
  getChildGenderOptions,
  getLanguageOptions,
} from '../../../shared/i18n/appCopy';
import { useAppStore } from '../../../store/useAppStore';

export const BootstrapScreen = () => {
  const setRemoteContext = useAppStore((state) => state.setRemoteContext);
  const setRequiresBootstrap = useAppStore((state) => state.setRequiresBootstrap);
  const applyOnboardingPreferences = useAppStore((state) => state.applyOnboardingPreferences);

  const initialCopy = getAppCopy(DEFAULT_PROFILE_LOCALE);
  const [familyName, setFamilyName] = useState(initialCopy.bootstrap.defaultFamilyName);
  const [childName, setChildName] = useState(initialCopy.bootstrap.defaultChildName);
  const [selectedLocale, setSelectedLocale] =
    useState<SupportedLocale>(DEFAULT_PROFILE_LOCALE);
  const [childGender, setChildGender] =
    useState<ChildGender>(DEFAULT_CHILD_GENDER);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLanguage = getSupportedLanguage(selectedLocale);
  const copy = getAppCopy(selectedLocale);
  const languageOptions = getLanguageOptions(selectedLocale);
  const childGenderOptions = getChildGenderOptions(selectedLocale);
  const shouldAskChildGender = isGenderedLocale(selectedLocale);

  const selectLocale = (locale: SupportedLocale) => {
    const nextCopy = getAppCopy(locale);
    if (familyName === copy.bootstrap.defaultFamilyName) {
      setFamilyName(nextCopy.bootstrap.defaultFamilyName);
    }
    if (childName === copy.bootstrap.defaultChildName) {
      setChildName(nextCopy.bootstrap.defaultChildName);
    }
    setSelectedLocale(locale);
  };

  const submit = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const effectiveChildGender = shouldAskChildGender
        ? childGender
        : DEFAULT_CHILD_GENDER;
      const context = await authService.bootstrapCurrentUser({
        familyName,
        childName,
      });

      await applyOnboardingPreferences({
        locale: selectedLocale,
        childGender: effectiveChildGender,
      });
      setRemoteContext(context);
      setRequiresBootstrap(false);
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : copy.bootstrap.failed;
      setError(nextError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>{copy.bootstrap.title}</Text>
        <Text style={styles.subtitle}>{copy.bootstrap.subtitle}</Text>

        <Text style={styles.label}>{copy.bootstrap.familyNameLabel}</Text>
        <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName} />

        <Text style={styles.label}>{copy.bootstrap.childNameLabel}</Text>
        <TextInput style={styles.input} value={childName} onChangeText={setChildName} />

        <View style={styles.optionSection}>
          <Text style={styles.label}>{copy.languageOptions.boardLanguage}</Text>
          <View style={styles.optionGroup}>
            {SUPPORTED_LANGUAGES.map((language) => {
              const option = languageOptions.find((candidate) => candidate.value === language.locale);
              const selected = language.locale === selectedLocale;
              return (
                <Pressable
                  key={language.locale}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={isSaving}
                  onPress={() => selectLocale(language.locale)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    selected && styles.optionButtonSelected,
                    pressed && !isSaving && styles.optionButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionTitle,
                      selected && styles.optionTitleSelected,
                    ]}
                  >
                    {option?.label ?? language.label}
                  </Text>
                  <Text style={styles.optionDetail}>{option?.detail}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {shouldAskChildGender ? (
          <View style={styles.optionSection}>
            <Text style={styles.label}>{copy.languageOptions.userGender}</Text>
            <Text style={styles.helperText}>
              {copy.languageOptions.genderHelper(selectedLanguage.label)}
            </Text>
            <View style={styles.optionGroup}>
              {childGenderOptions.map((option) => {
                const selected = option.value === childGender;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    disabled={isSaving}
                    onPress={() => setChildGender(option.value)}
                    style={({ pressed }) => [
                      styles.optionButton,
                      selected && styles.optionButtonSelected,
                      pressed && !isSaving && styles.optionButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionTitle,
                        selected && styles.optionTitleSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.optionDetail}>{option.detail}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.submitButton} onPress={submit} disabled={isSaving}>
          <Text style={styles.submitText}>
            {isSaving ? copy.bootstrap.saving : copy.bootstrap.submit}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_THEME.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
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
  optionSection: {
    marginTop: 14,
    gap: 8,
  },
  optionGroup: {
    gap: 8,
  },
  optionButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  optionButtonSelected: {
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primarySoft,
  },
  optionButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  optionTitle: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: '800',
  },
  optionTitleSelected: {
    color: APP_THEME.primaryBorder,
  },
  optionDetail: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  helperText: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
