import type { Category, SpeechMode, TileVisualType } from "../../types/domain";
import { createId } from "../../utils/id";
import { nowIso } from "../../utils/time";
import { getDatabase } from "../db";
import { enqueueSyncEvent } from "./syncRepository";
import { archiveDeletedTile } from "./tileArchiveRepository";

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

export type TileUpdateInput = {
  labelCs?: string;
  emoji?: string;
  visualType?: TileVisualType;
  imageLocalUri?: string | null;
  imageRemotePath?: string | null;
  category?: Category;
  speechMode?: SpeechMode;
  audioClipId?: string | null;
};

const getTileById = async (tileId: string): Promise<TileRow | null> => {
  const db = await getDatabase();
  return db.getFirstAsync<TileRow>(
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
      WHERE id = ?
      LIMIT 1
    `,
    tileId,
  );
};

export const updateTile = async (
  tileId: string,
  input: TileUpdateInput,
): Promise<void> => {
  const db = await getDatabase();
  const current = await getTileById(tileId);

  if (!current) {
    throw new Error("Tile not found");
  }

  await db.runAsync(
    `
      INSERT INTO tiles_history (
        tile_id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
        category, speech_mode, audio_clip_id, archived_at, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    current.id,
    current.board_id,
    current.position,
    current.label_cs,
    current.emoji,
    current.visual_type,
    current.image_local_uri ?? null,
    current.image_remote_path ?? null,
    current.category,
    current.speech_mode,
    current.audio_clip_id ?? null,
    nowIso(),
    current.revision,
  );

  const updatedAt = nowIso();
  const nextRevision = current.revision + 1;

  await db.runAsync(
    `
      UPDATE tiles
      SET
        label_cs = ?,
        emoji = ?,
        visual_type = ?,
        image_local_uri = ?,
        image_remote_path = ?,
        category = ?,
        speech_mode = ?,
        audio_clip_id = ?,
        updated_at = ?,
        revision = ?,
        dirty = 1
      WHERE id = ?
    `,
    input.labelCs ?? current.label_cs,
    input.emoji ?? current.emoji,
    input.visualType ?? current.visual_type,
    input.imageLocalUri === undefined
      ? (current.image_local_uri ?? null)
      : input.imageLocalUri,
    input.imageRemotePath === undefined
      ? (current.image_remote_path ?? null)
      : input.imageRemotePath,
    input.category ?? current.category,
    input.speechMode ?? current.speech_mode,
    input.audioClipId === undefined
      ? (current.audio_clip_id ?? null)
      : input.audioClipId,
    updatedAt,
    nextRevision,
    tileId,
  );

  await enqueueSyncEvent("tiles", tileId, "upsert", {
    id: tileId,
    board_id: current.board_id,
    label_cs: input.labelCs ?? current.label_cs,
    emoji: input.emoji ?? current.emoji,
    visual_type: input.visualType ?? current.visual_type,
    image_remote_path:
      input.imageRemotePath === undefined
        ? (current.image_remote_path ?? null)
        : input.imageRemotePath,
    category: input.category ?? current.category,
    speech_mode: input.speechMode ?? current.speech_mode,
    audio_clip_id:
      input.audioClipId === undefined
        ? (current.audio_clip_id ?? null)
        : input.audioClipId,
    updated_at: updatedAt,
    revision: nextRevision,
  });
};

export const updateTilePosition = async (
  tileId: string,
  nextPosition: number,
): Promise<void> => {
  const db = await getDatabase();

  const target = await getTileById(tileId);
  if (!target) {
    throw new Error("Tile not found");
  }

  const tiles = await db.getAllAsync<TileRow>(
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
    target.board_id,
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
        "UPDATE tiles SET position = ?, updated_at = ?, revision = revision + 1, dirty = 1 WHERE id = ?",
        index,
        updatedAt,
        id,
      );
    }
  });

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    await enqueueSyncEvent("tiles", id, "upsert", {
      id,
      position: index,
      updated_at: updatedAt,
    });
  }
};

