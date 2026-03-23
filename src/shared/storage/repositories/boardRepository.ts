import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROFILE_ID,
  DEFAULT_TILES,
} from '../../constants/defaults';
import type {
  AudioClip,
  Board,
  BoardSnapshot,
  Category,
  SpeechMode,
  Tile,
  TileVisualType,
} from '../../types/domain';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

type BoardRow = {
  id: string;
  profile_id: string;
  name: string;
  locale: string;
  columns_count: number;
  rows_count: number;
  is_active: number;
  updated_at: string;
  revision: number;
};

type TileRow = {
  id: string;
  board_id: string;
  position: number;
  label_cs: string;
  emoji: string;
  visual_type: TileVisualType;
  image_local_uri?: string | null;
  image_remote_path?: string | null;
  category: Category;
  speech_mode: SpeechMode;
  audio_clip_id?: string | null;
  updated_at: string;
  revision: number;
};

type AudioClipRow = {
  id: string;
  tile_id: string;
  local_uri?: string | null;
  remote_path?: string | null;
  duration_ms: number;
  checksum?: string | null;
  format: string;
  updated_at: string;
};

const mapBoardRow = (row: BoardRow): Board => ({
  id: row.id,
  profileId: row.profile_id,
  name: row.name,
  locale: row.locale,
  columns: row.columns_count,
  rows: row.rows_count,
  isActive: row.is_active === 1,
  updatedAt: row.updated_at,
  revision: row.revision,
});

const mapTileRow = (row: TileRow): Tile => ({
  id: row.id,
  boardId: row.board_id,
  position: row.position,
  labelCs: row.label_cs,
  emoji: row.emoji,
  visualType: row.visual_type,
  imageLocalUri: row.image_local_uri ?? undefined,
  imageRemotePath: row.image_remote_path ?? undefined,
  category: row.category,
  speechMode: row.speech_mode,
  audioClipId: row.audio_clip_id ?? undefined,
  updatedAt: row.updated_at,
  revision: row.revision,
});

const mapAudioClipRow = (row: AudioClipRow): AudioClip => ({
  id: row.id,
  tileId: row.tile_id,
  localUri: row.local_uri ?? undefined,
  remotePath: row.remote_path ?? undefined,
  durationMs: row.duration_ms,
  checksum: row.checksum ?? undefined,
  format: row.format,
  updatedAt: row.updated_at,
});

