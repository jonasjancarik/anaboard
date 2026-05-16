import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_SETTINGS,
  DEFAULT_TILES,
} from '../../shared/constants/defaults';
import { SUPPORTED_CHILD_GENDERS, SUPPORTED_LANGUAGES } from '../../shared/i18n/profileLanguage';
import { getDatabase } from '../../shared/storage/db';
import { hashPin } from '../../shared/utils/security';
import type { SyncIssueCode } from './types';

type CountRow = {
  count: number;
};

type BoardRow = {
  id: string;
  profile_id: string;
  name: string;
  locale: string;
  columns_count: number;
  rows_count: number;
  is_active: number;
};

type TileRow = {
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
};

type SettingsRow = {
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
};

const countRows = async (tableName: string): Promise<number> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<CountRow>(`SELECT COUNT(*) AS count FROM ${tableName}`);
  return result?.count ?? 0;
};

const SUPPORTED_DEFAULT_BOARD_NAMES = new Set([
  DEFAULT_BOARD_NAME,
  ...SUPPORTED_LANGUAGES.map((language) => language.defaultBoardName),
]);
const SUPPORTED_DEFAULT_BOARD_LOCALES = new Set<string>(
  SUPPORTED_LANGUAGES.map((language) => language.locale),
);

const matchesDefaultBoard = async (): Promise<boolean> => {
  const db = await getDatabase();
  const board = await db.getFirstAsync<BoardRow>(
    `
      SELECT id, profile_id, name, locale, columns_count, rows_count, is_active
      FROM boards
      WHERE is_active = 1
      LIMIT 1
    `
  );

  if (!board) {
    return true;
  }

  if (
    board.id !== DEFAULT_BOARD_ID ||
    board.profile_id !== DEFAULT_PROFILE_ID ||
    !SUPPORTED_DEFAULT_BOARD_NAMES.has(board.name) ||
    !SUPPORTED_DEFAULT_BOARD_LOCALES.has(board.locale) ||
    board.columns_count !== 4 ||
    board.rows_count !== 4 ||
    board.is_active !== 1
  ) {
    return false;
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
        audio_clip_id
      FROM tiles
      WHERE board_id = ?
      ORDER BY position ASC
    `,
    DEFAULT_BOARD_ID
  );

  return SUPPORTED_CHILD_GENDERS.some((childGender) => {
    const defaultTiles = DEFAULT_TILES('default', {
      locale: board.locale,
      childGender,
    });
    if (tiles.length !== defaultTiles.length) {
      return false;
    }

    return tiles.every((tile, index) => {
      const expected = defaultTiles[index];
      return (
        tile.id === expected.id &&
        tile.board_id === expected.boardId &&
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
};

const matchesDefaultSettings = async (): Promise<boolean> => {
  const db = await getDatabase();
  const settings = await db.getFirstAsync<SettingsRow>(
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
        child_gender
      FROM profile_settings
      WHERE profile_id = ?
      LIMIT 1
    `,
    DEFAULT_PROFILE_ID
  );

  if (!settings) {
    return true;
  }

  const defaultPinHash = await hashPin('1234');
  const expected = DEFAULT_PROFILE_SETTINGS(defaultPinHash, 'default');

  return (
    settings.profile_id === expected.profileId &&
    settings.pin_hash === expected.pinHash &&
    settings.lock_enabled === (expected.lockEnabled ? 1 : 0) &&
    settings.backup_pin_enabled === (expected.backupPinEnabled ? 1 : 0) &&
    settings.tts_rate === expected.ttsRate &&
    settings.tts_pitch === expected.ttsPitch &&
    (settings.preferred_voice ?? null) === (expected.preferredVoice ?? null) &&
    settings.high_contrast === (expected.highContrast ? 1 : 0) &&
    settings.show_labels === (expected.showLabels ? 1 : 0) &&
    settings.phrase_bar_enabled === (expected.phraseBarEnabled ? 1 : 0) &&
    settings.suggestion_count === expected.suggestionCount &&
    settings.board_layout_mode === expected.boardLayoutMode &&
    settings.category_order === JSON.stringify(expected.categoryOrder) &&
    settings.categories_start_new_page === (expected.categoriesStartNewPage ? 1 : 0) &&
    (settings.child_gender === 'masculine' || settings.child_gender === 'feminine')
  );
};

export const canSafelyDiscardLocalStateForInitialBind = async (): Promise<boolean> => {
  const [
    boardCount,
    clipCount,
    tilesHistoryCount,
    archiveCount,
    phraseEventCount,
    savedPhraseCount,
    defaultBoardMatches,
    defaultSettingsMatch,
  ] = await Promise.all([
    countRows('boards'),
    countRows('audio_clips'),
    countRows('tiles_history'),
    countRows('tile_archive'),
    countRows('phrase_events'),
    countRows('saved_phrases'),
    matchesDefaultBoard(),
    matchesDefaultSettings(),
  ]);

  return (
    boardCount <= 1 &&
    clipCount === 0 &&
    tilesHistoryCount === 0 &&
    archiveCount === 0 &&
    phraseEventCount === 0 &&
    savedPhraseCount === 0 &&
    defaultBoardMatches &&
    defaultSettingsMatch
  );
};

export class SyncIssueError extends Error {
  public readonly issueCode: SyncIssueCode;

  public constructor(issueCode: SyncIssueCode, message: string) {
    super(message);
    this.name = 'SyncIssueError';
    this.issueCode = issueCode;
  }
}
