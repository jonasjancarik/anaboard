import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import type { Breadcrumb, ErrorEvent, Exception } from '@sentry/react-native';
import { Platform } from 'react-native';

import {
  appendCappedTelemetryRecord,
  sanitizeError,
  sanitizeStringValue,
  sanitizeTelemetryEventName,
  sanitizeTelemetryPayload,
  type SanitizedPayload,
  type TelemetryPayload,
  type TelemetryRecord,
} from './privacy';

const appVersion = Application.nativeApplicationVersion ?? 'dev';
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';
const TELEMETRY_UPLOAD_KEY = 'anaboard.telemetry.uploadEnabled.v1';
const TELEMETRY_RECORDS_KEY = 'anaboard.telemetry.records.v1';

let telemetryUploadEnabled = false;
let didLoadTelemetryPreference = false;
let initPromise: Promise<void> | null = null;
let sentryInitialized = false;
let recordWriteQueue = Promise.resolve();
let memoryRecords: TelemetryRecord[] = [];

const hasSentryDsn = (): boolean => sentryDsn.length > 0;

export const isTelemetryUploadAvailable = (): boolean => hasSentryDsn();

const shouldSendToSentry = (): boolean => sentryInitialized && telemetryUploadEnabled && hasSentryDsn();

const loadRecords = async (): Promise<TelemetryRecord[]> => {
  try {
    const rawValue = await AsyncStorage.getItem(TELEMETRY_RECORDS_KEY);
    if (!rawValue) {
      return memoryRecords;
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return memoryRecords;
    }

    memoryRecords = parsed.filter(isTelemetryRecord);
    return memoryRecords;
  } catch {
    return memoryRecords;
  }
};

const saveRecords = async (records: TelemetryRecord[]): Promise<void> => {
  memoryRecords = records;

  try {
    await AsyncStorage.setItem(TELEMETRY_RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Keep the in-memory copy so diagnostics still work during the current run.
  }
};

const isTelemetryRecord = (value: unknown): value is TelemetryRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Partial<TelemetryRecord>;
  return (
    (record.kind === 'event' || record.kind === 'error') &&
    typeof record.name === 'string' &&
    typeof record.timestamp === 'string' &&
    !!record.payload &&
    typeof record.payload === 'object'
  );
};

const appendRecord = (record: TelemetryRecord): void => {
  recordWriteQueue = recordWriteQueue
    .then(async () => {
      const records = await loadRecords();
      await saveRecords(appendCappedTelemetryRecord(records, record));
    })
    .catch(() => {
      memoryRecords = appendCappedTelemetryRecord(memoryRecords, record);
    });
};

export const getTelemetryRecords = async (): Promise<TelemetryRecord[]> => {
  try {
    await recordWriteQueue;
  } catch {
    // Best effort: fall back to whatever has been held in memory.
  }

  return await loadRecords();
};

const withCommonContext = (payload: TelemetryPayload): SanitizedPayload =>
  sanitizeTelemetryPayload({
    platform: Platform.OS,
    app_version: appVersion,
    ...payload,
  });

const createRecord = (
  kind: TelemetryRecord['kind'],
  eventName: string,
  payload: TelemetryPayload,
  error?: unknown
): TelemetryRecord => {
  const name = sanitizeTelemetryEventName(eventName);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    kind,
    name,
    timestamp: new Date().toISOString(),
    payload: withCommonContext(payload),
    error: kind === 'error' ? sanitizeError(error) : undefined,
  };
};

const sanitizeBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => ({
  ...breadcrumb,
  message: breadcrumb.message ? sanitizeStringValue(breadcrumb.message) : breadcrumb.message,
  data: breadcrumb.data ? sanitizeTelemetryPayload(breadcrumb.data) : breadcrumb.data,
});

const sanitizeException = (exception: Exception): Exception => ({
  ...exception,
  type: exception.type ? sanitizeStringValue(exception.type) : exception.type,
  value: exception.value ? sanitizeStringValue(exception.value) : exception.value,
});

