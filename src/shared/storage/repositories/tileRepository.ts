import type { Category, SpeechMode } from '../../types/domain';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

type TileRow = {
  id: string;
  board_id: string;
  position: number;
  label_cs: string;
  emoji: string;
  category: Category;
  speech_mode: SpeechMode;
  audio_clip_id?: string | null;
  updated_at: string;
  revision: number;
};

export type TileUpdateInput = {
  labelCs?: string;
  emoji?: string;
  category?: Category;
  speechMode?: SpeechMode;
  audioClipId?: string | null;
};

const getTileById = async (tileId: string): Promise<TileRow | null> => {
  const db = await getDatabase();
  return db.getFirstAsync<TileRow>(
    `
      SELECT id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, updated_at, revision
      FROM tiles
      WHERE id = ?
      LIMIT 1
    `,
    tileId
  );
};

export const updateTile = async (tileId: string, input: TileUpdateInput): Promise<void> => {
  const db = await getDatabase();
  const current = await getTileById(tileId);

  if (!current) {
    throw new Error('Tile not found');
  }

  await db.runAsync(
    `
      INSERT INTO tiles_history (
        tile_id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, archived_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    current.id,
    current.board_id,
    current.position,
    current.label_cs,
    current.emoji,
    current.category,
    current.speech_mode,
    current.audio_clip_id ?? null,
    nowIso(),
    current.revision
  );

  const updatedAt = nowIso();
  const nextRevision = current.revision + 1;

  await db.runAsync(
    `
      UPDATE tiles
      SET label_cs = ?, emoji = ?, category = ?, speech_mode = ?, audio_clip_id = ?, updated_at = ?, revision = ?, dirty = 1
      WHERE id = ?
    `,
    input.labelCs ?? current.label_cs,
    input.emoji ?? current.emoji,
    input.category ?? current.category,
    input.speechMode ?? current.speech_mode,
    input.audioClipId === undefined ? (current.audio_clip_id ?? null) : input.audioClipId,
    updatedAt,
    nextRevision,
    tileId
  );

  await enqueueSyncEvent('tiles', tileId, 'upsert', {
    id: tileId,
    board_id: current.board_id,
    label_cs: input.labelCs ?? current.label_cs,
    emoji: input.emoji ?? current.emoji,
    category: input.category ?? current.category,
    speech_mode: input.speechMode ?? current.speech_mode,
    audio_clip_id:
      input.audioClipId === undefined ? (current.audio_clip_id ?? null) : input.audioClipId,
    updated_at: updatedAt,
    revision: nextRevision,
  });
};

export const updateTilePosition = async (tileId: string, nextPosition: number): Promise<void> => {
  const db = await getDatabase();

  const target = await getTileById(tileId);
  if (!target) {
    throw new Error('Tile not found');
  }

  const tiles = await db.getAllAsync<TileRow>(
    `
      SELECT id, board_id, position, label_cs, emoji, category, speech_mode, audio_clip_id, updated_at, revision
      FROM tiles
      WHERE board_id = ?
      ORDER BY position ASC
    `,
    target.board_id
  );

  const clampedPosition = Math.max(0, Math.min(tiles.length - 1, nextPosition));
  const orderedIds = tiles.map((tile) => tile.id);
  const currentIndex = orderedIds.indexOf(tileId);

  if (currentIndex === -1 || currentIndex === clampedPosition) {
    return;
  }

  orderedIds.splice(currentIndex, 1);
  orderedIds.splice(clampedPosition, 0, tileId);

  const updatedAt = nowIso();

  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      await db.runAsync(
        'UPDATE tiles SET position = ?, updated_at = ?, revision = revision + 1, dirty = 1 WHERE id = ?',
        index,
        updatedAt,
        id
      );
    }
  });

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    await enqueueSyncEvent('tiles', id, 'upsert', {
      id,
      position: index,
      updated_at: updatedAt,
    });
  }
};