const insertDefaultBoard = async (): Promise<void> => {
  const db = await getDatabase();
  const timestamp = nowIso();

  await db.runAsync(
    `
      INSERT INTO boards (id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision, dirty)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, 1)
    `,
    DEFAULT_BOARD_ID,
    DEFAULT_PROFILE_ID,
    'Moje tabule',
    'cs-CZ',
    4,
    4,
    timestamp
  );

  const tiles = DEFAULT_TILES(timestamp);
  for (const tile of tiles) {
    await db.runAsync(
      `
        INSERT INTO tiles (
          id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
          category, speech_mode, audio_clip_id, updated_at, revision, dirty
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      tile.id,
      tile.boardId,
      tile.position,
      tile.labelCs,
      tile.emoji,
      tile.visualType,
      tile.imageLocalUri ?? null,
      tile.imageRemotePath ?? null,
      tile.category,
      tile.speechMode,
      tile.audioClipId ?? null,
      tile.updatedAt,
      tile.revision
    );

    await enqueueSyncEvent('tiles', tile.id, 'upsert', {
      id: tile.id,
      board_id: tile.boardId,
      position: tile.position,
      label_cs: tile.labelCs,
      emoji: tile.emoji,
      visual_type: tile.visualType,
      image_remote_path: tile.imageRemotePath ?? null,
      category: tile.category,
      speech_mode: tile.speechMode,
      audio_clip_id: null,
      updated_at: tile.updatedAt,
      revision: tile.revision,
    });
  }

  await enqueueSyncEvent('boards', DEFAULT_BOARD_ID, 'upsert', {
    id: DEFAULT_BOARD_ID,
    profile_id: DEFAULT_PROFILE_ID,
    name: 'Moje tabule',
    locale: 'cs-CZ',
    columns_count: 4,
    rows_count: 4,
    updated_at: timestamp,
    revision: 1,
  });
};

const syncDefaultBoardTiles = async (): Promise<void> => {
  const db = await getDatabase();
  const boardRow = await db.getFirstAsync<BoardRow>(
    `
      SELECT id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision
      FROM boards
      WHERE id = ?
      LIMIT 1
    `,
    DEFAULT_BOARD_ID
  );

  if (!boardRow) {
    return;
  }

  const existingTiles = await db.getAllAsync<TileRow>(
    `
      SELECT
        id,
        board_id,
        position,
        label_cs,
        emoji,
        visual_type,
        image_local_uri,
        image_remote_path,
        category,
        speech_mode,
        audio_clip_id,
        updated_at,
        revision
      FROM tiles
      WHERE board_id = ?
      ORDER BY position ASC
    `,
    DEFAULT_BOARD_ID
  );

  const existingIds = new Set(existingTiles.map((tile) => tile.id));
  const defaults = DEFAULT_TILES(nowIso());
  const missingDefaults = defaults.filter((tile) => !existingIds.has(tile.id));

  if (missingDefaults.length === 0) {
    return;
  }

  const timestamp = nowIso();
  const startPosition = existingTiles.length;

  await db.withTransactionAsync(async () => {
    for (let index = 0; index < missingDefaults.length; index += 1) {
      const tile = missingDefaults[index];
      const position = startPosition + index;

      await db.runAsync(
        `
          INSERT INTO tiles (
            id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
            category, speech_mode, audio_clip_id, updated_at, revision, dirty
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1)
        `,
        tile.id,
        DEFAULT_BOARD_ID,
        position,
        tile.labelCs,
        tile.emoji,
        tile.visualType,
        tile.imageLocalUri ?? null,
        tile.imageRemotePath ?? null,
        tile.category,
        tile.speechMode,
        timestamp
      );
    }

    await db.runAsync(
      'UPDATE boards SET updated_at = ?, revision = revision + 1, dirty = 1 WHERE id = ?',
      timestamp,
      DEFAULT_BOARD_ID
    );
  });

  for (let index = 0; index < missingDefaults.length; index += 1) {
    const tile = missingDefaults[index];
    const position = startPosition + index;

    await enqueueSyncEvent('tiles', tile.id, 'upsert', {
      id: tile.id,
      board_id: DEFAULT_BOARD_ID,
      position,
      label_cs: tile.labelCs,
      emoji: tile.emoji,
      visual_type: tile.visualType,
      image_remote_path: tile.imageRemotePath ?? null,
      category: tile.category,
      speech_mode: tile.speechMode,
      audio_clip_id: null,
      updated_at: timestamp,
      revision: 1,
    });
  }

  await enqueueSyncEvent('boards', DEFAULT_BOARD_ID, 'upsert', {
    id: DEFAULT_BOARD_ID,
    updated_at: timestamp,
    revision: boardRow.revision + 1,
  });
};

export const ensureDefaultBoard = async (): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM boards');

  if ((existing?.count ?? 0) > 0) {
    await syncDefaultBoardTiles();
    return;
  }

  await insertDefaultBoard();
};

export const getActiveBoardSnapshot = async (): Promise<BoardSnapshot | null> => {
  const db = await getDatabase();
  const boardRow = await db.getFirstAsync<BoardRow>(
    `
      SELECT id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision
      FROM boards
      WHERE is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `
  );

  if (!boardRow) {
    return null;
  }

  const tileRows = await db.getAllAsync<TileRow>(
    `
      SELECT
        id,
        board_id,
        position,
        label_cs,
        emoji,
        visual_type,
        image_local_uri,
        image_remote_path,
        category,
        speech_mode,
        audio_clip_id,
        updated_at,
        revision
      FROM tiles
      WHERE board_id = ?
      ORDER BY position ASC
    `,
    boardRow.id
  );

  const audioClipRows = await db.getAllAsync<AudioClipRow>(
    `
      SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
      FROM audio_clips
      WHERE tile_id IN (SELECT id FROM tiles WHERE board_id = ?)
    `,
    boardRow.id
  );

  return {
    board: mapBoardRow(boardRow),
    tiles: tileRows.map(mapTileRow),
    audioClips: audioClipRows.map(mapAudioClipRow),
  };
};

export const resetActiveBoardToDefaults = async (): Promise<void> => {
  const snapshot = await getActiveBoardSnapshot();
  if (!snapshot) {
    await insertDefaultBoard();
    return;
  }

  const db = await getDatabase();
  const timestamp = nowIso();
  const nextTiles =
    snapshot.board.id === DEFAULT_BOARD_ID
      ? DEFAULT_TILES(timestamp)
      : DEFAULT_TILES(timestamp).map((tile) => ({
          ...tile,
          id: createId('tile'),
          boardId: snapshot.board.id,
          updatedAt: timestamp,
        }));
  const existingTileIds = new Set(snapshot.tiles.map((tile) => tile.id));
  const nextTileIds = new Set(nextTiles.map((tile) => tile.id));
  const deletedTileIds = [...existingTileIds].filter((tileId) => !nextTileIds.has(tileId));
  const deletedClipIds = snapshot.audioClips.map((clip) => clip.id);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM audio_clips WHERE tile_id IN (SELECT id FROM tiles WHERE board_id = ?)',
      snapshot.board.id
    );

    await db.runAsync('DELETE FROM tiles WHERE board_id = ?', snapshot.board.id);

    for (const tile of nextTiles) {
      await db.runAsync(
        `
          INSERT INTO tiles (
            id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
            category, speech_mode, audio_clip_id, updated_at, revision, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1)
        `,
        tile.id,
        snapshot.board.id,
        tile.position,
        tile.labelCs,
        tile.emoji,
        tile.visualType,
        tile.imageLocalUri ?? null,
        tile.imageRemotePath ?? null,
        tile.category,
        tile.speechMode,
        timestamp
      );
    }

    await db.runAsync(
      'UPDATE boards SET updated_at = ?, revision = revision + 1, dirty = 1 WHERE id = ?',
      timestamp,
      snapshot.board.id
    );
  });

  for (const clipId of deletedClipIds) {
    await enqueueSyncEvent('audio_clips', clipId, 'delete', {
      id: clipId,
    });
  }

  for (const tileId of deletedTileIds) {
    await enqueueSyncEvent('tiles', tileId, 'delete', {
      id: tileId,
    });
  }

  for (const tile of nextTiles) {
    await enqueueSyncEvent('tiles', tile.id, 'upsert', {
      id: tile.id,
      board_id: snapshot.board.id,
      position: tile.position,
      label_cs: tile.labelCs,
      emoji: tile.emoji,
      visual_type: tile.visualType,
      image_remote_path: tile.imageRemotePath ?? null,
      category: tile.category,
      speech_mode: tile.speechMode,
      audio_clip_id: null,
      updated_at: timestamp,
      revision: 1,
    });
  }

  await enqueueSyncEvent('boards', snapshot.board.id, 'upsert', {
    id: snapshot.board.id,
    updated_at: timestamp,
    revision: snapshot.board.revision + 1,
  });
};

export const duplicateActiveBoard = async (): Promise<void> => {
  const db = await getDatabase();
  const snapshot = await getActiveBoardSnapshot();
  if (!snapshot) {
    return;
  }

  const timestamp = nowIso();
  const newBoardId = createId('board');
  const tileEvents: Array<{ tileId: string; payload: Record<string, unknown> }> = [];
  const clipEvents: Array<{ clipId: string; payload: Record<string, unknown> }> = [];

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE boards SET is_active = 0 WHERE is_active = 1');

    await db.runAsync(
      `
        INSERT INTO boards (
          id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision, dirty
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, 1)
      `,
      newBoardId,
      snapshot.board.profileId,
      `${snapshot.board.name} (kopie)`,
      snapshot.board.locale,
      snapshot.board.columns,
      snapshot.board.rows,
      timestamp
    );

    for (const tile of snapshot.tiles) {
      const newTileId = createId('tile');
      await db.runAsync(
        `
          INSERT INTO tiles (
            id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
            category, speech_mode, audio_clip_id, updated_at, revision, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1)
        `,
        newTileId,
        newBoardId,
        tile.position,
        tile.labelCs,
        tile.emoji,
        tile.visualType,
        tile.imageLocalUri ?? null,
        tile.imageRemotePath ?? null,
        tile.category,
        tile.speechMode,
        timestamp
      );

      tileEvents.push({
        tileId: newTileId,
        payload: {
          id: newTileId,
          board_id: newBoardId,
          position: tile.position,
          label_cs: tile.labelCs,
          emoji: tile.emoji,
          visual_type: tile.visualType,
          image_remote_path: tile.imageRemotePath ?? null,
          category: tile.category,
          speech_mode: tile.speechMode,
          audio_clip_id: null,
          updated_at: timestamp,
          revision: 1,
        },
      });

      const clip = snapshot.audioClips.find((audioClip) => audioClip.tileId === tile.id);
      if (clip) {
        const newClipId = createId('clip');

        await db.runAsync(
          `
            INSERT INTO audio_clips (id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at, dirty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
          `,
          newClipId,
          newTileId,
          clip.localUri ?? null,
          clip.remotePath ?? null,
          clip.durationMs,
          clip.checksum ?? null,
          clip.format,
          timestamp
        );

        await db.runAsync('UPDATE tiles SET audio_clip_id = ? WHERE id = ?', newClipId, newTileId);

        tileEvents[tileEvents.length - 1].payload.audio_clip_id = newClipId;
        clipEvents.push({
          clipId: newClipId,
          payload: {
            id: newClipId,
            tile_id: newTileId,
            local_uri: clip.localUri ?? null,
            remote_path: clip.remotePath ?? null,
            duration_ms: clip.durationMs,
            checksum: clip.checksum ?? null,
            format: clip.format,
            updated_at: timestamp,
          },
        });
      }
    }
  });

  await enqueueSyncEvent('boards', newBoardId, 'upsert', {
    id: newBoardId,
    profile_id: snapshot.board.profileId,
    name: `${snapshot.board.name} (kopie)`,
    locale: snapshot.board.locale,
    columns_count: snapshot.board.columns,
    rows_count: snapshot.board.rows,
    updated_at: timestamp,
    revision: 1,
  });

  for (const event of tileEvents) {
    await enqueueSyncEvent('tiles', event.tileId, 'upsert', event.payload);
  }

  for (const event of clipEvents) {
    await enqueueSyncEvent('audio_clips', event.clipId, 'upsert', event.payload);
  }
};
