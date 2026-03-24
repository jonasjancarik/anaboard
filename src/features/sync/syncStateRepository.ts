import { nowIso } from '../../shared/utils/time';
import { getDatabase } from '../../shared/storage/db';
import type { SyncOverview } from './types';

const APP_META_KEYS = {
  boundProfileId: 'sync_bound_profile_id',
  lastSuccessfulSyncAt: 'sync_last_success_at',
  lastPullAt: 'sync_last_pull_at',
} as const;

type AppMetaRow = {
  value: string;
};

type SyncCountRow = {
  pending_count: number;
  error_count: number;
};

const getMetaValue = async (key: string): Promise<string | null> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<AppMetaRow>(
    'SELECT value FROM app_meta WHERE key = ? LIMIT 1',
    key
  );
  return row?.value ?? null;
};

const setMetaValue = async (key: string, value: string | null): Promise<void> => {
  const db = await getDatabase();
  if (value === null) {
    await db.runAsync('DELETE FROM app_meta WHERE key = ?', key);
    return;
  }

  await db.runAsync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    key,
    value
  );
};

export const getSyncOverview = async (): Promise<SyncOverview> => {
  const db = await getDatabase();
  const counts = await db.getFirstAsync<SyncCountRow>(
    `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
      FROM sync_events
    `
  );

  const [lastSuccessfulSyncAt, lastPullAt, boundProfileId] = await Promise.all([
    getMetaValue(APP_META_KEYS.lastSuccessfulSyncAt),
    getMetaValue(APP_META_KEYS.lastPullAt),
    getMetaValue(APP_META_KEYS.boundProfileId),
  ]);

  return {
    pendingCount: counts?.pending_count ?? 0,
    errorCount: counts?.error_count ?? 0,
    lastSuccessfulSyncAt,
    lastPullAt,
    boundProfileId,
  };
};

export const getBoundSyncProfileId = async (): Promise<string | null> => {
  return getMetaValue(APP_META_KEYS.boundProfileId);
};

export const setBoundSyncProfileId = async (profileId: string | null): Promise<void> => {
  await setMetaValue(APP_META_KEYS.boundProfileId, profileId);
};

export const recordSuccessfulSync = async (timestamp = nowIso()): Promise<void> => {
  await setMetaValue(APP_META_KEYS.lastSuccessfulSyncAt, timestamp);
};

export const recordSuccessfulPull = async (timestamp = nowIso()): Promise<void> => {
  await setMetaValue(APP_META_KEYS.lastPullAt, timestamp);
};
