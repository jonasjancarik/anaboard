import { createId } from '../../utils/id';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';
import { updateTile } from './tileRepository';

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

export const saveAudioClipForTile = async (
  tileId: string,
  data: {
    localUri: string;
    durationMs: number;
    checksum?: string;
    format: string;
  }
): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<AudioClipRow>(
    `
      SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
      FROM audio_clips
      WHERE tile_id = ?
      LIMIT 1
    `,
    tileId
  );

  const clipId = existing?.id ?? createId('clip');
  const updatedAt = nowIso();

  await db.runAsync(
    `
      INSERT INTO audio_clips (id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at, dirty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        tile_id = excluded.tile_id,
        local_uri = excluded.local_uri,
        remote_path = excluded.remote_path,
        duration_ms = excluded.duration_ms,
        checksum = excluded.checksum,
        format = excluded.format,
        updated_at = excluded.updated_at,
        dirty = 1
    `,
    clipId,
    tileId,
    data.localUri,
    existing?.remote_path ?? null,
    data.durationMs,
    data.checksum ?? null,
    data.format,
    updatedAt
  );

  await updateTile(tileId, { audioClipId: clipId });

  await enqueueSyncEvent('audio_clips', clipId, 'upsert', {
    id: clipId,
    tile_id: tileId,
    local_uri: data.localUri,
    duration_ms: data.durationMs,
    checksum: data.checksum ?? null,
    format: data.format,
    updated_at: updatedAt,
  });
};

export const deleteAudioClipForTile = async (tileId: string): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<AudioClipRow>(
    `
      SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
      FROM audio_clips
      WHERE tile_id = ?
      LIMIT 1
    `,
    tileId
  );

  if (!existing) {
    return;
  }

  await db.runAsync('DELETE FROM audio_clips WHERE id = ?', existing.id);
  await updateTile(tileId, { audioClipId: null });

  await enqueueSyncEvent('audio_clips', existing.id, 'delete', {
    id: existing.id,
    tile_id: tileId,
  });
};
