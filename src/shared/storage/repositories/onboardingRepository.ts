import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  DEFAULT_PROFILE_ID,
  DEFAULT_TILES,
} from '../../constants/defaults';
import {
  DEFAULT_CHILD_GENDER,
  SUPPORTED_CHILD_GENDERS,
  SUPPORTED_LANGUAGES,
  getSupportedLanguage,
  normalizeChildGender,
  normalizeSupportedLocale,
} from '../../i18n/profileLanguage';
import type { Category, SpeechMode, TileVisualType } from '../../types/domain';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

type BoardSyncRow = {
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

type TileSyncRow = {
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

type SettingsSyncRow = {
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
  board_layout_mode: string;
  category_order: string;
  categories_start_new_page: number;
  child_gender: string;
  updated_at: string;
  revision: number;
};

const activeBoardMatchesDefaultTileSet = (tiles: TileSyncRow[]): boolean => {
  return SUPPORTED_LANGUAGES.some((language) => {
    return SUPPORTED_CHILD_GENDERS.some((childGender) => {
      const defaults = DEFAULT_TILES('default', {
        locale: language.locale,
        childGender,
      });

      if (tiles.length !== defaults.length) {
        return false;
      }

      return tiles.every((tile, index) => {
        const expected = defaults[index];
        return (
          tile.id === expected.id &&
          tile.board_id === DEFAULT_BOARD_ID &&
          tile.position === expected.position &&
          tile.label_cs === expected.labelCs &&
          tile.emoji === expected.emoji &&
          tile.visual_type === expected.visualType &&
          tile.category === expected.category &&
          tile.speech_mode === expected.speechMode &&
          !tile.image_local_uri &&
          !tile.image_remote_path &&
          !tile.audio_clip_id
        );
      });
    });
  });
};

const DEFAULT_BOARD_NAMES = new Set([
  DEFAULT_BOARD_NAME,
  ...SUPPORTED_LANGUAGES.map((language) => language.defaultBoardName),
]);

const toSettingsSyncPayload = (settings: SettingsSyncRow): Record<string, unknown> => ({
  profile_id: settings.profile_id,
  pin_hash: settings.pin_hash,
  lock_enabled: settings.lock_enabled,
  backup_pin_enabled: settings.backup_pin_enabled,
  tts_rate: settings.tts_rate,
  tts_pitch: settings.tts_pitch,
  preferred_voice: settings.preferred_voice ?? null,
  high_contrast: settings.high_contrast,
  show_labels: settings.show_labels,
  phrase_bar_enabled: settings.phrase_bar_enabled,
  suggestion_count: settings.suggestion_count,
  board_layout_mode: settings.board_layout_mode,
  category_order: settings.category_order,
  categories_start_new_page: settings.categories_start_new_page,
  child_gender: settings.child_gender,
  updated_at: settings.updated_at,
  revision: settings.revision,
});

const toBoardSyncPayload = (board: BoardSyncRow): Record<string, unknown> => ({
  id: board.id,
  profile_id: board.profile_id,
  name: board.name,
  locale: board.locale,
  columns_count: board.columns_count,
  rows_count: board.rows_count,
  is_active: board.is_active === 1,
  updated_at: board.updated_at,
  revision: board.revision,
});

const toTileSyncPayload = (tile: TileSyncRow): Record<string, unknown> => ({
  id: tile.id,
  board_id: tile.board_id,
  position: tile.position,
  label_cs: tile.label_cs,
  emoji: tile.emoji,
  visual_type: tile.visual_type,
  image_remote_path: tile.image_remote_path ?? null,
  category: tile.category,
  speech_mode: tile.speech_mode,
  audio_clip_id: tile.audio_clip_id ?? null,
  updated_at: tile.updated_at,
  revision: tile.revision,
});

export const applyOnboardingPreferencesToLocalDefaults = async (input: {
  locale: unknown;
  childGender: unknown;
}): Promise<void> => {
  const locale = normalizeSupportedLocale(input.locale);
  const childGender = normalizeChildGender(input.childGender ?? DEFAULT_CHILD_GENDER);
  const db = await getDatabase();
  const timestamp = nowIso();

  const activeBoard = await db.getFirstAsync<BoardSyncRow>(
    `
      SELECT id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision
      FROM boards
      WHERE is_active = 1
      ORDER BY updated_at DESC
      LIMIT 1
    `
  );

  const profileId = activeBoard?.profile_id ?? DEFAULT_PROFILE_ID;
  const activeTiles = activeBoard
    ? await db.getAllAsync<TileSyncRow>(
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
        activeBoard.id
      )
    : [];
  const shouldRewriteDefaultTiles =
    activeBoard?.id === DEFAULT_BOARD_ID && activeBoardMatchesDefaultTileSet(activeTiles);
  const nextBoardName = getSupportedLanguage(locale).defaultBoardName;
  const shouldRewriteDefaultBoardName =
    Boolean(activeBoard) &&
    activeBoard?.id === DEFAULT_BOARD_ID &&
    DEFAULT_BOARD_NAMES.has(activeBoard.name);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        UPDATE profile_settings
        SET child_gender = ?, updated_at = ?, revision = revision + 1, dirty = 1
        WHERE profile_id = ?
      `,
      childGender,
      timestamp,
      profileId
    );

    if (!activeBoard) {
      return;
    }

    await db.runAsync(
      `
        UPDATE boards
        SET locale = ?, name = ?, updated_at = ?, revision = revision + 1, dirty = 1
        WHERE id = ?
      `,
      locale,
      shouldRewriteDefaultBoardName ? nextBoardName : activeBoard.name,
      timestamp,
      activeBoard.id
    );

    if (!shouldRewriteDefaultTiles) {
      return;
    }

    const nextTiles = DEFAULT_TILES(timestamp, {
      locale,
      childGender,
    });

    for (const tile of nextTiles) {
      await db.runAsync(
        `
          UPDATE tiles
          SET
            position = ?,
            label_cs = ?,
            emoji = ?,
            visual_type = ?,
            image_local_uri = NULL,
            image_remote_path = NULL,
            category = ?,
            speech_mode = ?,
            audio_clip_id = NULL,
            updated_at = ?,
            revision = revision + 1,
            dirty = 1
          WHERE id = ?
        `,
        tile.position,
        tile.labelCs,
        tile.emoji,
        tile.visualType,
        tile.category,
        tile.speechMode,
        timestamp,
        tile.id
      );
    }
  });

  const settings = await db.getFirstAsync<SettingsSyncRow>(
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
        board_layout_mode,
        category_order,
        categories_start_new_page,
        child_gender,
        updated_at,
        revision
      FROM profile_settings
      WHERE profile_id = ?
      LIMIT 1
    `,
    profileId
  );

  if (settings) {
    await enqueueSyncEvent(
      'profile_settings',
      settings.profile_id,
      'upsert',
      toSettingsSyncPayload(settings)
    );
  }

  if (!activeBoard) {
    return;
  }

  const board = await db.getFirstAsync<BoardSyncRow>(
    `
      SELECT id, profile_id, name, locale, columns_count, rows_count, is_active, updated_at, revision
      FROM boards
      WHERE id = ?
      LIMIT 1
    `,
    activeBoard.id
  );

  if (board) {
    await enqueueSyncEvent('boards', board.id, 'upsert', toBoardSyncPayload(board));
  }

  if (!shouldRewriteDefaultTiles) {
    return;
  }

  const tiles = await db.getAllAsync<TileSyncRow>(
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
    activeBoard.id
  );

  for (const tile of tiles) {
    await enqueueSyncEvent('tiles', tile.id, 'upsert', toTileSyncPayload(tile));
  }
};
