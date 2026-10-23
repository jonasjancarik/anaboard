import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authService, EmailAlreadyUsedError } from '../authService';
import {
  BOARD_GRID_SIZES,
  DEFAULT_BOARD_GRID_SIZE,
  findBoardGridSize,
  type BoardGridSize,
} from '../../../shared/constants/boardGrid';
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
  const setBoardGridSize = useAppStore((state) => state.setBoardGridSize);
  const board = useAppStore((state) => state.board);

  const initialCopy = getAppCopy(DEFAULT_PROFILE_LOCALE);
  const [familyName, setFamilyName] = useState(initialCopy.bootstrap.defaultFamilyName);
  const [childName, setChildName] = useState(initialCopy.bootstrap.defaultChildName);
  const [selectedLocale, setSelectedLocale] =
    useState<SupportedLocale>(DEFAULT_PROFILE_LOCALE);
  const [childGender, setChildGender] =
    useState<ChildGender>(DEFAULT_CHILD_GENDER);
  const [gridSize, setGridSize] = useState<BoardGridSize>(
    () => (board ? findBoardGridSize(board.columns, board.rows) : null) ?? DEFAULT_BOARD_GRID_SIZE
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isBusy = isSaving || isSigningOut;

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
      await setBoardGridSize(gridSize.columns, gridSize.rows);
      setRemoteContext(context);
      setRequiresBootstrap(false);
    } catch (submitError) {
      setError(
        submitError instanceof EmailAlreadyUsedError
          ? copy.bootstrap.emailAlreadyUsed
          : copy.bootstrap.failed
      );
    } finally {
      setIsSaving(false);
    }
  };

  const signOut = async () => {
    setIsSigningOut(true);
    setError(null);

    try {
      // The auth listener in AppRoot leaves this screen once the session is gone.
      await authService.signOut();
    } catch {
      setError(copy.bootstrap.failed);
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
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
                  disabled={isBusy}
                  onPress={() => selectLocale(language.locale)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    selected && styles.optionButtonSelected,
                    pressed && !isBusy && styles.optionButtonPressed,
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
                    disabled={isBusy}
                    onPress={() => setChildGender(option.value)}
                    style={({ pressed }) => [
                      styles.optionButton,
                      selected && styles.optionButtonSelected,
                      pressed && !isBusy && styles.optionButtonPressed,
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

        <View style={styles.optionSection}>
          <Text style={styles.label}>{copy.bootstrap.tileSizeLabel}</Text>
          <Text style={styles.helperText}>{copy.bootstrap.tileSizeHelper}</Text>
          <View style={styles.optionGroup}>
            {BOARD_GRID_SIZES.map((size) => {
              const selected = size.id === gridSize.id;
              return (
                <Pressable
                  key={size.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={isBusy}
                  onPress={() => setGridSize(size)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    selected && styles.optionButtonSelected,
                    pressed && !isBusy && styles.optionButtonPressed,
                  ]}
                >
                  <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                    {copy.settings.tileSizeLabels[size.id]}
                  </Text>
                  <Text style={styles.optionDetail}>
                    {copy.settings.tileSizeDetail(size.columns, size.rows)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.submitButton} onPress={submit} disabled={isBusy}>
          <Text style={styles.submitText}>
            {isSaving ? copy.bootstrap.saving : copy.bootstrap.submit}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={signOut}
          disabled={isBusy}
        >
          <Text style={styles.secondaryText}>
            {isSigningOut ? copy.bootstrap.signingOut : copy.bootstrap.signOut}
          </Text>
        </Pressable>
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
