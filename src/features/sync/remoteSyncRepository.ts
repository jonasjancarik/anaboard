import { mediaAssetExists } from '../../shared/media/mediaStorage';
import { supabaseClient } from '../../shared/services/supabaseClient';
import { getDatabase } from '../../shared/storage/db';
import type { EntityType } from '../../shared/types/domain';
import type { RemoteContext } from '../auth/types';
import {
  downloadAudioClipFromSupabase,
  downloadTileImageFromSupabase,
} from './supabaseMediaSync';
import type {
  RemoteAudioClipRow,
  RemoteBoardRow,
  RemoteSettingsRow,
  RemoteSnapshot,
  RemoteTileRow,
} from './types';

type LocalBoardSyncRow = {
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

type LocalTileSyncRow = {
  id: string;
  board_id: string;
  position: number;
  label_cs: string;
  emoji: string;
  visual_type: 'emoji' | 'image';
  image_local_uri?: string | null;
  image_remote_path?: string | null;
  category: 'needs' | 'feelings' | 'social' | 'food';
  speech_mode: 'tts' | 'recording_only';
  audio_clip_id?: string | null;
  updated_at: string;
  revision: number;
};

type LocalAudioClipSyncRow = {
  id: string;
  tile_id: string;
  local_uri?: string | null;
  remote_path?: string | null;
  duration_ms: number;
  checksum?: string | null;
  format: string;
  updated_at: string;
};

type LocalSettingsSyncRow = {
  profile_id: string;
  pin_hash: string;
  lock_enabled: number;
  backup_pin_enabled: number;
  tts_rate: number;
  tts_pitch: number;
  preferred_voice?: string | null;
  high_contrast: number;
  show_labels: number;
  phrase_bar_enabled: number;
  suggestion_count: number;
  updated_at: string;
  revision: number;
};

const toBoolean = (value?: boolean | null): boolean => Boolean(value);

const fetchRemoteBoards = async (context: RemoteContext): Promise<RemoteBoardRow[]> => {
  if (!supabaseClient) {
    throw new Error('Supabase client missing');
  }

  const withActive = await supabaseClient
    .from('boards')
    .select('id, family_id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision')
    .eq('family_id', context.familyId)
    .eq('profile_id', context.profileId)
    .order('updated_at', { ascending: false });

  if (!withActive.error) {
    return (withActive.data ?? []) as RemoteBoardRow[];
  }

  const fallback = await supabaseClient
    .from('boards')
    .select('id, family_id, profile_id, name, locale, columns_count, rows_count, updated_at, revision')
    .eq('family_id', context.familyId)
    .eq('profile_id', context.profileId)
    .order('updated_at', { ascending: false });

  if (fallback.error) {
    throw withActive.error;
  }

  return ((fallback.data ?? []) as Omit<RemoteBoardRow, 'is_active'>[]).map((board) => ({
    ...board,
    is_active: null,
  }));
};

const fetchRemoteSettings = async (profileId: string): Promise<RemoteSettingsRow | null> => {
  if (!supabaseClient) {
    throw new Error('Supabase client missing');
  }

  const withBackupPin = await supabaseClient
    .from('profile_settings')
    .select('profile_id, pin_hash, lock_enabled, backup_pin_enabled, tts_rate, tts_pitch, preferred_voice, high_contrast, show_labels, phrase_bar_enabled, suggestion_count, updated_at, revision')
    .eq('profile_id', profileId)
    .maybeSingle<RemoteSettingsRow>();

  if (!withBackupPin.error) {
    return withBackupPin.data ?? null;
  }

  const fallback = await supabaseClient
    .from('profile_settings')
    .select('profile_id, pin_hash, lock_enabled, tts_rate, tts_pitch, preferred_voice, high_contrast, show_labels, phrase_bar_enabled, suggestion_count, updated_at, revision')
    .eq('profile_id', profileId)
    .maybeSingle<Omit<RemoteSettingsRow, 'backup_pin_enabled'>>();

  if (fallback.error) {
    throw withBackupPin.error;
  }

  return fallback.data
    ? {
        ...fallback.data,
        backup_pin_enabled: false,
      }
    : null;
};

const normalizeRemoteBoards = (boards: RemoteBoardRow[]): RemoteBoardRow[] => {
  if (boards.length === 0) {
    return boards;
  }

  const explicitActive = boards.some((board) => toBoolean(board.is_active));
  if (explicitActive) {
    return boards.map((board) => ({
      ...board,
      is_active: toBoolean(board.is_active),
    }));
  }

  return boards.map((board, index) => ({
    ...board,
    is_active: index === 0,
  }));
};

export const fetchRemoteSnapshot = async (
  context: RemoteContext
): Promise<RemoteSnapshot> => {
  if (!supabaseClient) {
    throw new Error('Supabase client missing');
  }

  const boards = normalizeRemoteBoards(await fetchRemoteBoards(context));
  const boardIds = boards.map((board) => board.id);

  let tiles: RemoteTileRow[] = [];
  if (boardIds.length > 0) {
    const tileResult = await supabaseClient
      .from('tiles')
      .select('id, board_id, position, label_cs, emoji, visual_type, image_remote_path, category, speech_mode, audio_clip_id, updated_at, revision')
      .in('board_id', boardIds)
      .order('position', { ascending: true });

    if (tileResult.error) {
      throw tileResult.error;
    }

    tiles = (tileResult.data ?? []) as RemoteTileRow[];
  }

  let audioClips: RemoteAudioClipRow[] = [];
  const tileIds = tiles.map((tile) => tile.id);
  if (tileIds.length > 0) {
    const audioResult = await supabaseClient
      .from('audio_clips')
      .select('id, tile_id, remote_path, duration_ms, checksum, format, updated_at')
      .in('tile_id', tileIds);

    if (audioResult.error) {
      throw audioResult.error;
    }

    audioClips = (audioResult.data ?? []) as RemoteAudioClipRow[];
  }

  const settings = await fetchRemoteSettings(context.profileId);

  return {
    boards,
    tiles,
    audioClips,
    settings,
  };
};

export const remoteSnapshotHasData = (snapshot: RemoteSnapshot): boolean => {
  return snapshot.boards.length > 0 || snapshot.settings !== null;
};

export const getLocalEntitySyncPayload = async (
  entityType: EntityType,
  entityId: string
): Promise<Record<string, unknown> | null> => {
  const db = await getDatabase();

  if (entityType === 'boards') {
    const board = await db.getFirstAsync<LocalBoardSyncRow>(
      `
        SELECT id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision
        FROM boards
        WHERE id = ?
        LIMIT 1
      `,
      entityId
    );

    return board
      ? {
          ...board,
          is_active: board.is_active === 1,
        }
      : null;
  }

  if (entityType === 'tiles') {
    const tile = await db.getFirstAsync<LocalTileSyncRow>(
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
      entityId
    );

    return tile ? { ...tile } : null;
  }

  if (entityType === 'audio_clips') {
    const clip = await db.getFirstAsync<LocalAudioClipSyncRow>(
      `
        SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
        FROM audio_clips
        WHERE id = ?
        LIMIT 1
      `,
      entityId
    );

    return clip ? { ...clip } : null;
  }

  const settings = await db.getFirstAsync<LocalSettingsSyncRow>(
    `
      SELECT
        profile_id,
        pin_hash,
        lock_enabled,
        backup_pin_enabled,
        tts_rate,
        tts_pitch,
        preferred_voice,
        high_contrast,
        show_labels,
        phrase_bar_enabled,
        suggestion_count,
        updated_at,
        revision
      FROM profile_settings
      WHERE profile_id = ?
      LIMIT 1
    `,
    entityId
  );

  return settings ? { ...settings } : null;
};

const getLocalTiles = async (): Promise<LocalTileSyncRow[]> => {
  const db = await getDatabase();
  return db.getAllAsync<LocalTileSyncRow>(
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
    `
  );
};

const getLocalAudioClips = async (): Promise<LocalAudioClipSyncRow[]> => {
  const db = await getDatabase();
  return db.getAllAsync<LocalAudioClipSyncRow>(
    `
      SELECT id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at
      FROM audio_clips
    `
  );
};

const resolveTileImageUris = async (
  remoteTiles: RemoteTileRow[],
  localTiles: Map<string, LocalTileSyncRow>
): Promise<Map<string, string | null>> => {
  const imageUris = new Map<string, string | null>();

  for (const tile of remoteTiles) {
    if (tile.visual_type !== 'image') {
      imageUris.set(tile.id, null);
      continue;
    }

    const localTile = localTiles.get(tile.id);
    if (
      tile.image_remote_path &&
      localTile?.image_remote_path === tile.image_remote_path &&
      localTile.image_local_uri &&
      (await mediaAssetExists(localTile.image_local_uri))
    ) {
      imageUris.set(tile.id, localTile.image_local_uri);
      continue;
    }

    if (tile.image_remote_path) {
      imageUris.set(tile.id, await downloadTileImageFromSupabase(tile.id, tile.image_remote_path));
      continue;
    }

    if (localTile?.image_local_uri && (await mediaAssetExists(localTile.image_local_uri))) {
      imageUris.set(tile.id, localTile.image_local_uri);
      continue;
    }

    imageUris.set(tile.id, null);
  }

  return imageUris;
};

const resolveAudioClipUris = async (
  remoteAudioClips: RemoteAudioClipRow[],
  localAudioClips: Map<string, LocalAudioClipSyncRow>
): Promise<Map<string, string | null>> => {
  const audioUris = new Map<string, string | null>();

  for (const clip of remoteAudioClips) {
    const localClip = localAudioClips.get(clip.id);
    if (
      clip.remote_path &&
      localClip?.remote_path === clip.remote_path &&
      localClip.local_uri &&
      (await mediaAssetExists(localClip.local_uri))
    ) {
      audioUris.set(clip.id, localClip.local_uri);
      continue;
    }

    if (clip.remote_path) {
      audioUris.set(clip.id, await downloadAudioClipFromSupabase(clip.id, clip.remote_path));
      continue;
    }

    if (localClip?.local_uri && (await mediaAssetExists(localClip.local_uri))) {
      audioUris.set(clip.id, localClip.local_uri);
      continue;
    }

    audioUris.set(clip.id, null);
  }

  return audioUris;
};

const buildDeleteSql = (tableName: string, columnName: string, ids: string[]): string => {
  const placeholders = ids.map(() => '?').join(',');
  return `DELETE FROM ${tableName} WHERE ${columnName} NOT IN (${placeholders})`;
};

export const applyRemoteSnapshot = async (snapshot: RemoteSnapshot): Promise<boolean> => {
  if (snapshot.boards.length === 0) {
    return false;
  }

  const db = await getDatabase();
  const [localTiles, localAudioClips] = await Promise.all([
    getLocalTiles(),
    getLocalAudioClips(),
  ]);

  const localTileMap = new Map(localTiles.map((tile) => [tile.id, tile]));
  const localAudioClipMap = new Map(localAudioClips.map((clip) => [clip.id, clip]));

  const [tileImageUris, audioClipUris] = await Promise.all([
    resolveTileImageUris(snapshot.tiles, localTileMap),
    resolveAudioClipUris(snapshot.audioClips, localAudioClipMap),
  ]);

  const boardIds = snapshot.boards.map((board) => board.id);
  const tileIds = snapshot.tiles.map((tile) => tile.id);
  const audioClipIds = snapshot.audioClips.map((clip) => clip.id);

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE boards SET is_active = 0');

    for (const board of snapshot.boards) {
      await db.runAsync(
        `
          INSERT INTO boards (
            id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO UPDATE SET
            profile_id = excluded.profile_id,
            name = excluded.name,
            locale = excluded.locale,
            columns_count = excluded.columns_count,
            rows_count = excluded.rows_count,
            is_active = excluded.is_active,
            updated_at = excluded.updated_at,
            revision = excluded.revision,
            dirty = 0
        `,
        board.id,
        board.profile_id,
        board.name,
        board.locale,
        board.columns_count,
        board.rows_count,
        toBoolean(board.is_active) ? 1 : 0,
        board.updated_at,
        board.revision
      );
    }

    for (const tile of snapshot.tiles) {
      await db.runAsync(
        `
          INSERT INTO tiles (
            id, board_id, position, label_cs, emoji, visual_type, image_local_uri, image_remote_path,
            category, speech_mode, audio_clip_id, updated_at, revision, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO UPDATE SET
            board_id = excluded.board_id,
            position = excluded.position,
            label_cs = excluded.label_cs,
            emoji = excluded.emoji,
            visual_type = excluded.visual_type,
            image_local_uri = excluded.image_local_uri,
            image_remote_path = excluded.image_remote_path,
            category = excluded.category,
            speech_mode = excluded.speech_mode,
            audio_clip_id = excluded.audio_clip_id,
            updated_at = excluded.updated_at,
            revision = excluded.revision,
            dirty = 0
        `,
        tile.id,
        tile.board_id,
        tile.position,
        tile.label_cs,
        tile.emoji,
        tile.visual_type,
        tileImageUris.get(tile.id) ?? null,
        tile.image_remote_path ?? null,
        tile.category,
        tile.speech_mode,
        tile.audio_clip_id ?? null,
        tile.updated_at,
        tile.revision
      );
    }

    for (const clip of snapshot.audioClips) {
      await db.runAsync(
        `
          INSERT INTO audio_clips (
            id, tile_id, local_uri, remote_path, duration_ms, checksum, format, updated_at, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(id) DO UPDATE SET
            tile_id = excluded.tile_id,
            local_uri = excluded.local_uri,
            remote_path = excluded.remote_path,
            duration_ms = excluded.duration_ms,
            checksum = excluded.checksum,
            format = excluded.format,
            updated_at = excluded.updated_at,
            dirty = 0
        `,
        clip.id,
        clip.tile_id,
        audioClipUris.get(clip.id) ?? null,
        clip.remote_path ?? null,
        clip.duration_ms,
        clip.checksum ?? null,
        clip.format,
        clip.updated_at
      );
    }

    if (snapshot.settings) {
      await db.runAsync(
        `
          INSERT INTO profile_settings (
            profile_id, pin_hash, lock_enabled, backup_pin_enabled, tts_rate, tts_pitch, preferred_voice,
            high_contrast, show_labels, phrase_bar_enabled, suggestion_count, updated_at, revision, dirty
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(profile_id) DO UPDATE SET
            pin_hash = excluded.pin_hash,
            lock_enabled = excluded.lock_enabled,
            backup_pin_enabled = excluded.backup_pin_enabled,
            tts_rate = excluded.tts_rate,
            tts_pitch = excluded.tts_pitch,
            preferred_voice = excluded.preferred_voice,
            high_contrast = excluded.high_contrast,
            show_labels = excluded.show_labels,
            phrase_bar_enabled = excluded.phrase_bar_enabled,
            suggestion_count = excluded.suggestion_count,
            updated_at = excluded.updated_at,
            revision = excluded.revision,
            dirty = 0
        `,
        snapshot.settings.profile_id,
        snapshot.settings.pin_hash,
        snapshot.settings.lock_enabled ? 1 : 0,
        toBoolean(snapshot.settings.backup_pin_enabled) ? 1 : 0,
        snapshot.settings.tts_rate,
        snapshot.settings.tts_pitch,
        snapshot.settings.preferred_voice ?? null,
        snapshot.settings.high_contrast ? 1 : 0,
        snapshot.settings.show_labels ? 1 : 0,
        snapshot.settings.phrase_bar_enabled ? 1 : 0,
        snapshot.settings.suggestion_count,
        snapshot.settings.updated_at,
        snapshot.settings.revision
      );
    }

    if (audioClipIds.length > 0) {
      await db.runAsync(buildDeleteSql('audio_clips', 'id', audioClipIds), ...audioClipIds);
    } else {
      await db.runAsync('DELETE FROM audio_clips');
    }

    if (tileIds.length > 0) {
      await db.runAsync(buildDeleteSql('tiles', 'id', tileIds), ...tileIds);
    } else {
      await db.runAsync('DELETE FROM tiles');
    }

    if (boardIds.length > 0) {
      await db.runAsync(buildDeleteSql('boards', 'id', boardIds), ...boardIds);
    } else {
      await db.runAsync('DELETE FROM boards');
    }
  });

  return true;
};
