import type { MigrationDatabase } from '../../shared/storage/migrations';

type SyncEventDatabase = Pick<MigrationDatabase, 'getFirstAsync' | 'runAsync'>;

// Supabase caps each response at 1000 rows by default, so larger tables are read page by page.
export const REMOTE_PAGE_SIZE = 1000;

export const fetchAllPages = async <T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  pageSize = REMOTE_PAGE_SIZE
): Promise<T[]> => {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw error;
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) {
      return rows;
    }
  }
};

/** Local rows store `...Z` timestamps while Postgres returns `...+00:00`, so compare instants. */
export const isSameSyncTimestamp = (left?: string | null, right?: string | null): boolean => {
  if (!left || !right) {
    return false;
  }

  const leftTime = Date.parse(left);
  return !Number.isNaN(leftTime) && leftTime === Date.parse(right);
};

export const getAutoRetryDelayMs = (
  failedAttempts: number,
  baseDelayMs: number,
  maxDelayMs: number
): number => {
  if (failedAttempts <= 0) {
    return 0;
  }

  return Math.min(baseDelayMs * 2 ** (failedAttempts - 1), maxDelayMs);
};

/** Counts queued local changes newer than `afterEventId` (all of them when it is null). */
export const countUnsyncedEventsAfter = async (
  db: SyncEventDatabase,
  afterEventId: number | null
): Promise<number> => {
  const row = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_events WHERE status IN ('pending', 'error') AND id > ?",
    afterEventId ?? 0
  );
  return row?.count ?? 0;
};

export const discardUnsyncedEventsThrough = async (
  db: SyncEventDatabase,
  eventId: number
): Promise<void> => {
  await db.runAsync(
    "DELETE FROM sync_events WHERE status IN ('pending', 'error') AND id <= ?",
    eventId
  );
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }

  // `undefined` and `null` are treated the same so an omitted column does not look like a change.
  return value === undefined ? 'null' : JSON.stringify(value);
};

/**
 * Text that is hashed into the remote snapshot fingerprint. Key order does not matter, and the
 * profile id is included so the same rows under another profile never count as already applied.
 */
export const buildSnapshotFingerprintSource = (profileId: string, snapshot: unknown): string => {
  return `v1:${profileId}:${stableStringify(snapshot)}`;
};

/**
 * A background pull may skip applying the cloud snapshot only when it is exactly the one applied
 * last time and this run uploaded nothing. An upload can be skipped by the conflict policy, which
 * leaves a newer cloud row that still has to be applied locally, so any upload means apply.
 */
export const canSkipRemoteApply = (params: {
  fingerprint: string;
  lastAppliedFingerprint: string | null;
  uploadedEventCount: number;
}): boolean => {
  return (
    params.uploadedEventCount === 0 &&
    params.lastAppliedFingerprint !== null &&
    params.lastAppliedFingerprint === params.fingerprint
  );
};

export const SYNCED_EVENT_RETENTION_MS = 7 * 24 * 60 * 60_000;

/** Uploaded changes are kept for a week only; nothing reads them after they are synced. */
export const pruneSyncedEventsBefore = async (
  db: SyncEventDatabase,
  cutoffIso: string
): Promise<void> => {
  await db.runAsync(
    "DELETE FROM sync_events WHERE status = 'synced' AND COALESCE(synced_at, created_at) < ?",
    cutoffIso
  );
};
