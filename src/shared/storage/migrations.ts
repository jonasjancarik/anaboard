export type MigrationDatabase = {
  execAsync: (source: string) => Promise<void>;
  runAsync: (source: string, ...params: any[]) => Promise<unknown>;
  getFirstAsync: <T>(source: string, ...params: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(source: string, ...params: unknown[]) => Promise<T[]>;
  withTransactionAsync: <T>(task: () => Promise<T>) => Promise<T>;
};

type MigrationStep = {
  version: number;
  label: string;
  run: (db: MigrationDatabase) => Promise<void>;
};

type AppMetaRow = {
  value: string;
};

const LEGACY_COMBINED_SPEECH_MODE = 'recording_with_tts_fallback';

const createBaseSchema = async (db: MigrationDatabase): Promise<void> => {
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
      visual_type TEXT NOT NULL DEFAULT 'emoji',
      image_local_uri TEXT,
      image_remote_path TEXT,
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
      visual_type TEXT NOT NULL DEFAULT 'emoji',
      image_local_uri TEXT,
      image_remote_path TEXT,
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
      visual_type TEXT NOT NULL DEFAULT 'emoji',
      image_local_uri TEXT,
      image_remote_path TEXT,
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
      phrase_bar_enabled INTEGER NOT NULL DEFAULT 1,
      suggestion_count INTEGER NOT NULL DEFAULT 3,
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

    CREATE TABLE IF NOT EXISTS saved_phrases (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      phrase_key TEXT NOT NULL,
      label TEXT NOT NULL,
      spoken_text TEXT NOT NULL,
      tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
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
    CREATE INDEX IF NOT EXISTS idx_phrase_events_profile_spoken ON phrase_events(profile_id, spoken_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_phrases_profile_updated ON saved_phrases(profile_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_phrases_profile_key ON saved_phrases(profile_id, phrase_key);
    CREATE INDEX IF NOT EXISTS idx_sync_events_status_created ON sync_events(status, created_at);
  `);
};

const hasColumn = async (
  db: MigrationDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> => {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
};

const getAppMetaValue = async (
  db: MigrationDatabase,
  key: string
): Promise<string | null> => {
  const row = await db.getFirstAsync<AppMetaRow>(
    'SELECT value FROM app_meta WHERE key = ? LIMIT 1',
    key
  );
  return row?.value ?? null;
};

const setAppMetaValue = async (
  db: MigrationDatabase,
  key: string,
  value: string
): Promise<void> => {
  await db.runAsync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    key,
    value
  );
};

const normalizeLegacyCombinedSpeechMode = async (
  db: MigrationDatabase
): Promise<void> => {
  const migratedFlag = await getAppMetaValue(
    db,
    'speech_mode_combined_removed_v1'
  );

  if (migratedFlag) {
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE tiles
        SET speech_mode = CASE
          WHEN audio_clip_id IS NOT NULL THEN 'recording_only'
          ELSE 'tts'
        END
        WHERE speech_mode = ?
      `,
      LEGACY_COMBINED_SPEECH_MODE
    );

    await db.runAsync(
      `
        UPDATE tiles_history
        SET speech_mode = CASE
          WHEN audio_clip_id IS NOT NULL THEN 'recording_only'
          ELSE 'tts'
        END
        WHERE speech_mode = ?
      `,
      LEGACY_COMBINED_SPEECH_MODE
    );

    await db.runAsync(
      `
        UPDATE tile_archive
        SET speech_mode = CASE
          WHEN audio_duration_ms IS NOT NULL AND audio_format IS NOT NULL THEN 'recording_only'
          ELSE 'tts'
        END
        WHERE speech_mode = ?
      `,
      LEGACY_COMBINED_SPEECH_MODE
    );

    const syncEvents = await db.getAllAsync<{ id: number; payload: string }>(
      `
        SELECT id, payload
        FROM sync_events
        WHERE entity_type = 'tiles'
          AND status != 'synced'
      `
    );

    for (const event of syncEvents) {
      try {
        const payload = JSON.parse(event.payload) as Record<string, unknown>;
        if (payload.speech_mode !== LEGACY_COMBINED_SPEECH_MODE) {
          continue;
        }

        payload.speech_mode = payload.audio_clip_id ? 'recording_only' : 'tts';

        await db.runAsync(
          'UPDATE sync_events SET payload = ? WHERE id = ?',
          JSON.stringify(payload),
          event.id
        );
      } catch {
        // Leave malformed payloads untouched.
      }
    }

    await setAppMetaValue(db, 'speech_mode_combined_removed_v1', '1');
  });
};

const resetLegacyBackupPinDefault = async (
  db: MigrationDatabase
): Promise<void> => {
  const migratedFlag = await getAppMetaValue(db, 'backup_pin_default_reset_v1');

  if (migratedFlag) {
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE profile_settings SET backup_pin_enabled = 0');
    await setAppMetaValue(db, 'backup_pin_default_reset_v1', '1');
  });
};

