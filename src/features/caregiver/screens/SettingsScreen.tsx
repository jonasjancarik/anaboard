import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authService } from '../../auth/authService';
import { speechEngine } from '../../speech/speechEngine';
import { syncService } from '../../sync/syncService';
import { CategoryOrderControl } from '../components/CategoryOrderControl';
import { DiagnosticsSettingsSection } from '../components/DiagnosticsSettingsSection';
import { SettingChoiceStepper } from '../components/SettingChoiceStepper';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingRowButton } from '../components/SettingRowButton';
import { SettingStepper, type SettingStepperOption } from '../components/SettingStepper';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { DEFAULT_VOICE_VALUE, useSpeechVoiceOptions } from '../hooks/useSpeechVoiceOptions';
import {
  DEFAULT_CATEGORY_ORDER,
} from '../../../shared/constants/defaults';
import {
  DEFAULT_CHILD_GENDER,
  getSupportedLanguage,
  isGenderedLocale,
  normalizeChildGender,
  normalizeSupportedLocale,
  type ChildGender,
  type SupportedLocale,
} from '../../../shared/i18n/profileLanguage';
import {
  getAppCopy,
  getChildGenderOptions,
  getLanguageOptions,
} from '../../../shared/i18n/appCopy';
import { SCREEN_CONTENT_PADDING } from '../../../shared/constants/layout';
import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { hasSupabaseConfig } from '../../../shared/services/supabaseClient';
import {
  getWebPersistenceSmokeSummary,
  type WebPersistenceSmokeSummary,
} from '../../../shared/storage/webPersistenceSmoke';
import type { BoardLayoutMode, Category } from '../../../shared/types/domain';
import type { SyncIssueCode } from '../../sync/types';
import { useAppStore } from '../../../store/useAppStore';

