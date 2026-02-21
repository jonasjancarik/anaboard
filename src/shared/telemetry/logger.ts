import * as Application from 'expo-application';
import { Platform } from 'react-native';
import * as Sentry from 'sentry-expo';

type EventPayload = Record<string, string | number | boolean | null | undefined>;

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
let sentryInitialized = false;

const appVersion = Application.nativeApplicationVersion ?? 'dev';

export const initTelemetry = (): void => {
  if (!sentryDsn || sentryInitialized) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    enableInExpoDevelopment: false,
    debug: false,
  });

  sentryInitialized = true;
};

const withCommonContext = (payload: EventPayload): EventPayload => ({
  platform: Platform.OS,
  app_version: appVersion,
  ...payload,
});

export const logEvent = (eventName: string, payload: EventPayload = {}): void => {
  const context = withCommonContext(payload);

  console.log('[telemetry:event]', eventName, context);

  if (!sentryInitialized) {
    return;
  }

  Sentry.Native.addBreadcrumb({
    category: 'event',
    message: eventName,
    data: context,
  });
};

export const logError = (eventName: string, error: unknown, payload: EventPayload = {}): void => {
  const context = withCommonContext(payload);

  console.error('[telemetry:error]', eventName, context, error);

  if (!sentryInitialized) {
    return;
  }

  Sentry.Native.withScope((scope) => {
    scope.setTag('event_name', eventName);
    Object.entries(context).forEach(([key, value]) => {
      if (value !== undefined) {
        scope.setExtra(key, value);
      }
    });
    Sentry.Native.captureException(error);
  });
};
