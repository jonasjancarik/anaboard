import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { LATEST_SCHEMA_VERSION, getDatabaseSchemaVersion, migrateDatabaseSchema } =
  await import('../src/shared/storage/migrations.ts');

const createNodeMigrationAdapter = (database) => ({
  execAsync: async (source) => {
    database.exec(source);
  },
  runAsync: async (source, ...params) => {
    database.prepare(source).run(...params);
  },
  getFirstAsync: async (source, ...params) => {
    const row = database.prepare(source).get(...params);
    return row ?? null;
  },
  getAllAsync: async (source, ...params) => {
    return database.prepare(source).all(...params);
  },
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
});

const hasColumn = (database, tableName, columnName) => {
  const rows = database.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((row) => row.name === columnName);
};

const createLegacyDatabase = (database) => {
  database.exec(`
    PRAGMA user_version = 0;

    CREATE TABLE boards (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      locale TEXT NOT NULL,
      columns_count INTEGER NOT NULL,
      rows_count INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE tiles (
      id TEXT PRIMARY KEY NOT NULL,
      board_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      label_cs TEXT NOT NULL,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL,
      speech_mode TEXT NOT NULL,
      audio_clip_id TEXT,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE tiles_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tile_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      label_cs TEXT NOT NULL,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL,
      speech_mode TEXT NOT NULL,
      audio_clip_id TEXT,
      archived_at TEXT NOT NULL,
      revision INTEGER NOT NULL
    );

    CREATE TABLE tile_archive (
      id TEXT PRIMARY KEY NOT NULL,
      original_tile_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      original_position INTEGER NOT NULL,
      label_cs TEXT NOT NULL,
      emoji TEXT NOT NULL,
      category TEXT NOT NULL,
      speech_mode TEXT NOT NULL,
      audio_local_uri TEXT,
      audio_remote_path TEXT,
      audio_duration_ms INTEGER,
      audio_checksum TEXT,
      audio_format TEXT,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE audio_clips (
      id TEXT PRIMARY KEY NOT NULL,
      tile_id TEXT NOT NULL,
      local_uri TEXT,
      remote_path TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      format TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE profile_settings (
      profile_id TEXT PRIMARY KEY NOT NULL,
      pin_hash TEXT NOT NULL,
      lock_enabled INTEGER NOT NULL DEFAULT 1,
      tts_rate REAL NOT NULL DEFAULT 0.86,
      tts_pitch REAL NOT NULL DEFAULT 1,
      preferred_voice TEXT,
      high_contrast INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  database
    .prepare(`
      INSERT INTO boards (
        id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'default-board',
      'default-profile',
      'Moje tabule',
      'cs-CZ',
      4,
      4,
      1,
      '2026-01-01T00:00:00.000Z',
      1,
      0
    );

  database
    .prepare(`
      INSERT INTO tiles (
        id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, updated_at, revision, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'tile-1',
      'default-board',
      0,
      'Ano',
      '✅',
      'needs',
      'recording_with_tts_fallback',
      'clip-1',
      '2026-01-01T00:00:00.000Z',
      1,
      0
    );

  database
    .prepare(`
      INSERT INTO tiles_history (
        tile_id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, archived_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'tile-1',
      'default-board',
      0,
      'Ano',
      '✅',
      'needs',
      'recording_with_tts_fallback',
      'clip-1',
      '2026-01-01T00:00:00.000Z',
      1
    );

  database
    .prepare(`
      INSERT INTO tile_archive (
        id, original_tile_id, board_id, original_position, label_cs, emoji, category, speech_mode,
        audio_local_uri, audio_remote_path, audio_duration_ms, audio_checksum, audio_format, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'archive-1',
      'tile-legacy',
      'default-board',
      3,
      'Ještě',
      '➕',
      'needs',
      'recording_with_tts_fallback',
      'anaboard-media://audio/clip-archived/1',
      null,
      900,
      null,
      'm4a',
      '2026-01-01T00:00:00.000Z'
    );

  database
    .prepare(`
      INSERT INTO audio_clips (
        id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'clip-1',
      'tile-1',
      'anaboard-media://audio/clip-1/legacy',
      null,
      1200,
      null,
      'm4a',
      '2026-01-01T00:00:00.000Z',
      0
    );

  database
    .prepare(`
      INSERT INTO profile_settings (
        profile_id, pin_hash, lock_enabled, tts_rate, tts_pitch, preferred_voice, high_contrast, updated_at, revision, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      'default-profile',
      'pin-hash',
      1,
      0.86,
      1,
      null,
      0,
      '2026-01-01T00:00:00.000Z',
      1,
      0
    );

  database
    .prepare(`
      INSERT INTO sync_events (
        entity_type, entity_id, operation, payload, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      'tiles',
      'tile-1',
      'upsert',
      JSON.stringify({
        id: 'tile-1',
        speech_mode: 'recording_with_tts_fallback',
        audio_clip_id: 'clip-1',
      }),
      '2026-01-01T00:00:00.000Z',
      'pending'
    );

  database
    .prepare(`
      INSERT INTO sync_events (
        entity_type, entity_id, operation, payload, created_at, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      'profile_settings',
      'default-profile',
      'upsert',
      JSON.stringify({
        profile_id: 'default-profile',
        suggestion_count: 3,
      }),
      '2026-01-01T00:00:00.000Z',
      'pending'
    );
};

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'anaboard-migrations-'));
const databasePath = path.join(tempDirectory, 'legacy.db');

try {
  const database = new DatabaseSync(databasePath);
  createLegacyDatabase(database);

  const adapter = createNodeMigrationAdapter(database);

  await migrateDatabaseSchema(adapter);

  assert.equal(await getDatabaseSchemaVersion(adapter), LATEST_SCHEMA_VERSION);
  assert.equal(hasColumn(database, 'profile_settings', 'show_labels'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'backup_pin_enabled'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'phrase_bar_enabled'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'suggestion_count'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'board_layout_mode'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'category_order'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'categories_start_new_page'), true);
  assert.equal(hasColumn(database, 'profile_settings', 'child_gender'), true);
  assert.equal(hasColumn(database, 'tiles', 'visual_type'), true);
  assert.equal(hasColumn(database, 'tile_archive', 'image_remote_path'), true);
  assert.equal(hasColumn(database, 'saved_phrases', 'tokens_json'), true);

  const tile = database
    .prepare('SELECT speech_mode FROM tiles WHERE id = ?')
    .get('tile-1');
  assert.equal(tile.speech_mode, 'recording_only');

  const archivedTile = database
    .prepare('SELECT speech_mode FROM tile_archive WHERE id = ?')
    .get('archive-1');
  assert.equal(archivedTile.speech_mode, 'recording_only');

  const pendingEvent = database
    .prepare('SELECT payload FROM sync_events WHERE entity_id = ?')
    .get('tile-1');
  const pendingPayload = JSON.parse(pendingEvent.payload);
  assert.equal(pendingPayload.speech_mode, 'recording_only');

  const settingsRow = database
    .prepare('SELECT show_labels, backup_pin_enabled, suggestion_count, board_layout_mode, category_order, categories_start_new_page, child_gender FROM profile_settings WHERE profile_id = ?')
    .get('default-profile');
  assert.equal(settingsRow.show_labels, 0);
  assert.equal(settingsRow.backup_pin_enabled, 0);
  assert.equal(settingsRow.suggestion_count, 3);
  assert.equal(settingsRow.board_layout_mode, 'manual');
  assert.equal(settingsRow.category_order, '["needs","feelings","social","food"]');
  assert.equal(settingsRow.categories_start_new_page, 1);
  assert.equal(settingsRow.child_gender, 'masculine');

  const pendingSettingsEvent = database
    .prepare('SELECT payload FROM sync_events WHERE entity_type = ? AND entity_id = ?')
    .get('profile_settings', 'default-profile');
  const pendingSettingsPayload = JSON.parse(pendingSettingsEvent.payload);
  assert.equal(pendingSettingsPayload.board_layout_mode, 'manual');
  assert.equal(pendingSettingsPayload.category_order, '["needs","feelings","social","food"]');
  assert.equal(pendingSettingsPayload.categories_start_new_page, 1);
  assert.equal(pendingSettingsPayload.child_gender, 'masculine');

  const phraseEventsIndex = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_phrase_events_profile_spoken'
    `)
    .get();
  assert.equal(phraseEventsIndex.name, 'idx_phrase_events_profile_spoken');

  await migrateDatabaseSchema(adapter);
  assert.equal(await getDatabaseSchemaVersion(adapter), LATEST_SCHEMA_VERSION);

  database.close();

  console.log('db-migrations-ok');
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
