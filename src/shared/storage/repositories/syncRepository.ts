import type { EntityType, SyncEvent } from '../../types/domain';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';

export const enqueueSyncEvent = async (
  entityType: EntityType,
  entityId: string,
  operation: 'upsert' | 'delete',
  payload: unknown
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `
      INSERT INTO sync_events (entity_type, entity_id, operation, payload, created_at, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `,
    entityType,
    entityId,
    operation,
    JSON.stringify(payload),
    nowIso()
  );
};

type SyncEventRow = {
  id: number;
  entity_type: EntityType;
  entity_id: string;
  operation: 'upsert' | 'delete';
  payload: string;
  created_at: string;
  synced_at?: string | null;
  status: 'pending' | 'synced' | 'error';
};

const mapRow = (row: SyncEventRow): SyncEvent => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  operation: row.operation,
  payload: row.payload,
  createdAt: row.created_at,
  syncedAt: row.synced_at ?? undefined,
  status: row.status,
});

export const getPendingSyncEvents = async (limit = 100): Promise<SyncEvent[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<SyncEventRow>(
    `
      SELECT id, entity_type, entity_id, operation, payload, created_at, synced_at, status
      FROM sync_events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `,
    limit
  );

  return rows.map(mapRow);
};

export const markSyncEventsSynced = async (eventIds: number[]): Promise<void> => {
  if (eventIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = eventIds.map(() => '?').join(',');
  await db.runAsync(
    `
      UPDATE sync_events
      SET status = 'synced', synced_at = ?
      WHERE id IN (${placeholders})
    `,
    nowIso(),
    ...eventIds
  );
};

export const markSyncEventsError = async (eventIds: number[]): Promise<void> => {
  if (eventIds.length === 0) {
    return;
  }

  const db = await getDatabase();
  const placeholders = eventIds.map(() => '?').join(',');
  await db.runAsync(
    `
      UPDATE sync_events
      SET status = 'error'
      WHERE id IN (${placeholders})
    `,
    ...eventIds
  );
};

export const countPendingSyncEvents = async (): Promise<number> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_events WHERE status = 'pending'"
  );

  return result?.count ?? 0;
};

export const countErroredSyncEvents = async (): Promise<number> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_events WHERE status = 'error'"
  );

  return result?.count ?? 0;
};

export const retryErroredSyncEvents = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `
      UPDATE sync_events
      SET status = 'pending'
      WHERE status = 'error'
    `
  );
};

export const clearUnsyncedSyncEvents = async (): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `
      DELETE FROM sync_events
      WHERE status IN ('pending', 'error')
    `
  );
};
