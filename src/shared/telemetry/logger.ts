import * as Application from 'expo-application';
import { Platform } from 'react-native';

type EventPayload = Record<string, string | number | boolean | null | undefined>;

const appVersion = Application.nativeApplicationVersion ?? 'dev';

export const initTelemetry = (): void => {
  // Console-only telemetry for now. Native Sentry wiring was removed to unblock Expo SDK 54 builds.
};

const withCommonContext = (payload: EventPayload): EventPayload => ({
  platform: Platform.OS,
  app_version: appVersion,
  ...payload,
});

export const logEvent = (eventName: string, payload: EventPayload = {}): void => {
  const context = withCommonContext(payload);

  console.log('[telemetry:event]', eventName, context);
};

export const logError = (eventName: string, error: unknown, payload: EventPayload = {}): void => {
  const context = withCommonContext(payload);

  console.error('[telemetry:error]', eventName, context, error);
};
