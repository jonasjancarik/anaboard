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
import { getAppCopy } from '../../../shared/i18n/appCopy';
import {
  getTelemetryUploadEnabled,
  isTelemetryUploadAvailable,
  logError,
  setTelemetryUploadEnabled,
} from '../../../shared/telemetry/logger';

type DiagnosticsSettingsSectionProps = {
  diagnosticsInput: CollectDiagnosticsInput;
  onMessage: (message: string | null) => void;
  locale?: unknown;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  return error instanceof Error ? error.message : fallback;
};

const diagnosticsResultMessage = (result: DiagnosticsShareResult, locale: unknown): string => {
  const copy = getAppCopy(locale).diagnostics;
  if (result === 'download') {
    return copy.downloaded;
  }

  if (result === 'mail') {
    return copy.mailReady;
  }

  return copy.shareReady;
};

export const DiagnosticsSettingsSection = ({
  diagnosticsInput,
  onMessage,
  locale,
}: DiagnosticsSettingsSectionProps) => {
  const copy = getAppCopy(locale).diagnostics;
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
      onMessage(copy.unavailable);
      return;
    }

    onMessage(null);
    const previousValue = telemetryUploadEnabledState;
    setTelemetryUploadEnabledState(nextValue);

    try {
      const persistedValue = await setTelemetryUploadEnabled(nextValue);
      setTelemetryUploadEnabledState(persistedValue);
      onMessage(persistedValue ? copy.uploadEnabled : copy.uploadDisabled);
    } catch (error) {
      void appHaptics.error();
      setTelemetryUploadEnabledState(previousValue);
      onMessage(getErrorMessage(error, copy.saveError));
    }
  };

  const sendDiagnostics = async () => {
    setIsDiagnosticsSharing(true);
    onMessage(null);

    try {
      const payload = await collectDiagnosticsPayload(diagnosticsInput);
      const result = await shareDiagnosticsPayload(payload);
      void appHaptics.success();
      onMessage(diagnosticsResultMessage(result, locale));
    } catch (error) {
      logError('diagnostics_share_failed', error, {
        platform: Platform.OS,
      });
      void appHaptics.error();
      onMessage(getErrorMessage(error, copy.shareError));
    } finally {
      setIsDiagnosticsSharing(false);
    }
  };

  const telemetryUploadDetail = telemetryUploadAvailable
    ? copy.uploadDetail
    : copy.unavailable;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{copy.sectionTitle}</Text>
      <View style={styles.cardStack}>
        <SettingToggleRow
          title={copy.uploadErrors}
          detail={telemetryUploadDetail}
          value={telemetryUploadEnabledState && telemetryUploadAvailable}
          disabled={!telemetryUploadAvailable || isTelemetryPreferenceLoading}
          onValueChange={(nextValue) => {
            void updateTelemetryUpload(nextValue);
          }}
        />
        <View style={styles.divider} />
        <SettingRowButton
          title={isDiagnosticsSharing ? copy.sendingTitle : copy.sendTitle}
          detail={copy.sendDetail}
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
