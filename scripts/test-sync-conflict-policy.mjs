import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { shouldApplyLocalChange } = await import('../src/features/sync/syncConflictPolicy.ts');

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

console.log('sync-conflict-policy-ok');
