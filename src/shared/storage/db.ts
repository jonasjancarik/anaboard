import * as SQLite from 'expo-sqlite';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let didMigrate = false;

const hasColumn = async (
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> => {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
};

const migrate = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS boards (
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

    CREATE TABLE IF NOT EXISTS tiles (
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
      dirty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tiles_history (
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

    CREATE TABLE IF NOT EXISTS tile_archive (
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

    CREATE TABLE IF NOT EXISTS audio_clips (
      id TEXT PRIMARY KEY NOT NULL,
      tile_id TEXT NOT NULL,
      local_uri TEXT,
      remote_path TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      checksum TEXT,
      format TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      dirty INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(tile_id) REFERENCES tiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS profile_settings (
      profile_id TEXT PRIMARY KEY NOT NULL,
      pin_hash TEXT NOT NULL,
      lock_enabled INTEGER NOT NULL DEFAULT 1,
      backup_pin_enabled INTEGER NOT NULL DEFAULT 0,
      tts_rate REAL NOT NULL DEFAULT 0.86,
      tts_pitch REAL NOT NULL DEFAULT 1,
      preferred_voice TEXT,
      high_contrast INTEGER NOT NULL DEFAULT 0,
      show_labels INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      dirty INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS phrase_events (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      tile_sequence TEXT NOT NULL,
      spoken_text TEXT NOT NULL,
      mode TEXT NOT NULL,
      spoken_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tiles_board_position ON tiles(board_id, position);
    CREATE INDEX IF NOT EXISTS idx_tiles_dirty ON tiles(dirty);
    CREATE INDEX IF NOT EXISTS idx_tile_archive_board_deleted ON tile_archive(board_id, deleted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audio_clips_tile_id ON audio_clips(tile_id);
    CREATE INDEX IF NOT EXISTS idx_audio_clips_dirty ON audio_clips(dirty);
    CREATE INDEX IF NOT EXISTS idx_sync_events_status_created ON sync_events(status, created_at);
  `);

  // Forward-compatible migration for existing installs.
  if (!(await hasColumn(db, 'profile_settings', 'show_labels'))) {
    await db.runAsync(
      'ALTER TABLE profile_settings ADD COLUMN show_labels INTEGER NOT NULL DEFAULT 0'
    );
  }

  if (!(await hasColumn(db, 'profile_settings', 'backup_pin_enabled'))) {
    await db.runAsync(
      'ALTER TABLE profile_settings ADD COLUMN backup_pin_enabled INTEGER NOT NULL DEFAULT 0'
    );
  }

  const backupPinResetFlag = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ? LIMIT 1',
    'backup_pin_default_reset_v1'
  );

  if (!backupPinResetFlag) {
    await db.runAsync('UPDATE profile_settings SET backup_pin_enabled = 0');
    await db.runAsync(
      'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      'backup_pin_default_reset_v1',
      '1'
    );
  }
};

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('anaboard.db');
  }

  const db = await databasePromise;

  if (!didMigrate) {
    await migrate(db);
    didMigrate = true;
  }

  return db;
};