type SettingsScreenProps = {
  onBack: () => void;
  onOpenArchive: () => void;
  onOpenPinSettings: () => void;
  onOpenAuth: () => void;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

const formatTimestamp = (value: string | null, locale: SupportedLocale): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatSyncIssue = (issueCode: SyncIssueCode | null, locale: SupportedLocale): string | null => {
  const copy = getAppCopy(locale).settings;
  if (issueCode === 'initial_bind_requires_review') {
    return copy.syncIssueInitialBind;
  }

  if (issueCode === 'profile_switch_requires_review') {
    return copy.syncIssueProfileSwitch;
  }

  return null;
};

export const SettingsScreen = ({
  onBack,
  onOpenArchive,
  onOpenPinSettings,
  onOpenAuth,
}: SettingsScreenProps) => {
  const settings = useAppStore((state) => state.settings);
  const board = useAppStore((state) => state.board);
  const tiles = useAppStore((state) => state.tiles);
  const clipsById = useAppStore((state) => state.clipsById);
  const authStatus = useAppStore((state) => state.authStatus);
  const authIsAnonymous = useAppStore((state) => state.authIsAnonymous);
  const remoteContext = useAppStore((state) => state.remoteContext);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const applyLanguagePreferences = useAppStore((state) => state.applyLanguagePreferences);
  const resetBoardToDefaults = useAppStore((state) => state.resetBoardToDefaults);
  const refreshPendingSyncEvents = useAppStore((state) => state.refreshPendingSyncEvents);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const pendingSyncEvents = useAppStore((state) => state.pendingSyncEvents);
  const syncErrorEvents = useAppStore((state) => state.syncErrorEvents);
  const lastSuccessfulSyncAt = useAppStore((state) => state.lastSuccessfulSyncAt);
  const lastSyncPullAt = useAppStore((state) => state.lastSyncPullAt);
  const syncLastIssue = useAppStore((state) => state.syncLastIssue);
  const setBoardPageIndex = useAppStore((state) => state.setBoardPageIndex);
  const locale = normalizeSupportedLocale(board?.locale);
  const copy = getAppCopy(locale);
  const settingsCopy = copy.settings;
  const rateOptions: SettingStepperOption[] = settingsCopy.rateOptions.map((option) => ({
    value: Number(option.value),
    label: option.label,
  }));
  const pitchOptions: SettingStepperOption[] = settingsCopy.pitchOptions.map((option) => ({
    value: Number(option.value),
    label: option.label,
  }));
  const boardLayoutOptions = (['manual', 'category'] as const).map((mode) => ({
    value: mode,
    label: settingsCopy.layoutOptions[mode].label,
    detail: settingsCopy.layoutOptions[mode].detail,
  }));
  const choicePreviousLabel = locale === 'en-US' ? 'previous' : 'předchozí';
  const choiceNextLabel = locale === 'en-US' ? 'next' : 'další';
  const stepperDecreaseLabel = locale === 'en-US' ? 'decrease' : 'snížit';
  const stepperIncreaseLabel = locale === 'en-US' ? 'increase' : 'zvýšit';
  const languageOptions = getLanguageOptions(locale);
  const childGenderOptions = getChildGenderOptions(locale);
  const { voiceOptions, isVoiceOptionsLoading } = useSpeechVoiceOptions(locale);

  const [ttsRate, setTtsRate] = useState(0.86);
  const [ttsPitch, setTtsPitch] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [phraseBarEnabled, setPhraseBarEnabled] = useState(true);
  const [suggestionCount, setSuggestionCount] = useState('3');
  const [boardLayoutMode, setBoardLayoutMode] = useState<BoardLayoutMode>('manual');
  const [categoryOrder, setCategoryOrder] = useState<Category[]>([...DEFAULT_CATEGORY_ORDER]);
  const [categoriesStartNewPage, setCategoriesStartNewPage] = useState(true);
  const [boardLocale, setBoardLocale] = useState<SupportedLocale>(locale);
  const [childGender, setChildGender] = useState<ChildGender>('masculine');
  const [lockEnabled, setLockEnabled] = useState(true);
  const [backupPinEnabled, setBackupPinEnabled] = useState(true);
  const [selectedVoiceValue, setSelectedVoiceValue] = useState(DEFAULT_VOICE_VALUE);
  const [message, setMessage] = useState<string | null>(null);
  const [isResettingBoard, setIsResettingBoard] = useState(false);
  const [isSyncActionRunning, setIsSyncActionRunning] = useState(false);
  const [webPersistenceSummary, setWebPersistenceSummary] =
    useState<WebPersistenceSmokeSummary | null>(null);

  useEffect(() => {
    if (!settings) {
      return;
    }

    setTtsRate(settings.ttsRate);
    setTtsPitch(settings.ttsPitch);
    setHighContrast(settings.highContrast);
    setShowLabels(settings.showLabels);
    setPhraseBarEnabled(settings.phraseBarEnabled);
    setSuggestionCount(String(settings.suggestionCount));
    setBoardLayoutMode(settings.boardLayoutMode);
    setCategoryOrder(settings.categoryOrder);
    setCategoriesStartNewPage(settings.categoriesStartNewPage);
    setBoardLocale(locale);
    setChildGender(settings.childGender);
    setLockEnabled(settings.lockEnabled);
    setBackupPinEnabled(settings.backupPinEnabled);
    setSelectedVoiceValue(settings.preferredVoice ?? DEFAULT_VOICE_VALUE);
  }, [locale, settings]);

  useEffect(() => {
    if (selectedVoiceValue === DEFAULT_VOICE_VALUE) {
      return;
    }

    if (voiceOptions.some((option) => option.value === selectedVoiceValue)) {
      return;
    }

    setSelectedVoiceValue(DEFAULT_VOICE_VALUE);
  }, [selectedVoiceValue, voiceOptions]);

  useEffect(() => {
    if (!isWebPlatform) {
      return;
    }

    let isCancelled = false;

    const loadWebPersistenceSummary = async () => {
      try {
        const summary = await getWebPersistenceSmokeSummary();
        if (!isCancelled) {
          setWebPersistenceSummary(summary);
        }
      } catch {
        if (!isCancelled) {
          setWebPersistenceSummary({
            status: 'pending_reload',
            bootCount: 0,
          });
        }
      }
    };

    void loadWebPersistenceSummary();

    return () => {
      isCancelled = true;
    };
  }, []);

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
      void appHaptics.error();
      setValue(previousValue);
      setMessage(getErrorMessage(error, fallbackMessage));
    }
  };

  const updateLanguagePreference = async (
    previousLocale: SupportedLocale,
    nextLocale: SupportedLocale,
  ) => {
    const nextGender = isGenderedLocale(nextLocale) ? childGender : DEFAULT_CHILD_GENDER;
    setMessage(null);
    setBoardLocale(nextLocale);

    try {
      await applyLanguagePreferences({
        locale: nextLocale,
        childGender: nextGender,
      });
      setChildGender(nextGender);
      setBoardPageIndex(0);
    } catch (error) {
      void appHaptics.error();
      setBoardLocale(previousLocale);
      setMessage(getErrorMessage(error, copy.languageOptions.saveLocaleError));
    }
  };

  const previewVoice = async (
    nextRate: number,
    nextPitch: number,
    nextVoiceValue: string = selectedVoiceValue
  ) => {
    try {
      await speechEngine.previewTts(settingsCopy.voicePreviewText, {
        ttsRate: nextRate,
        ttsPitch: nextPitch,
        preferredVoice: nextVoiceValue === DEFAULT_VOICE_VALUE ? undefined : nextVoiceValue,
        locale,
      });
    } catch {
      setMessage(
        isWebPlatform
          ? settingsCopy.voicePreviewFailedWeb
          : settingsCopy.voicePreviewFailedNative
      );
    }
  };

  const signOut = async () => {
    setMessage(null);

    try {
      await authService.signOut();
      void appHaptics.success();
      setMessage(settingsCopy.signOutSuccess);
    } catch (error) {
      void appHaptics.error();
      setMessage(getErrorMessage(error, settingsCopy.signOutError));
    }
  };

  const performBoardReset = async () => {
    setIsResettingBoard(true);
    setMessage(null);

    try {
      await resetBoardToDefaults();
      void appHaptics.success();
      setMessage(settingsCopy.boardResetSuccess);
    } catch (error) {
      void appHaptics.error();
      setMessage(getErrorMessage(error, settingsCopy.boardResetError));
    } finally {
      setIsResettingBoard(false);
    }
  };

  const runSyncAction = async (action: () => Promise<void>, successMessage: string) => {
    setIsSyncActionRunning(true);
    setMessage(null);

    try {
      await action();
      await refreshPendingSyncEvents();
      void appHaptics.success();
      setMessage(successMessage);
    } catch (error) {
      void appHaptics.error();
      setMessage(getErrorMessage(error, settingsCopy.cloudSyncError));
    } finally {
      setIsSyncActionRunning(false);
    }
  };

  const confirmBoardReset = () => {
    if (isWebPlatform && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `${settingsCopy.boardResetConfirmTitle}\n\n${settingsCopy.boardResetConfirmBody}`
      );
      if (confirmed) {
        void performBoardReset();
      }
      return;
    }

    Alert.alert(
      settingsCopy.boardResetConfirmTitle,
      settingsCopy.boardResetConfirmBody,
      [
        {
          text: copy.common.cancel,
          style: 'cancel',
        },
        {
          text: settingsCopy.resetConfirmAction,
          style: 'destructive',
          onPress: () => {
            void performBoardReset();
          },
        },
      ]
    );
  };

  const pinDetail = !lockEnabled
    ? settingsCopy.pinDetailOff
    : isWebPlatform
      ? settingsCopy.pinDetailWeb
      : backupPinEnabled
        ? settingsCopy.pinDetailBackup
        : settingsCopy.pinDetailEnable;

  const webStorageDetail =
    webPersistenceSummary === null
      ? settingsCopy.webStorageChecking
      : webPersistenceSummary.status === 'passed'
        ? settingsCopy.webStoragePassed
        : settingsCopy.webStoragePending;

  const availableVoiceOptions = voiceOptions.filter((option) => option.value !== DEFAULT_VOICE_VALUE);
  const availableVoiceCount = availableVoiceOptions.length;
  const shouldShowVoicePicker = availableVoiceCount > 1;
  const voiceRowTitle = settingsCopy.selectedVoice;
  const voiceSetupInstruction =
    Platform.OS === 'ios'
      ? settingsCopy.voiceSetupIos
      : Platform.OS === 'android'
        ? settingsCopy.voiceSetupAndroid
        : settingsCopy.voiceSetupOther;
  const voiceAvailabilityTitle = isVoiceOptionsLoading
    ? settingsCopy.loadingVoices
    : availableVoiceCount === 0
      ? settingsCopy.languageVoiceTitle
      : settingsCopy.availableVoiceTitle;
  const voiceAvailabilityDetail = isVoiceOptionsLoading
    ? settingsCopy.languageVoiceChecking
    : availableVoiceCount === 0
      ? settingsCopy.noLanguageVoice(voiceSetupInstruction)
      : settingsCopy.oneLanguageVoice(availableVoiceOptions[0].label, voiceSetupInstruction);

  const handleVoiceChange = (nextVoiceValue: string) => {
    void updateSetting(
      selectedVoiceValue,
      nextVoiceValue,
      setSelectedVoiceValue,
      {
        preferredVoice: nextVoiceValue === DEFAULT_VOICE_VALUE ? null : nextVoiceValue,
      },
      settingsCopy.saveVoiceError,
      () => previewVoice(ttsRate, ttsPitch, nextVoiceValue)
    );
  };

  const lastSuccessfulSyncLabel = formatTimestamp(lastSuccessfulSyncAt, locale);
  const lastPullLabel = formatTimestamp(lastSyncPullAt, locale);
  const syncIssueDetail = formatSyncIssue(syncLastIssue, locale);
  const language = getSupportedLanguage(boardLocale);
  const languageLabel =
    locale === 'en-US' ? language.labelEn : language.label;
  const languageDetail = isGenderedLocale(language.locale)
    ? copy.languageOptions.genderedSettingsDetail
    : copy.languageOptions.nongenderedSettingsDetail;
  const syncUnavailable = !hasSupabaseConfig || authStatus === 'disabled';
  const syncSignedOut = !syncUnavailable && authStatus === 'signed_out';
  const syncAnonymous = !syncUnavailable && authStatus === 'signed_in' && authIsAnonymous;
  const syncStatusTitle = syncUnavailable
    ? settingsCopy.syncStatus.unavailable
    : syncSignedOut
      ? settingsCopy.syncStatus.signedOut
      : syncAnonymous
      ? settingsCopy.syncStatus.anonymous
      : syncStatus === 'offline'
      ? settingsCopy.syncStatus.offline
      : syncStatus === 'syncing'
        ? settingsCopy.syncStatus.syncing
        : syncStatus === 'error'
          ? settingsCopy.syncStatus.error
          : pendingSyncEvents > 0
            ? settingsCopy.syncStatus.pending
            : settingsCopy.syncStatus.running;
  const syncStatusDetailParts = syncUnavailable
    ? [
        settingsCopy.syncDetail.missingConfig,
        pendingSyncEvents > 0
          ? settingsCopy.syncDetail.localChanges(pendingSyncEvents)
          : settingsCopy.syncDetail.localChanges(0),
        syncErrorEvents > 0 ? settingsCopy.syncDetail.previousErrors(syncErrorEvents) : null,
        settingsCopy.syncDetail.noAuthSync,
      ]
    : syncSignedOut
      ? [
          settingsCopy.syncDetail.localWithoutSignIn,
          pendingSyncEvents > 0
            ? settingsCopy.syncDetail.localChanges(pendingSyncEvents)
            : settingsCopy.syncDetail.localChanges(0),
          settingsCopy.syncDetail.signInForSync,
        ]
    : syncAnonymous
      ? [
          settingsCopy.syncDetail.anonymousMode,
          settingsCopy.syncDetail.anonymousAi,
          settingsCopy.syncDetail.anonymousConvert,
        ]
    : [
        remoteContext?.caregiverEmail
          ? settingsCopy.syncDetail.account(remoteContext.caregiverEmail)
          : null,
        syncIssueDetail,
        pendingSyncEvents > 0
          ? settingsCopy.syncDetail.queue(pendingSyncEvents)
          : settingsCopy.syncDetail.queue(0),
        syncErrorEvents > 0
          ? settingsCopy.syncDetail.errors(syncErrorEvents)
          : settingsCopy.syncDetail.errors(0),
        lastSuccessfulSyncLabel ? settingsCopy.syncDetail.lastDone(lastSuccessfulSyncLabel) : null,
        lastPullLabel ? settingsCopy.syncDetail.lastPulled(lastPullLabel) : null,
      ];
  const syncStatusDetail = syncStatusDetailParts.filter(Boolean).join('\n');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={settingsCopy.title} onBack={onBack} backLabel={copy.common.back} />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{settingsCopy.sections.cloud}</Text>
          <View style={styles.cardStack}>
            <View style={styles.statusBlock}>
              <Text style={styles.statusTitle}>{syncStatusTitle}</Text>
              <Text style={styles.statusDetail}>{syncStatusDetail}</Text>
            </View>
            {syncSignedOut || syncAnonymous ? (
              <>
                <View style={styles.divider} />
                <SettingRowButton
                  title={syncAnonymous ? settingsCopy.registerTitle : settingsCopy.signInTitle}
                  detail={settingsCopy.signInDetail}
                  onPress={onOpenAuth}
                />
              </>
            ) : null}
            {hasSupabaseConfig && authStatus === 'signed_in' && !authIsAnonymous ? (
              <>
                <View style={styles.divider} />
                <SettingRowButton
                  title={isSyncActionRunning ? settingsCopy.syncingNowTitle : settingsCopy.syncNowTitle}
                  detail={settingsCopy.syncNowDetail}
                  disabled={isSyncActionRunning}
                  onPress={() => {
                    void runSyncAction(() => syncService.runOnce(), settingsCopy.syncChecked);
                  }}
                />
                {syncErrorEvents > 0 ? (
                  <>
                    <View style={styles.divider} />
                    <SettingRowButton
                      title={settingsCopy.retryFailedTitle}
                      detail={settingsCopy.retryFailedDetail}
                      disabled={isSyncActionRunning}
                      onPress={() => {
                        void runSyncAction(
                          () => syncService.retryFailed(),
                          settingsCopy.retryQueued
                        );
                      }}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{settingsCopy.sections.language}</Text>
          <View style={styles.cardStack}>
            <View style={styles.statusBlock}>
              <Text style={styles.statusTitle}>
                {copy.languageOptions.boardLanguage}: {languageLabel}
              </Text>
              <Text style={styles.statusDetail}>{languageDetail}</Text>
            </View>
            <View style={styles.divider} />
            <SettingChoiceStepper
              title={copy.languageOptions.boardLanguage}
              value={boardLocale}
              options={languageOptions}
              previousLabel={choicePreviousLabel}
              nextLabel={choiceNextLabel}
              onChange={(nextValue) => {
                const nextLocale = normalizeSupportedLocale(nextValue);
                void updateLanguagePreference(boardLocale, nextLocale);
              }}
            />
            {isGenderedLocale(language.locale) ? (
              <>
                <View style={styles.divider} />
                <SettingChoiceStepper
                  title={copy.languageOptions.userGender}
                  value={childGender}
                  options={childGenderOptions}
                  previousLabel={choicePreviousLabel}
                  nextLabel={choiceNextLabel}
                  onChange={(nextValue) => {
                    const nextGender = normalizeChildGender(nextValue);
                    void updateSetting(
                      childGender,
                      nextGender,
                      setChildGender,
                      { childGender: nextGender },
                      copy.languageOptions.saveGenderError
                    );
                  }}
                />
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{settingsCopy.sections.voice}</Text>
          <View style={styles.cardStack}>
            <SettingStepper
              title={settingsCopy.speechRate}
              value={ttsRate}
              options={rateOptions}
              decreaseLabel={stepperDecreaseLabel}
              increaseLabel={stepperIncreaseLabel}
              onChange={(nextValue) => {
                void updateSetting(
                  ttsRate,
                  nextValue,
                  setTtsRate,
                  { ttsRate: nextValue },
                  settingsCopy.saveRateError,
                  () => previewVoice(nextValue, ttsPitch)
                );
              }}
            />
            <View style={styles.divider} />
            <SettingStepper
              title={settingsCopy.speechPitch}
              value={ttsPitch}
              options={pitchOptions}
              decreaseLabel={stepperDecreaseLabel}
              increaseLabel={stepperIncreaseLabel}
              onChange={(nextValue) => {
                void updateSetting(
                  ttsPitch,
                  nextValue,
                  setTtsPitch,
                  { ttsPitch: nextValue },
                  settingsCopy.savePitchError,
                  () => previewVoice(ttsRate, nextValue)
                );
              }}
            />
            <View style={styles.divider} />
            {shouldShowVoicePicker ? (
              <SettingChoiceStepper
                title={voiceRowTitle}
                value={selectedVoiceValue}
                options={voiceOptions}
                disabled={isVoiceOptionsLoading}
                previousLabel={choicePreviousLabel}
                nextLabel={choiceNextLabel}
                onChange={handleVoiceChange}
              />
            ) : (
              <View style={styles.statusBlock}>
                <Text style={styles.statusTitle}>{voiceAvailabilityTitle}</Text>
                <Text style={styles.statusDetail}>{voiceAvailabilityDetail}</Text>
              </View>
            )}
            {!isWebPlatform ? (
              <>
                <View style={styles.divider} />
                <View style={styles.statusBlock}>
                  <Text style={styles.statusTitle}>{settingsCopy.iosSilentTitle}</Text>
                  <Text style={styles.statusDetail}>
                    {settingsCopy.iosSilentDetail}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{settingsCopy.sections.appearanceSecurity}</Text>
          <View style={styles.cardStack}>
            <SettingToggleRow
              title={settingsCopy.highContrast}
              value={highContrast}
              onValueChange={(nextValue) => {
                void updateSetting(
                  highContrast,
                  nextValue,
                  setHighContrast,
                  { highContrast: nextValue },
                  settingsCopy.saveContrastError
                );
              }}
            />
            <View style={styles.divider} />
            <SettingToggleRow
              title={settingsCopy.showLabels}
              value={showLabels}
              onValueChange={(nextValue) => {
                void updateSetting(
                  showLabels,
                  nextValue,
                  setShowLabels,
                  { showLabels: nextValue },
                  settingsCopy.saveLabelsError
                );
              }}
            />
            <View style={styles.divider} />
            <SettingChoiceStepper
              title={settingsCopy.boardOrdering}
              value={boardLayoutMode}
              options={boardLayoutOptions}
              previousLabel={choicePreviousLabel}
              nextLabel={choiceNextLabel}
              onChange={(nextValue) => {
                const nextMode = nextValue as BoardLayoutMode;
                void updateSetting(
                  boardLayoutMode,
                  nextMode,
                  setBoardLayoutMode,
                  { boardLayoutMode: nextMode },
                  settingsCopy.saveOrderingError,
                  () => setBoardPageIndex(0)
                );
              }}
            />
            {boardLayoutMode === 'category' ? (
              <>
                <View style={styles.divider} />
                <SettingToggleRow
                  title={settingsCopy.categoriesNewPage}
                  detail={settingsCopy.categoriesNewPageDetail}
                  value={categoriesStartNewPage}
                  onValueChange={(nextValue) => {
                    void updateSetting(
                      categoriesStartNewPage,
                      nextValue,
                      setCategoriesStartNewPage,
                      { categoriesStartNewPage: nextValue },
                      settingsCopy.saveCategoryPagesError,
                      () => setBoardPageIndex(0)
                    );
                  }}
                />
                <View style={styles.divider} />
                <CategoryOrderControl
                  value={categoryOrder}
                  locale={locale}
                  onChange={(nextOrder) => {
                    void updateSetting(
                      categoryOrder,
                      nextOrder,
                      setCategoryOrder,
                      { categoryOrder: nextOrder },
                      settingsCopy.saveCategoryOrderError,
                      () => setBoardPageIndex(0)
                    );
                  }}
                />
              </>
            ) : null}
            <View style={styles.divider} />
            <SettingToggleRow
              title={settingsCopy.quickPhrases}
              detail={settingsCopy.quickPhrasesDetail}
              value={phraseBarEnabled}
              onValueChange={(nextValue) => {
                void updateSetting(
                  phraseBarEnabled,
                  nextValue,
                  setPhraseBarEnabled,
                  { phraseBarEnabled: nextValue },
                  settingsCopy.saveQuickPhrasesError
                );
              }}
            />
            {phraseBarEnabled ? (
              <>
                <View style={styles.divider} />
                <SettingChoiceStepper
                  title={settingsCopy.suggestionCount}
                  value={suggestionCount}
                  options={settingsCopy.suggestionCountOptions}
                  previousLabel={choicePreviousLabel}
                  nextLabel={choiceNextLabel}
                  onChange={(nextValue) => {
                    void updateSetting(
                      suggestionCount,
                      nextValue,
                      setSuggestionCount,
                      { suggestionCount: Number(nextValue) },
                      settingsCopy.saveSuggestionCountError
                    );
                  }}
                />
              </>
            ) : null}
            <View style={styles.divider} />
            <SettingToggleRow
              title={settingsCopy.protectSettings}
              detail={
                isWebPlatform
                  ? settingsCopy.protectSettingsWebDetail
                  : settingsCopy.protectSettingsNativeDetail
              }
              value={lockEnabled}
              onValueChange={(nextValue) => {
                void updateSetting(
                  lockEnabled,
                  nextValue,
                  setLockEnabled,
                  { lockEnabled: nextValue },
                  settingsCopy.saveProtectionError
                );
              }}
            />
            <View style={styles.divider} />
            <SettingRowButton
              title={
                isWebPlatform
                  ? settingsCopy.appPin
                  : backupPinEnabled
                    ? settingsCopy.changeAppPin
                    : settingsCopy.setAppPin
              }
              detail={pinDetail}
              onPress={onOpenPinSettings}
            />
            {!isWebPlatform ? (
              <>
                <View style={styles.divider} />
                <SettingToggleRow
                  title={settingsCopy.appPinToggle}
                  detail={settingsCopy.appPinToggleDetail}
                  value={backupPinEnabled}
                  onValueChange={(nextValue) => {
                    void updateSetting(
                      backupPinEnabled,
                      nextValue,
                      setBackupPinEnabled,
                      { backupPinEnabled: nextValue },
                      settingsCopy.savePinChoiceError
                    );
                  }}
                />
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <View style={styles.statusBlock}>
                  <Text style={styles.statusTitle}>{settingsCopy.webStorage}</Text>
                  <Text style={styles.statusDetail}>{webStorageDetail}</Text>
                </View>
              </>
            )}
          </View>
        </View>
        <DiagnosticsSettingsSection
          locale={locale}
          diagnosticsInput={{
            authStatus,
            authIsAnonymous,
            syncStatus,
            pendingSyncEvents,
            syncErrorEvents,
            lastSuccessfulSyncAt,
            lastSyncPullAt,
            syncLastIssue,
            board,
            tiles,
            clipsById,
            settings,
            webPersistenceSummary,
          }}
          onMessage={setMessage}
        />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{settingsCopy.sections.boardManagement}</Text>
          <View style={styles.cardStack}>
            <SettingRowButton
              title={settingsCopy.archive}
              detail={settingsCopy.archiveDetail}
              onPress={onOpenArchive}
            />
            <SettingRowButton
              title={isResettingBoard ? settingsCopy.resettingDefaults : settingsCopy.resetDefaults}
              detail={settingsCopy.resetDefaultsDetail}
              tone="danger"
              disabled={isResettingBoard}
              onPress={confirmBoardReset}
            />
          </View>
        </View>
        {authStatus === 'signed_in' && !authIsAnonymous ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{settingsCopy.sections.account}</Text>
            <SettingRowButton
              title={settingsCopy.signOut}
              detail={settingsCopy.signOutDetail}
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
    padding: SCREEN_CONTENT_PADDING,
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
    boxShadow: '0px 8px 16px rgba(31, 26, 20, 0.08)',
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
  statusBlock: {
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statusTitle: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: '800',
  },
  statusDetail: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
