import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const { shouldApplyLocalChange } = await import('../src/features/sync/syncConflictPolicy.ts');
const {
  buildSnapshotFingerprintSource,
  canSkipRemoteApply,
  countUnsyncedEventsAfter,
  discardUnsyncedEventsThrough,
  fetchAllPages,
  getAutoRetryDelayMs,
  isSameSyncTimestamp,
  pruneSyncedEventsBefore,
} = await import('../src/features/sync/syncRunPolicy.ts');
const { migrateDatabaseSchema } = await import('../src/shared/storage/migrations.ts');

assert.deepEqual(
  shouldApplyLocalChange({
    localChangedAt: '2026-05-21T10:00:00.000Z',
    remoteChangedAt: null,
  }),
  {
    shouldApply: true,
    reason: 'no_remote',
  }
);

assert.deepEqual(
  shouldApplyLocalChange({
    localChangedAt: '2026-05-21T10:00:00.000Z',
    remoteChangedAt: '2026-05-21T09:59:59.000Z',
  }),
  {
    shouldApply: true,
    reason: 'local_newer_or_equal',
  }
);

assert.deepEqual(
  shouldApplyLocalChange({
    localChangedAt: '2026-05-21T10:00:00.000Z',
    remoteChangedAt: '2026-05-21T10:00:01.000Z',
  }),
  {
    shouldApply: false,
    reason: 'remote_newer',
  }
);

assert.deepEqual(
  shouldApplyLocalChange({
    localChangedAt: '2026-05-21T10:00:00.000Z',
    remoteChangedAt: '2026-05-21T10:00:01.000Z',
    force: true,
  }),
  {
    shouldApply: true,
    reason: 'forced',
  }
);

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
assert.match(
  schema,
  /create table if not exists phrase_events \(\s+id text primary key,/,
  'phrase_events.id must stay text because local sync event ids use createId("phrase-event")'
);

// Remote tables larger than one Supabase page must be read completely; a truncated snapshot would
// delete the missing rows locally on the next pull.
{
  const remoteRows = Array.from({ length: 2345 }, (_, index) => ({ id: `row-${index}` }));
  const requestedRanges = [];
  const rows = await fetchAllPages(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: remoteRows.slice(from, to + 1), error: null };
  });
  assert.equal(rows.length, remoteRows.length);
  assert.deepEqual(requestedRanges, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);

  const failure = new Error('network');
  await assert.rejects(
    fetchAllPages(async () => ({ data: null, error: failure })),
    (error) => error === failure
  );
}

// Postgres returns +00:00 offsets while local rows use Z; media reuse depends on matching instants.
assert.equal(isSameSyncTimestamp('2026-05-21T10:00:00.000Z', '2026-05-21T10:00:00+00:00'), true);
assert.equal(isSameSyncTimestamp('2026-05-21T10:00:00.000Z', '2026-05-21T10:00:01+00:00'), false);
assert.equal(isSameSyncTimestamp(null, '2026-05-21T10:00:00+00:00'), false);

// Failed uploads retry on their own with growing pauses instead of staying paused forever.
assert.equal(getAutoRetryDelayMs(0, 20_000, 900_000), 0);
assert.equal(getAutoRetryDelayMs(1, 20_000, 900_000), 20_000);
assert.equal(getAutoRetryDelayMs(3, 20_000, 900_000), 80_000);
assert.equal(getAutoRetryDelayMs(20, 20_000, 900_000), 900_000);

