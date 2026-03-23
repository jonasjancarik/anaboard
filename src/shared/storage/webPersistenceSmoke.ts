import { getDatabase } from './db';
import { nowIso } from '../utils/time';
import { isWebPlatform } from '../platform/runtime';

export type WebPersistenceSmokeStatus = 'pending_reload' | 'passed' | 'unsupported';

export type WebPersistenceSmokeSummary = {
  status: WebPersistenceSmokeStatus;
  checkedAt?: string;
  passedAt?: string;
  bootCount: number;
};

type SmokeRecord = {
  bootCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  passedAt?: string;
};

const SMOKE_KEY = 'web_persistence_smoke_v1';

const parseSmokeRecord = (rawValue?: string): SmokeRecord | null => {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SmokeRecord>;
    if (
      typeof parsed.bootCount !== 'number' ||
      typeof parsed.firstSeenAt !== 'string' ||
      typeof parsed.lastSeenAt !== 'string'
    ) {
      return null;
    }

    return {
      bootCount: parsed.bootCount,
      firstSeenAt: parsed.firstSeenAt,
      lastSeenAt: parsed.lastSeenAt,
      passedAt: typeof parsed.passedAt === 'string' ? parsed.passedAt : undefined,
    };
  } catch {
    return null;
  }
};

const getStoredSmokeRecord = async (): Promise<SmokeRecord | null> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ? LIMIT 1',
    SMOKE_KEY
  );

  return parseSmokeRecord(row?.value);
};

const toSummary = (record: SmokeRecord | null): WebPersistenceSmokeSummary => {
  if (!record) {
    return {
      status: 'pending_reload',
      bootCount: 0,
    };
  }

  return {
    status: record.passedAt ? 'passed' : 'pending_reload',
    checkedAt: record.lastSeenAt,
    passedAt: record.passedAt,
    bootCount: record.bootCount,
  };
};

export const getWebPersistenceSmokeSummary = async (): Promise<WebPersistenceSmokeSummary> => {
  if (!isWebPlatform) {
    return {
      status: 'unsupported',
      bootCount: 0,
    };
  }

  const record = await getStoredSmokeRecord();
  return toSummary(record);
};

export const runWebPersistenceSmokeTest = async (): Promise<WebPersistenceSmokeSummary> => {
  if (!isWebPlatform) {
    return {
      status: 'unsupported',
      bootCount: 0,
    };
  }

  const db = await getDatabase();
  const previousRecord = await getStoredSmokeRecord();
  const checkedAt = nowIso();
  const nextRecord: SmokeRecord = {
    bootCount: (previousRecord?.bootCount ?? 0) + 1,
    firstSeenAt: previousRecord?.firstSeenAt ?? checkedAt,
    lastSeenAt: checkedAt,
    passedAt: previousRecord ? previousRecord.passedAt ?? checkedAt : undefined,
  };

  await db.runAsync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    SMOKE_KEY,
    JSON.stringify(nextRecord)
  );

  return toSummary(nextRecord);
};