export const createTileAfter = async (
  afterTileId: string,
  input?: {
    labelCs?: string;
    emoji?: string;
    visualType?: TileVisualType;
    imageLocalUri?: string | null;
    imageRemotePath?: string | null;
    category?: Category;
    speechMode?: SpeechMode;
  },
): Promise<string> => {
  const db = await getDatabase();

  const anchor = await getTileById(afterTileId);
  if (!anchor) {
    throw new Error("Tile not found");
  }

  const tiles = await db.getAllAsync<TileRow>(
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
    anchor.board_id,
  );

  const insertPosition = anchor.position + 1;
  const tilesToShift = tiles.filter((tile) => tile.position >= insertPosition);

  const newTileId = createId("tile");
  const updatedAt = nowIso();
  const labelCs = input?.labelCs ?? "Nová";
  const emoji = input?.emoji ?? "⭐";
  const visualType = input?.visualType ?? "emoji";
  const imageLocalUri = input?.imageLocalUri ?? null;
  const imageRemotePath = input?.imageRemotePath ?? null;
  const category = input?.category ?? "needs";
  const speechMode = input?.speechMode ?? "tts";

  await db.withTransactionAsync(async () => {
    for (const tile of tilesToShift) {
      await db.runAsync(
        `
          UPDATE tiles
          SET position = ?, updated_at = ?, revision = revision + 1, dirty = 1
          WHERE id = ?
        `,
        tile.position + 1,
        updatedAt,
        tile.id,
      );
    }

    await db.runAsync(
      `
        INSERT INTO tiles (
          id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
          category, speech_mode, audio_clip_id, updated_at, revision, dirty
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 1)
      `,
      newTileId,
      anchor.board_id,
      insertPosition,
      labelCs,
      emoji,
      visualType,
      imageLocalUri,
      imageRemotePath,
      category,
      speechMode,
      updatedAt,
    );
  });

  for (const tile of tilesToShift) {
    await enqueueSyncEvent("tiles", tile.id, "upsert", {
      id: tile.id,
      position: tile.position + 1,
      updated_at: updatedAt,
    });
  }

  await enqueueSyncEvent("tiles", newTileId, "upsert", {
    id: newTileId,
    board_id: anchor.board_id,
    position: insertPosition,
    label_cs: labelCs,
    emoji,
    visual_type: visualType,
    image_remote_path: imageRemotePath,
    category,
    speech_mode: speechMode,
    audio_clip_id: null,
    updated_at: updatedAt,
    revision: 1,
  });

  return newTileId;
};

export const deleteTileById = async (tileId: string): Promise<void> => {
  const db = await getDatabase();

  const target = await getTileById(tileId);
  if (!target) {
    throw new Error("Tile not found");
  }

  const tiles = await db.getAllAsync<TileRow>(
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
    target.board_id,
  );

  if (tiles.length <= 1) {
    throw new Error("Poslední tile nelze smazat");
  }

  const tilesToShift = tiles.filter((tile) => tile.position > target.position);
  const updatedAt = nowIso();
  const targetClip = target.audio_clip_id
    ? await db.getFirstAsync<AudioClipRow>(
        `
          SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
          FROM audio_clips
          WHERE id = ?
          LIMIT 1
        `,
        target.audio_clip_id,
      )
    : null;

  await db.withTransactionAsync(async () => {
    await archiveDeletedTile(
      {
        tile: {
          id: target.id,
          boardId: target.board_id,
          position: target.position,
          labelCs: target.label_cs,
          emoji: target.emoji,
          visualType: target.visual_type,
          imageLocalUri: target.image_local_uri ?? null,
          imageRemotePath: target.image_remote_path ?? null,
          category: target.category,
          speechMode: target.speech_mode,
        },
        clip: targetClip
          ? {
              localUri: targetClip.local_uri ?? null,
              remotePath: targetClip.remote_path ?? null,
              durationMs: targetClip.duration_ms,
              checksum: targetClip.checksum ?? null,
              format: targetClip.format,
            }
          : null,
      },
      db,
    );

    if (target.audio_clip_id) {
      await db.runAsync(
        "DELETE FROM audio_clips WHERE id = ?",
        target.audio_clip_id,
      );
    }

    await db.runAsync("DELETE FROM tiles WHERE id = ?", tileId);

    for (const tile of tilesToShift) {
      await db.runAsync(
        `
          UPDATE tiles
          SET position = ?, updated_at = ?, revision = revision + 1, dirty = 1
          WHERE id = ?
        `,
        tile.position - 1,
        updatedAt,
        tile.id,
      );
    }
  });

  if (target.audio_clip_id) {
    await enqueueSyncEvent("audio_clips", target.audio_clip_id, "delete", {
      id: target.audio_clip_id,
      tile_id: tileId,
    });
  }

  await enqueueSyncEvent("tiles", tileId, "delete", {
    id: tileId,
    board_id: target.board_id,
  });

  for (const tile of tilesToShift) {
    await enqueueSyncEvent("tiles", tile.id, "upsert", {
      id: tile.id,
      position: tile.position - 1,
      updated_at: updatedAt,
    });
  }
};