// A pull must not overwrite edits queued while it was downloading, and an explicit restore may only
// discard the changes that existed when it started.
{
  const database = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (source) => database.exec(source),
    runAsync: async (source, ...params) => database.prepare(source).run(...params),
    getFirstAsync: async (source, ...params) => database.prepare(source).get(...params) ?? null,
    getAllAsync: async (source, ...params) => database.prepare(source).all(...params),
    withTransactionAsync: async (task) => {
      database.exec('BEGIN');
      try {
        const result = await task();
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  await migrateDatabaseSchema(db);

  const enqueue = (status) =>
    database
      .prepare(
        "INSERT INTO sync_events (entity_type, entity_id, operation, payload, created_at, status) VALUES ('tiles', 't1', 'upsert', '{}', '2026-05-21T10:00:00.000Z', ?)"
      )
      .run(status).lastInsertRowid;

  enqueue('synced');
  assert.equal(await countUnsyncedEventsAfter(db, null), 0);

  const beforeRestore = Number(enqueue('pending'));
  enqueue('error');
  assert.equal(await countUnsyncedEventsAfter(db, null), 2, 'normal pull is blocked by queued edits');

  const restoreThrough = Number(
    database.prepare("SELECT MAX(id) AS id FROM sync_events WHERE status IN ('pending', 'error')").get().id
  );
  assert.ok(restoreThrough > beforeRestore);
  assert.equal(await countUnsyncedEventsAfter(db, restoreThrough), 0);

  const editedDuringRestore = Number(enqueue('pending'));
  assert.equal(await countUnsyncedEventsAfter(db, restoreThrough), 1, 'edits during restore block it');

  await discardUnsyncedEventsThrough(db, restoreThrough);
  const remaining = database
    .prepare('SELECT id, status FROM sync_events ORDER BY id')
    .all()
    .map((row) => [Number(row.id), row.status]);
  assert.deepEqual(remaining, [
    [1, 'synced'],
    [editedDuringRestore, 'pending'],
  ]);
  database.close();
}

// Background pulls skip the local rewrite only when the cloud snapshot is unchanged and nothing
// was uploaded in the same run.
{
  const snapshot = {
    boards: [{ id: 'b1', name: 'Doma', updated_at: '2026-05-21T10:00:00+00:00' }],
    tiles: [{ id: 't1', label_cs: 'pít', image_remote_path: null }],
    settings: null,
  };
  const reordered = {
    settings: null,
    tiles: [{ image_remote_path: undefined, label_cs: 'pít', id: 't1' }],
    boards: [{ updated_at: '2026-05-21T10:00:00+00:00', name: 'Doma', id: 'b1' }],
  };
  const source = buildSnapshotFingerprintSource('p1', snapshot);
  assert.equal(source, buildSnapshotFingerprintSource('p1', reordered), 'key order is ignored');
  assert.notEqual(source, buildSnapshotFingerprintSource('p2', snapshot), 'profile is part of it');
  assert.notEqual(
    source,
    buildSnapshotFingerprintSource('p1', {
      ...snapshot,
      tiles: [{ ...snapshot.tiles[0], label_cs: 'jíst' }],
    }),
    'an edit from another device changes it'
  );
  assert.notEqual(
    source,
    buildSnapshotFingerprintSource('p1', {
      ...snapshot,
      boards: [{ ...snapshot.boards[0], updated_at: '2026-05-21T10:00:01+00:00' }],
    }),
    'a newer timestamp changes it'
  );

  assert.equal(
    canSkipRemoteApply({ fingerprint: 'a', lastAppliedFingerprint: 'a', uploadedEventCount: 0 }),
    true
  );
  assert.equal(
    canSkipRemoteApply({ fingerprint: 'a', lastAppliedFingerprint: 'a', uploadedEventCount: 1 }),
    false,
    'any upload means apply'
  );
  assert.equal(
    canSkipRemoteApply({ fingerprint: 'a', lastAppliedFingerprint: 'b', uploadedEventCount: 0 }),
    false
  );
  assert.equal(
    canSkipRemoteApply({ fingerprint: 'a', lastAppliedFingerprint: null, uploadedEventCount: 0 }),
    false,
    'cleared fingerprint (restore, keep local, new profile) means apply'
  );
}

// Uploaded changes older than the cutoff are pruned; queued and failed changes are kept.
{
  const database = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (source) => database.exec(source),
    runAsync: async (source, ...params) => database.prepare(source).run(...params),
    getFirstAsync: async (source, ...params) => database.prepare(source).get(...params) ?? null,
    getAllAsync: async (source, ...params) => database.prepare(source).all(...params),
    withTransactionAsync: async (task) => task(),
  };
  await migrateDatabaseSchema(db);

  const insert = (status, createdAt, syncedAt) =>
    Number(
      database
        .prepare(
          "INSERT INTO sync_events (entity_type, entity_id, operation, payload, created_at, synced_at, status) VALUES ('tiles', 't1', 'upsert', '{}', ?, ?, ?)"
        )
        .run(createdAt, syncedAt, status).lastInsertRowid
    );

  insert('synced', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:05.000Z');
  insert('synced', '2026-05-01T10:00:00.000Z', null);
  const recentSynced = insert('synced', '2026-05-01T10:00:00.000Z', '2026-05-20T10:00:00.000Z');
  const oldPending = insert('pending', '2026-05-01T10:00:00.000Z', null);
  const oldError = insert('error', '2026-05-01T10:00:00.000Z', null);

  await pruneSyncedEventsBefore(db, '2026-05-14T10:00:00.000Z');
  const remaining = database
    .prepare('SELECT id FROM sync_events ORDER BY id')
    .all()
    .map((row) => Number(row.id));
  assert.deepEqual(remaining, [recentSynced, oldPending, oldError]);
  database.close();
}

console.log('sync-conflict-policy-ok');