const ensurePhraseSchema = async (db: MigrationDatabase): Promise<void> => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_phrases (
      id TEXT PRIMARY KEY NOT NULL,
      profile_id TEXT NOT NULL,
      phrase_key TEXT NOT NULL,
      label TEXT NOT NULL,
      spoken_text TEXT NOT NULL,
      tokens_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_phrase_events_profile_spoken
      ON phrase_events(profile_id, spoken_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_phrases_profile_updated
      ON saved_phrases(profile_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_phrases_profile_key
      ON saved_phrases(profile_id, phrase_key);
  `);
};

const ensurePhraseBarSetting = async (db: MigrationDatabase): Promise<void> => {
  if (!(await hasColumn(db, 'profile_settings', 'phrase_bar_enabled'))) {
    await db.runAsync(
      'ALTER TABLE profile_settings ADD COLUMN phrase_bar_enabled INTEGER NOT NULL DEFAULT 1'
    );
  }
};

const ensureSuggestionCountSetting = async (db: MigrationDatabase): Promise<void> => {
  if (!(await hasColumn(db, 'profile_settings', 'suggestion_count'))) {
    await db.runAsync(
      'ALTER TABLE profile_settings ADD COLUMN suggestion_count INTEGER NOT NULL DEFAULT 3'
    );
  }
};

const migrationSteps: MigrationStep[] = [
  {
    version: 1,
    label: 'base-schema',
    run: createBaseSchema,
  },
  {
    version: 2,
    label: 'profile-settings-show-labels',
    run: async (db) => {
      if (!(await hasColumn(db, 'profile_settings', 'show_labels'))) {
        await db.runAsync(
          'ALTER TABLE profile_settings ADD COLUMN show_labels INTEGER NOT NULL DEFAULT 0'
        );
      }
    },
  },
  {
    version: 3,
    label: 'profile-settings-backup-pin',
    run: async (db) => {
      if (!(await hasColumn(db, 'profile_settings', 'backup_pin_enabled'))) {
        await db.runAsync(
          'ALTER TABLE profile_settings ADD COLUMN backup_pin_enabled INTEGER NOT NULL DEFAULT 0'
        );
      }
    },
  },
  {
    version: 4,
    label: 'tile-image-columns',
    run: async (db) => {
      if (!(await hasColumn(db, 'tiles', 'visual_type'))) {
        await db.runAsync(
          "ALTER TABLE tiles ADD COLUMN visual_type TEXT NOT NULL DEFAULT 'emoji'"
        );
      }

      if (!(await hasColumn(db, 'tiles', 'image_local_uri'))) {
        await db.runAsync('ALTER TABLE tiles ADD COLUMN image_local_uri TEXT');
      }

      if (!(await hasColumn(db, 'tiles', 'image_remote_path'))) {
        await db.runAsync('ALTER TABLE tiles ADD COLUMN image_remote_path TEXT');
      }

      if (!(await hasColumn(db, 'tiles_history', 'visual_type'))) {
        await db.runAsync(
          "ALTER TABLE tiles_history ADD COLUMN visual_type TEXT NOT NULL DEFAULT 'emoji'"
        );
      }

      if (!(await hasColumn(db, 'tiles_history', 'image_local_uri'))) {
        await db.runAsync('ALTER TABLE tiles_history ADD COLUMN image_local_uri TEXT');
      }

      if (!(await hasColumn(db, 'tiles_history', 'image_remote_path'))) {
        await db.runAsync('ALTER TABLE tiles_history ADD COLUMN image_remote_path TEXT');
      }

      if (!(await hasColumn(db, 'tile_archive', 'visual_type'))) {
        await db.runAsync(
          "ALTER TABLE tile_archive ADD COLUMN visual_type TEXT NOT NULL DEFAULT 'emoji'"
        );
      }

      if (!(await hasColumn(db, 'tile_archive', 'image_local_uri'))) {
        await db.runAsync('ALTER TABLE tile_archive ADD COLUMN image_local_uri TEXT');
      }

      if (!(await hasColumn(db, 'tile_archive', 'image_remote_path'))) {
        await db.runAsync('ALTER TABLE tile_archive ADD COLUMN image_remote_path TEXT');
      }
    },
  },
  {
    version: 5,
    label: 'normalize-legacy-speech-mode',
    run: normalizeLegacyCombinedSpeechMode,
  },
  {
    version: 6,
    label: 'reset-legacy-backup-pin-default',
    run: resetLegacyBackupPinDefault,
  },
  {
    version: 7,
    label: 'phrase-schema',
    run: ensurePhraseSchema,
  },
  {
    version: 8,
    label: 'profile-settings-phrase-bar',
    run: ensurePhraseBarSetting,
  },
  {
    version: 9,
    label: 'profile-settings-suggestion-count',
    run: ensureSuggestionCountSetting,
  },
];

export const LATEST_SCHEMA_VERSION = migrationSteps[migrationSteps.length - 1]?.version ?? 0;

export const getDatabaseSchemaVersion = async (
  db: MigrationDatabase
): Promise<number> => {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
};

const setDatabaseSchemaVersion = async (
  db: MigrationDatabase,
  version: number
): Promise<void> => {
  await db.execAsync(`PRAGMA user_version = ${version}`);
};

export const migrateDatabaseSchema = async (
  db: MigrationDatabase
): Promise<void> => {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const currentVersion = await getDatabaseSchemaVersion(db);
  if (currentVersion > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${LATEST_SCHEMA_VERSION}`
    );
  }

  for (const step of migrationSteps) {
    if (step.version <= currentVersion) {
      continue;
    }

    await step.run(db);
    await setDatabaseSchemaVersion(db, step.version);
  }
};
