import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_SETTINGS,
} from '../../constants/defaults';
import type { ProfileSettings } from '../../types/domain';
import { hashPin } from '../../utils/security';
import { nowIso } from '../../utils/time';
import { getDatabase } from '../db';
import { enqueueSyncEvent } from './syncRepository';

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
  updated_at: string;
  revision: number;
};

const mapRow = (row: SettingsRow): ProfileSettings => ({
  profileId: row.profile_id,
  pinHash: row.pin_hash,
  lockEnabled: row.lock_enabled === 1,
  backupPinEnabled: row.backup_pin_enabled === 1,
  ttsRate: row.tts_rate,
  ttsPitch: row.tts_pitch,
  preferredVoice: row.preferred_voice ?? undefined,
  highContrast: row.high_contrast === 1,
  showLabels: row.show_labels === 1,
  phraseBarEnabled: row.phrase_bar_enabled === 1,
  suggestionCount: row.suggestion_count,
  updatedAt: row.updated_at,
  revision: row.revision,
});

export const ensureDefaultSettings = async (): Promise<void> => {
  return ensureDefaultSettingsForProfile(DEFAULT_PROFILE_ID);
};

export const ensureDefaultSettingsForProfile = async (profileId: string): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM profile_settings WHERE profile_id = ?',
    profileId
  );

  if ((existing?.count ?? 0) > 0) {
    return;
  }

  const pinHash = await hashPin('1234');
  const defaults = DEFAULT_PROFILE_SETTINGS(pinHash, nowIso());

  await db.runAsync(
    `
      INSERT INTO profile_settings (
        profile_id, pin_hash, lock_enabled, backup_pin_enabled, tts_rate, tts_pitch, preferred_voice,
        high_contrast, show_labels, phrase_bar_enabled, suggestion_count, updated_at, revision, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    profileId,
    defaults.pinHash,
    defaults.lockEnabled ? 1 : 0,
    defaults.backupPinEnabled ? 1 : 0,
    defaults.ttsRate,
    defaults.ttsPitch,
    defaults.preferredVoice ?? null,
    defaults.highContrast ? 1 : 0,
    defaults.showLabels ? 1 : 0,
    defaults.phraseBarEnabled ? 1 : 0,
    defaults.suggestionCount,
    defaults.updatedAt,
    defaults.revision
  );

  await enqueueSyncEvent('profile_settings', profileId, 'upsert', {
    profile_id: profileId,
    pin_hash: defaults.pinHash,
    lock_enabled: defaults.lockEnabled ? 1 : 0,
    backup_pin_enabled: defaults.backupPinEnabled ? 1 : 0,
    tts_rate: defaults.ttsRate,
    tts_pitch: defaults.ttsPitch,
    preferred_voice: defaults.preferredVoice ?? null,
    high_contrast: defaults.highContrast ? 1 : 0,
    show_labels: defaults.showLabels ? 1 : 0,
    phrase_bar_enabled: defaults.phraseBarEnabled ? 1 : 0,
    suggestion_count: defaults.suggestionCount,
    updated_at: defaults.updatedAt,
    revision: defaults.revision,
  });
};

export const getProfileSettings = async (profileId = DEFAULT_PROFILE_ID): Promise<ProfileSettings> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SettingsRow>(
    `
      SELECT profile_id, pin_hash, lock_enabled, backup_pin_enabled, tts_rate, tts_pitch, preferred_voice, high_contrast, updated_at, revision
           , show_labels, phrase_bar_enabled, suggestion_count
      FROM profile_settings
      WHERE profile_id = ?
      LIMIT 1
    `,
    profileId
  );

  if (!row) {
    await ensureDefaultSettingsForProfile(profileId);
    return getProfileSettings(profileId);
  }

  return mapRow(row);
};

type SettingsUpdate = {
  lockEnabled?: boolean;
  backupPinEnabled?: boolean;
  ttsRate?: number;
  ttsPitch?: number;
  preferredVoice?: string | null;
  highContrast?: boolean;
  showLabels?: boolean;
  phraseBarEnabled?: boolean;
  suggestionCount?: number;
  pinHash?: string;
};

export const updateProfileSettings = async (
  profileId: string,
  update: SettingsUpdate
): Promise<void> => {
  const current = await getProfileSettings(profileId);
  const db = await getDatabase();
  const updatedAt = nowIso();
  const revision = current.revision + 1;

  const next = {
    lockEnabled: update.lockEnabled ?? current.lockEnabled,
    backupPinEnabled: update.backupPinEnabled ?? current.backupPinEnabled,
    ttsRate: update.ttsRate ?? current.ttsRate,
    ttsPitch: update.ttsPitch ?? current.ttsPitch,
    preferredVoice:
      update.preferredVoice === undefined ? current.preferredVoice ?? null : update.preferredVoice,
    highContrast: update.highContrast ?? current.highContrast,
    showLabels: update.showLabels ?? current.showLabels,
    phraseBarEnabled: update.phraseBarEnabled ?? current.phraseBarEnabled,
    suggestionCount: update.suggestionCount ?? current.suggestionCount,
    pinHash: update.pinHash ?? current.pinHash,
  };

  await db.runAsync(
    `
      UPDATE profile_settings
      SET
        pin_hash = ?,
        lock_enabled = ?,
        backup_pin_enabled = ?,
        tts_rate = ?,
        tts_pitch = ?,
        preferred_voice = ?,
        high_contrast = ?,
        show_labels = ?,
        phrase_bar_enabled = ?,
        suggestion_count = ?,
        updated_at = ?,
        revision = ?,
        dirty = 1
      WHERE profile_id = ?
    `,
    next.pinHash,
    next.lockEnabled ? 1 : 0,
    next.backupPinEnabled ? 1 : 0,
    next.ttsRate,
    next.ttsPitch,
    next.preferredVoice,
    next.highContrast ? 1 : 0,
    next.showLabels ? 1 : 0,
    next.phraseBarEnabled ? 1 : 0,
    next.suggestionCount,
    updatedAt,
    revision,
    current.profileId
  );

  await enqueueSyncEvent('profile_settings', current.profileId, 'upsert', {
    profile_id: current.profileId,
    pin_hash: next.pinHash,
    lock_enabled: next.lockEnabled ? 1 : 0,
    backup_pin_enabled: next.backupPinEnabled ? 1 : 0,
    tts_rate: next.ttsRate,
    tts_pitch: next.ttsPitch,
    preferred_voice: next.preferredVoice,
    high_contrast: next.highContrast ? 1 : 0,
    show_labels: next.showLabels ? 1 : 0,
    phrase_bar_enabled: next.phraseBarEnabled ? 1 : 0,
    suggestion_count: next.suggestionCount,
    updated_at: updatedAt,
    revision,
  });
};
