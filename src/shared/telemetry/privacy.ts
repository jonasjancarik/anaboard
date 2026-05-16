export type TelemetryPayload = Record<string, unknown>;

export type SanitizedPayloadValue =
  | string
  | number
  | boolean
  | null
  | SanitizedPayloadValue[];

export type SanitizedPayload = Record<string, SanitizedPayloadValue>;

export type SanitizedError = {
  name: string;
  message: string;
};

export type TelemetryRecord = {
  id: string;
  kind: 'event' | 'error';
  name: string;
  timestamp: string;
  payload: SanitizedPayload;
  error?: SanitizedError;
};

export const TELEMETRY_RING_BUFFER_LIMIT = 100;

const SENSITIVE_KEY_PARTS = [
  'email',
  'user',
  'caregiver',
  'label',
  'text',
  'phrase',
  'token',
  'uri',
  'url',
  'path',
  'local',
  'remote',
  'image',
  'audio',
] as const;

const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_LENGTH = 20;

const normalizeKey = (key: string): string => {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
};

export const isSensitiveTelemetryKey = (key: string): boolean => {
  const normalized = normalizeKey(key);

  if (SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))) {
    return true;
  }

  return (
    normalized === 'id' ||
    normalized.endsWith('_id') ||
    normalized.endsWith('_ids') ||
    normalized.includes('_id_')
  );
};

export const sanitizeStringValue = (value: string): string => {
  const redacted = value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\bfile:\/\/[^\s"'<>]+/gi, '[redacted-path]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/(^|\s)\/(?:Users|private|var|tmp|data|storage)\/[^\s"'<>]+/g, '$1[redacted-path]');

  if (redacted.length <= MAX_STRING_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_STRING_LENGTH - 3)}...`;
};

const sanitizeValue = (value: unknown): SanitizedPayloadValue | undefined => {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return sanitizeStringValue(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map(sanitizeValue)
      .filter((item): item is SanitizedPayloadValue => item !== undefined);

    return sanitizedItems;
  }

  return undefined;
};

export const sanitizeTelemetryPayload = (payload: TelemetryPayload = {}): SanitizedPayload => {
  return Object.entries(payload).reduce<SanitizedPayload>((result, [key, value]) => {
    if (isSensitiveTelemetryKey(key)) {
      return result;
    }

    const sanitizedValue = sanitizeValue(value);
    if (sanitizedValue !== undefined) {
      result[key] = sanitizedValue;
    }

    return result;
  }, {});
};

export const sanitizeTelemetryEventName = (eventName: string): string => {
  const sanitized = eventName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .slice(0, 80);

  return sanitized || 'unknown_event';
};

export const sanitizeError = (error: unknown): SanitizedError => {
  if (error instanceof Error) {
    return {
      name: sanitizeStringValue(error.name || 'Error'),
      message: sanitizeStringValue(error.message || 'Unknown error'),
    };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: sanitizeStringValue(error),
    };
  }

  return {
    name: 'Error',
    message: 'Unknown error',
  };
};

export const appendCappedTelemetryRecord = (
  records: TelemetryRecord[],
  nextRecord: TelemetryRecord,
  limit: number = TELEMETRY_RING_BUFFER_LIMIT
): TelemetryRecord[] => {
  const nextRecords = [...records, nextRecord];

  if (nextRecords.length <= limit) {
    return nextRecords;
  }

  return nextRecords.slice(nextRecords.length - limit);
};
