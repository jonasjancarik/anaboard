import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authService } from '../../auth/authService';
import { speechEngine } from '../../speech/speechEngine';
import { syncService } from '../../sync/syncService';
import { SettingChoiceStepper } from '../components/SettingChoiceStepper';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingRowButton } from '../components/SettingRowButton';
import { SettingStepper, type SettingStepperOption } from '../components/SettingStepper';
import { SettingToggleRow } from '../components/SettingToggleRow';
import { DEFAULT_VOICE_VALUE, useSpeechVoiceOptions } from '../hooks/useSpeechVoiceOptions';
import { SCREEN_CONTENT_PADDING } from '../../../shared/constants/layout';
import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';
import { isWebPlatform } from '../../../shared/platform/runtime';
import { hasSupabaseConfig } from '../../../shared/services/supabaseClient';
import {
  getWebPersistenceSmokeSummary,
  type WebPersistenceSmokeSummary,
} from '../../../shared/storage/webPersistenceSmoke';
import type { SyncIssueCode } from '../../sync/types';
import { useAppStore } from '../../../store/useAppStore';

type SettingsScreenProps = {
  onBack: () => void;
  onOpenArchive: () => void;
  onOpenPinSettings: () => void;
  onOpenAuth: () => void;
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

const SUGGESTION_COUNT_OPTIONS = [
  { value: '1', label: '1 tip', detail: 'Jen nejsilnější nápověda.' },
  { value: '2', label: '2 tipy', detail: 'Méně rušivé.' },
  { value: '3', label: '3 tipy', detail: 'Vyvážené.' },
  { value: '4', label: '4 tipy', detail: 'Širší výběr.' },
  { value: '5', label: '5 tipů', detail: 'Nejvíc možností.' },
] as const;

const VOICE_PREVIEW_TEXT = 'Tohle je ukázka hlasu.';

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

const formatTimestamp = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatSyncIssue = (issueCode: SyncIssueCode | null): string | null => {
  if (issueCode === 'initial_bind_requires_review') {
    return 'Tento telefon už má vlastní místní data. Bez potvrzení je cloud nepřepíše.';
  }

  if (issueCode === 'profile_switch_requires_review') {
    return 'Tento telefon byl dřív připojený k jiné cloud tabuli. Automatický přenos jsem zablokoval.';
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
  const authStatus = useAppStore((state) => state.authStatus);
  const authIsAnonymous = useAppStore((state) => state.authIsAnonymous);
  const remoteContext = useAppStore((state) => state.remoteContext);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resetBoardToDefaults = useAppStore((state) => state.resetBoardToDefaults);
  const refreshPendingSyncEvents = useAppStore((state) => state.refreshPendingSyncEvents);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const pendingSyncEvents = useAppStore((state) => state.pendingSyncEvents);
  const syncErrorEvents = useAppStore((state) => state.syncErrorEvents);
  const lastSuccessfulSyncAt = useAppStore((state) => state.lastSuccessfulSyncAt);
  const lastSyncPullAt = useAppStore((state) => state.lastSyncPullAt);
  const syncLastIssue = useAppStore((state) => state.syncLastIssue);
  const { voiceOptions, isVoiceOptionsLoading } = useSpeechVoiceOptions();

  const [ttsRate, setTtsRate] = useState(0.86);
  const [ttsPitch, setTtsPitch] = useState(1);
  const [highContrast, setHighContrast] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [phraseBarEnabled, setPhraseBarEnabled] = useState(true);
  const [suggestionCount, setSuggestionCount] = useState('3');
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
    setLockEnabled(settings.lockEnabled);
    setBackupPinEnabled(settings.backupPinEnabled);
    setSelectedVoiceValue(settings.preferredVoice ?? DEFAULT_VOICE_VALUE);
  }, [settings]);

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

  const previewVoice = async (
    nextRate: number,
    nextPitch: number,
    nextVoiceValue: string = selectedVoiceValue
  ) => {
    try {
      await speechEngine.previewTts(VOICE_PREVIEW_TEXT, {
        ttsRate: nextRate,
        ttsPitch: nextPitch,
        preferredVoice: nextVoiceValue === DEFAULT_VOICE_VALUE ? undefined : nextVoiceValue,
      });
    } catch {
      setMessage(
        isWebPlatform
          ? 'Ukázka hlasu se nepřehrála.'
          : 'Ukázka hlasu se nepřehrála. Na iPadu/iPhonu zkontroluj tichý režim.'
      );
    }
  };

  const signOut = async () => {
    setMessage(null);

    try {
      await authService.signOut();
      void appHaptics.success();
      setMessage('Odhlášeno');
    } catch (error) {
      void appHaptics.error();
      setMessage(getErrorMessage(error, 'Odhlášení selhalo'));
    }
  };

  const performBoardReset = async () => {
    setIsResettingBoard(true);
    setMessage(null);

    try {
      await resetBoardToDefaults();
      void appHaptics.success();
      setMessage('Tabule vrácena na výchozí stav');
    } catch (error) {
      void appHaptics.error();
      setMessage(getErrorMessage(error, 'Obnovení tabule selhalo'));
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
      setMessage(getErrorMessage(error, 'Cloud sync selhal'));
    } finally {
      setIsSyncActionRunning(false);
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
    : isWebPlatform
      ? 'V prohlížeči se používá vždy pro odemknutí úprav.'
      : backupPinEnabled
        ? '4 číslice pro vstup do nastavení.'
        : 'Po uložení se tato volba automaticky zapne.';

  const webStorageDetail =
    webPersistenceSummary === null
      ? 'Kontroluji, jestli data přežijí obnovení stránky.'
      : webPersistenceSummary.status === 'passed'
        ? 'Ověřeno po obnovení stránky. Data zůstávají v tomto prohlížeči.'
        : 'První kontrola hotová. Obnov stránku ještě jednou a ÁňaBoard potvrdí trvalé uložení.';

  const availableVoiceOptions = voiceOptions.filter((option) => option.value !== DEFAULT_VOICE_VALUE);
  const availableVoiceCount = availableVoiceOptions.length;
  const shouldShowVoicePicker = availableVoiceCount > 1;
  const voiceRowTitle = 'Vybraný hlas';
  const voiceSetupInstruction =
    Platform.OS === 'ios'
      ? 'Další hlasy přidáš v Nastavení > Zpřístupnění > Mluvený obsah > Hlasy.'
      : Platform.OS === 'android'
        ? 'Další hlasy přidáš v Nastavení > Zpřístupnění > Výstup převodu textu na řeč. U zvoleného enginu otevři jeho nastavení a nainstaluj hlasová data.'
        : 'Další hlasy přidej v nastavení tohoto zařízení.';
  const voiceAvailabilityTitle = isVoiceOptionsLoading
    ? 'Načítám hlasy…'
    : availableVoiceCount === 0
      ? 'Český hlas'
      : 'Dostupný hlas';
  const voiceAvailabilityDetail = isVoiceOptionsLoading
    ? 'Zjišťuji dostupné české hlasy v tomto zařízení.'
    : availableVoiceCount === 0
      ? `Na tomto zařízení není dostupný samostatný český hlas. Použije se výchozí hlas zařízení. ${voiceSetupInstruction}`
      : `Na tomto zařízení je dostupný jen jeden český hlas: ${availableVoiceOptions[0].label}. ${voiceSetupInstruction}`;

  const handleVoiceChange = (nextVoiceValue: string) => {
    void updateSetting(
      selectedVoiceValue,
      nextVoiceValue,
      setSelectedVoiceValue,
      {
        preferredVoice: nextVoiceValue === DEFAULT_VOICE_VALUE ? null : nextVoiceValue,
      },
      'Hlas nešel uložit',
      () => previewVoice(ttsRate, ttsPitch, nextVoiceValue)
    );
  };

  const lastSuccessfulSyncLabel = formatTimestamp(lastSuccessfulSyncAt);
  const lastPullLabel = formatTimestamp(lastSyncPullAt);
  const syncIssueDetail = formatSyncIssue(syncLastIssue);
  const syncUnavailable = !hasSupabaseConfig || authStatus === 'disabled';
  const syncSignedOut = !syncUnavailable && authStatus === 'signed_out';
  const syncAnonymous = !syncUnavailable && authStatus === 'signed_in' && authIsAnonymous;
  const syncStatusTitle = syncUnavailable
    ? 'Cloud sync není nastavený'
    : syncSignedOut
      ? 'Cloud sync je připravený'
      : syncAnonymous
      ? 'Zkušební režim bez účtu'
      : syncStatus === 'offline'
      ? 'Zařízení je offline'
      : syncStatus === 'syncing'
        ? 'Probíhá sync'
        : syncStatus === 'error'
          ? 'Sync potřebuje zásah'
          : pendingSyncEvents > 0
            ? 'Čekají změny'
            : 'Cloud sync běží';
  const syncStatusDetailParts = syncUnavailable
    ? [
        'V této verzi aplikace chybí Supabase konfigurace.',
        pendingSyncEvents > 0
          ? `Místní změny čekají: ${pendingSyncEvents}`
          : 'Místní změny čekají: 0',
        syncErrorEvents > 0 ? `Dřívější chyby syncu: ${syncErrorEvents}` : null,
        'Přihlášení ani cloud sync tu teď nepoběží.',
      ]
    : syncSignedOut
      ? [
          'Aplikace běží dál lokálně i bez přihlášení.',
          pendingSyncEvents > 0
            ? `Místní změny čekají: ${pendingSyncEvents}`
            : 'Místní změny čekají: 0',
          'Přihlas se, až budeš chtít zapnout cloud sync mezi zařízeními.',
        ]
    : syncAnonymous
      ? [
          'Teď běžíš bez účtu v rychlém zkušebním režimu.',
          'AI můžeš vyzkoušet hned, ale cloud sync a trvalé propojení zařízení zatím neběží.',
          'Přihlas se, až budeš chtít trial převést na běžný účet.',
        ]
    : [
        remoteContext?.caregiverEmail ? `Účet: ${remoteContext.caregiverEmail}` : null,
        syncIssueDetail,
        pendingSyncEvents > 0 ? `Ve frontě: ${pendingSyncEvents}` : 'Ve frontě: 0',
        syncErrorEvents > 0 ? `Chyby: ${syncErrorEvents}` : 'Chyby: 0',
        lastSuccessfulSyncLabel ? `Poslední hotovo: ${lastSuccessfulSyncLabel}` : null,
        lastPullLabel ? `Naposledy staženo: ${lastPullLabel}` : null,
      ];
  const syncStatusDetail = syncStatusDetailParts.filter(Boolean).join('\n');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title="Nastavení" onBack={onBack} />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Cloud sync</Text>
          <View style={styles.cardStack}>
            <View style={styles.statusBlock}>
              <Text style={styles.statusTitle}>{syncStatusTitle}</Text>
              <Text style={styles.statusDetail}>{syncStatusDetail}</Text>
            </View>
            {syncSignedOut || syncAnonymous ? (
              <>
                <View style={styles.divider} />
                <SettingRowButton
                  title={syncAnonymous ? 'Zaregistrovat / přihlásit' : 'Přihlásit ke cloud syncu'}
                  detail="Otevře přihlášení a pak propojí tuto tabuli s cloudem."
                  onPress={onOpenAuth}
                />
              </>
            ) : null}
            {hasSupabaseConfig && authStatus === 'signed_in' && !authIsAnonymous ? (
              <>
                <View style={styles.divider} />
                <SettingRowButton
                  title={isSyncActionRunning ? 'Synchronizuji…' : 'Synchronizovat teď'}
                  detail="Odešle čekající změny a stáhne novější data z cloudu."
                  disabled={isSyncActionRunning}
                  onPress={() => {
                    void runSyncAction(() => syncService.runOnce(), 'Sync zkontrolován');
                  }}
                />
                {syncErrorEvents > 0 ? (
                  <>
                    <View style={styles.divider} />
                    <SettingRowButton
                      title="Zkusit znovu chybné položky"
                      detail="Vrátí chybné změny do fronty a hned je zkusí znovu."
                      disabled={isSyncActionRunning}
                      onPress={() => {
                        void runSyncAction(
                          () => syncService.retryFailed(),
                          'Chybné položky vráceny do syncu'
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
            <View style={styles.divider} />
            {shouldShowVoicePicker ? (
              <SettingChoiceStepper
                title={voiceRowTitle}
                value={selectedVoiceValue}
                options={voiceOptions}
                disabled={isVoiceOptionsLoading}
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
                  <Text style={styles.statusTitle}>iPad / iPhone</Text>
                  <Text style={styles.statusDetail}>
                    Když je zařízení v tichém režimu, robotický hlas se nemusí ozvat.
                  </Text>
                </View>
              </>
            ) : null}
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
              title="Rychlé věty a tipy"
              detail="Na tabuli ukáže uložené věty, poslední věty a návrhy."
              value={phraseBarEnabled}
              onValueChange={(nextValue) => {
                void updateSetting(
                  phraseBarEnabled,
                  nextValue,
                  setPhraseBarEnabled,
                  { phraseBarEnabled: nextValue },
                  'Rychlé věty a tipy nešly uložit'
                );
              }}
            />
            {phraseBarEnabled ? (
              <>
                <View style={styles.divider} />
                <SettingChoiceStepper
                  title="Počet tipů"
                  value={suggestionCount}
                  options={[...SUGGESTION_COUNT_OPTIONS]}
                  onChange={(nextValue) => {
                    void updateSetting(
                      suggestionCount,
                      nextValue,
                      setSuggestionCount,
                      { suggestionCount: Number(nextValue) },
                      'Počet tipů nešel uložit'
                    );
                  }}
                />
              </>
            ) : null}
            <View style={styles.divider} />
            <SettingToggleRow
              title="Chránit nastavení"
              detail={
                isWebPlatform
                  ? 'Před úpravami se zadá PIN v aplikaci.'
                  : 'Před úpravami se ověří pečovatel.'
              }
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
            <SettingRowButton
              title={
                isWebPlatform
                  ? 'PIN v aplikaci'
                  : backupPinEnabled
                    ? 'Změnit PIN v aplikaci'
                    : 'Nastavit PIN v aplikaci'
              }
              detail={pinDetail}
              onPress={onOpenPinSettings}
            />
            {!isWebPlatform ? (
              <>
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
              </>
            ) : (
              <>
                <View style={styles.divider} />
                <View style={styles.statusBlock}>
                  <Text style={styles.statusTitle}>Úložiště prohlížeče</Text>
                  <Text style={styles.statusDetail}>{webStorageDetail}</Text>
                </View>
              </>
            )}
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
        {authStatus === 'signed_in' && !authIsAnonymous ? (
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