const sanitizeSentryEvent = (event: ErrorEvent): ErrorEvent | null => {
  if (!shouldSendToSentry()) {
    return null;
  }

  const nextEvent: ErrorEvent = {
    ...event,
    user: undefined,
    request: undefined,
    extra: event.extra ? sanitizeTelemetryPayload(event.extra) : undefined,
    breadcrumbs: event.breadcrumbs?.slice(-20).map(sanitizeBreadcrumb),
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map(sanitizeException),
        }
      : event.exception,
  };

  if (event.contexts) {
    nextEvent.contexts = {
      app: event.contexts.app,
      device: event.contexts.device,
      os: event.contexts.os,
      runtime: event.contexts.runtime,
      trace: event.contexts.trace,
      app_telemetry: event.contexts.app_telemetry
        ? sanitizeTelemetryPayload(event.contexts.app_telemetry)
        : undefined,
    };
  }

  return nextEvent;
};

const initializeSentry = (): void => {
  if (sentryInitialized || !telemetryUploadEnabled || !hasSentryDsn()) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: false,
    enableAutoSessionTracking: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    enableUserInteractionTracing: false,
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    beforeSend: sanitizeSentryEvent,
  });

  Sentry.setTag('platform', Platform.OS);
  Sentry.setTag('app_version', appVersion);
  sentryInitialized = true;
};

export const initTelemetry = async (): Promise<void> => {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    telemetryUploadEnabled = await getTelemetryUploadEnabled();
    didLoadTelemetryPreference = true;
    initializeSentry();
  })();

  return initPromise;
};

export const getTelemetryUploadEnabled = async (): Promise<boolean> => {
  if (!hasSentryDsn()) {
    return false;
  }

  try {
    const rawValue = await AsyncStorage.getItem(TELEMETRY_UPLOAD_KEY);
    return rawValue === '1';
  } catch {
    return false;
  }
};

export const setTelemetryUploadEnabled = async (enabled: boolean): Promise<boolean> => {
  const nextEnabled = enabled && hasSentryDsn();
  telemetryUploadEnabled = nextEnabled;
  didLoadTelemetryPreference = true;

  try {
    await AsyncStorage.setItem(TELEMETRY_UPLOAD_KEY, nextEnabled ? '1' : '0');
  } catch {
    // Keep runtime state even if local persistence fails.
  }

  if (nextEnabled) {
    initializeSentry();
  } else if (sentryInitialized) {
    await Sentry.close();
    sentryInitialized = false;
  }

  return nextEnabled;
};

const addSentryBreadcrumb = (record: TelemetryRecord, level: Breadcrumb['level']): void => {
  if (!shouldSendToSentry()) {
    return;
  }

  Sentry.addBreadcrumb({
    category: 'app.telemetry',
    level,
    message: record.name,
    data: record.payload,
    timestamp: Date.parse(record.timestamp) / 1000,
  });
};

const toSentryError = (eventName: string, error: unknown): Error => {
  const sanitizedError = sanitizeError(error);
  const sentryError = new Error(sanitizedError.message || eventName);
  sentryError.name = sanitizedError.name || 'Error';
  return sentryError;
};

export const logEvent = (eventName: string, payload: TelemetryPayload = {}): void => {
  const record = createRecord('event', eventName, payload);

  appendRecord(record);
  addSentryBreadcrumb(record, 'info');
  console.log('[telemetry:event]', record.name, record.payload);
};

export const logError = (eventName: string, error: unknown, payload: TelemetryPayload = {}): void => {
  const record = createRecord('error', eventName, payload, error);

  appendRecord(record);
  addSentryBreadcrumb(record, 'error');
  console.error('[telemetry:error]', record.name, record.payload, record.error);

  if (!shouldSendToSentry()) {
    if (!didLoadTelemetryPreference) {
      void initTelemetry();
    }
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('app_event', record.name);
    scope.setContext('app_telemetry', record.payload);
    Sentry.captureException(toSentryError(record.name, error));
  });
};
