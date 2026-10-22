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
