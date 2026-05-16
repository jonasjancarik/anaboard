import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { SettingRowButton } from './SettingRowButton';
import { SettingToggleRow } from './SettingToggleRow';
import {
  collectDiagnosticsPayload,
  type CollectDiagnosticsInput,
} from '../../../shared/diagnostics/collectDiagnostics';
import {
  shareDiagnosticsPayload,
  type DiagnosticsShareResult,
} from '../../../shared/diagnostics/shareDiagnostics';
import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';
import {
  getTelemetryUploadEnabled,
  isTelemetryUploadAvailable,
  logError,
  setTelemetryUploadEnabled,
} from '../../../shared/telemetry/logger';

type DiagnosticsSettingsSectionProps = {
  diagnosticsInput: CollectDiagnosticsInput;
  onMessage: (message: string | null) => void;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

const diagnosticsResultMessage = (result: DiagnosticsShareResult): string => {
  if (result === 'download') {
    return 'Diagnostika stažena jako JSON';
  }

  if (result === 'mail') {
    return 'E-mail s diagnostikou je připravený';
  }

  return 'Diagnostika je připravená k odeslání';
};

export const DiagnosticsSettingsSection = ({
  diagnosticsInput,
  onMessage,
}: DiagnosticsSettingsSectionProps) => {
  const [telemetryUploadEnabledState, setTelemetryUploadEnabledState] = useState(false);
  const [isTelemetryPreferenceLoading, setIsTelemetryPreferenceLoading] = useState(true);
  const [isDiagnosticsSharing, setIsDiagnosticsSharing] = useState(false);
  const telemetryUploadAvailable = isTelemetryUploadAvailable();

  useEffect(() => {
    let isCancelled = false;

    const loadTelemetryPreference = async () => {
      try {
        const enabled = await getTelemetryUploadEnabled();
        if (!isCancelled) {
          setTelemetryUploadEnabledState(enabled);
        }
      } finally {
        if (!isCancelled) {
          setIsTelemetryPreferenceLoading(false);
        }
      }
    };

    void loadTelemetryPreference();

    return () => {
      isCancelled = true;
    };
  }, []);

  const updateTelemetryUpload = async (nextValue: boolean) => {
    if (!telemetryUploadAvailable) {
      setTelemetryUploadEnabledState(false);
      onMessage('V této verzi není nastavené vzdálené hlášení chyb.');
      return;
    }

    onMessage(null);
    const previousValue = telemetryUploadEnabledState;
    setTelemetryUploadEnabledState(nextValue);

    try {
      const persistedValue = await setTelemetryUploadEnabled(nextValue);
      setTelemetryUploadEnabledState(persistedValue);
      onMessage(persistedValue ? 'Odesílání chyb zapnuto' : 'Odesílání chyb vypnuto');
    } catch (error) {
      void appHaptics.error();
      setTelemetryUploadEnabledState(previousValue);
      onMessage(getErrorMessage(error, 'Volba diagnostiky nešla uložit'));
    }
  };

  const sendDiagnostics = async () => {
    setIsDiagnosticsSharing(true);
    onMessage(null);

    try {
      const payload = await collectDiagnosticsPayload(diagnosticsInput);
      const result = await shareDiagnosticsPayload(payload);
      void appHaptics.success();
      onMessage(diagnosticsResultMessage(result));
    } catch (error) {
      logError('diagnostics_share_failed', error, {
        platform: Platform.OS,
      });
      void appHaptics.error();
      onMessage(getErrorMessage(error, 'Diagnostiku se nepodařilo připravit'));
    } finally {
      setIsDiagnosticsSharing(false);
    }
  };

  const telemetryUploadDetail = telemetryUploadAvailable
    ? 'Odešle jen chyby aplikace bez obsahu tabule.'
    : 'V této verzi není nastavené vzdálené hlášení chyb.';

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Diagnostika</Text>
      <View style={styles.cardStack}>
        <SettingToggleRow
          title="Odesílat chyby"
          detail={telemetryUploadDetail}
          value={telemetryUploadEnabledState && telemetryUploadAvailable}
          disabled={!telemetryUploadAvailable || isTelemetryPreferenceLoading}
          onValueChange={(nextValue) => {
            void updateTelemetryUpload(nextValue);
          }}
        />
        <View style={styles.divider} />
        <SettingRowButton
          title={isDiagnosticsSharing ? 'Připravuji diagnostiku…' : 'Poslat diagnostiku e-mailem'}
          detail="Připraví bezpečný JSON bez textů, účtů a cest k médiím."
          disabled={isDiagnosticsSharing}
          onPress={() => {
            void sendDiagnostics();
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
});
