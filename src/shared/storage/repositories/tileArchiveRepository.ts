import type * as SQLite from 'expo-sqlite';

import type { ArchivedTile, Category, SpeechMode } from '../../types/domain';
import { createId } from '../../utils/id';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

type ArchivedTileRow = {
  id: string;
  original_tile_id: string;
  board_id: string;
  original_position: number;
  label_cs: string;
  emoji: string;
  category: Category;
  speech_mode: SpeechMode;
  audio_local_uri?: string | null;
  audio_remote_path?: string | null;
  audio_duration_ms?: number | null;
  audio_checksum?: string | null;
  audio_format?: string | null;
  deleted_at: string;
};

type ActiveTileRow = {
  id: string;
  position: number;
};

export type ArchivedTileInput = {
  id: string;
  boardId: string;
  position: number;
  labelCs: string;
  emoji: string;
  category: Category;
  speechMode: SpeechMode;
};

export type ArchivedAudioClipInput = {
  localUri?: string | null;
  remotePath?: string | null;
  durationMs: number;
  checksum?: string | null;
  format: string;
};

const mapArchivedTileRow = (row: ArchivedTileRow): ArchivedTile => ({
  archiveId: row.id,
  originalTileId: row.original_tile_id,
  boardId: row.board_id,
  originalPosition: row.original_position,
  labelCs: row.label_cs,
  emoji: row.emoji,
  category: row.category,
  speechMode: row.speech_mode,
  audioClip:
    row.audio_duration_ms !== null && row.audio_duration_ms !== undefined && row.audio_format
      ? {
          localUri: row.audio_local_uri ?? undefined,
          remotePath: row.audio_remote_path ?? undefined,
          durationMs: row.audio_duration_ms,
          checksum: row.audio_checksum ?? undefined,
          format: row.audio_format,
        }
      : undefined,
  deletedAt: row.deleted_at,
});

export const archiveDeletedTile = async (input: {
  tile: ArchivedTileInput;
  clip?: ArchivedAudioClipInput | null;
}, database?: SQLite.SQLiteDatabase): Promise<void> => {
  const db = database ?? (await getDatabase());
  const archiveId = createId('tile-archive');

  await db.runAsync(
    `
      INSERT INTO tile_archive (
        id, original_tile_id, board_id, original_position, label_cs, emoji, category, speech_mode,
        audio_local_uri, audio_remote_path, audio_duration_ms, audio_checksum, audio_format, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    archiveId,
    input.tile.id,
    input.tile.boardId,
    input.tile.position,
    input.tile.labelCs,
    input.tile.emoji,
    input.tile.category,
    input.tile.speechMode,
    input.clip?.localUri ?? null,
    input.clip?.remotePath ?? null,
    input.clip?.durationMs ?? null,
    input.clip?.checksum ?? null,
    input.clip?.format ?? null,
    nowIso()
  );
};

export const getArchivedTilesForBoard = async (boardId: string): Promise<ArchivedTile[]> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ArchivedTileRow>(
    `
      SELECT
        id,
        original_tile_id,
        board_id,
        original_position,
        label_cs,
        emoji,
        category,
        speech_mode,
        audio_local_uri,
        audio_remote_path,
        audio_duration_ms,
        audio_checksum,
        audio_format,
        deleted_at
      FROM tile_archive
      WHERE board_id = ?
      ORDER BY deleted_at DESC
    `,
    boardId
  );

  return rows.map(mapArchivedTileRow);
};

export const restoreArchivedTileToBoard = async (archiveId: string): Promise<string> => {
  const db = await getDatabase();
  const archived = await db.getFirstAsync<ArchivedTileRow>(
    `
      SELECT
        id,
        original_tile_id,
        board_id,
        original_position,
        label_cs,
        emoji,
        category,
        speech_mode,
        audio_local_uri,
        audio_remote_path,
        audio_duration_ms,
        audio_checksum,
        audio_format,
        deleted_at
      FROM tile_archive
      WHERE id = ?
      LIMIT 1
    `,
    archiveId
  );

  if (!archived) {
    throw new Error('Archivovaná dlaždice nebyla nalezena');
  }

  const tiles = await db.getAllAsync<ActiveTileRow>(
    `
      SELECT id, position
      FROM tiles
      WHERE board_id = ?
      ORDER BY position ASC
    `,
    archived.board_id
  );

  const newTileId = createId('tile');
  const restoredPosition = tiles.length;
  const updatedAt = nowIso();
  const archivedClipDuration =
    archived.audio_duration_ms !== null && archived.audio_duration_ms !== undefined
      ? archived.audio_duration_ms
      : null;
  const archivedClipFormat = archived.audio_format ?? null;
  const hasArchivedClip = archivedClipDuration !== null && archivedClipFormat !== null;
  const nextClipId = hasArchivedClip ? createId('clip') : null;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        INSERT INTO tiles (
          id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, updated_at, revision, dirty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
      `,
      newTileId,
      archived.board_id,
      restoredPosition,
      archived.label_cs,
      archived.emoji,
      archived.category,
      archived.speech_mode,
      nextClipId,
      updatedAt
    );

    if (nextClipId && hasArchivedClip) {
      await db.runAsync(
        `
          INSERT INTO audio_clips (
            id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        nextClipId,
        newTileId,
        archived.audio_local_uri ?? null,
        archived.audio_remote_path ?? null,
        archivedClipDuration,
        archived.audio_checksum ?? null,
        archivedClipFormat,
        updatedAt
      );
    }

    await db.runAsync('DELETE FROM tile_archive WHERE id = ?', archiveId);
  });

  await enqueueSyncEvent('tiles', newTileId, 'upsert', {
    id: newTileId,
    board_id: archived.board_id,
    position: restoredPosition,
    label_cs: archived.label_cs,
    emoji: archived.emoji,
    category: archived.category,
    speech_mode: archived.speech_mode,
    audio_clip_id: nextClipId,
    updated_at: updatedAt,
    revision: 1,
  });

  if (nextClipId && hasArchivedClip) {
    await enqueueSyncEvent('audio_clips', nextClipId, 'upsert', {
      id: nextClipId,
      tile_id: newTileId,
      local_uri: archived.audio_local_uri ?? null,
      remote_path: archived.audio_remote_path ?? null,
      duration_ms: archivedClipDuration,
      checksum: archived.audio_checksum ?? null,
      format: archivedClipFormat,
      updated_at: updatedAt,
    });
  }

  return newTileId;
};
