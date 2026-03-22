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
  updatedAt: row.updated_at,
  revision: row.revision,
});

export const ensureDefaultSettings = async (): Promise<void> => {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM profile_settings WHERE profile_id = ?',
    DEFAULT_PROFILE_ID
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
        high_contrast, show_labels, updated_at, revision, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
    defaults.profileId,
    defaults.pinHash,
    defaults.lockEnabled ? 1 : 0,
    defaults.backupPinEnabled ? 1 : 0,
    defaults.ttsRate,
    defaults.ttsPitch,
    defaults.preferredVoice ?? null,
    defaults.highContrast ? 1 : 0,
    defaults.showLabels ? 1 : 0,
    defaults.updatedAt,
    defaults.revision
  );

  await enqueueSyncEvent('profile_settings', defaults.profileId, 'upsert', {
    profile_id: defaults.profileId,
    pin_hash: defaults.pinHash,
    lock_enabled: defaults.lockEnabled ? 1 : 0,
    backup_pin_enabled: defaults.backupPinEnabled ? 1 : 0,
    tts_rate: defaults.ttsRate,
    tts_pitch: defaults.ttsPitch,
    preferred_voice: defaults.preferredVoice ?? null,
    high_contrast: defaults.highContrast ? 1 : 0,
    show_labels: defaults.showLabels ? 1 : 0,
    updated_at: defaults.updatedAt,
    revision: defaults.revision,
  });
};

export const getProfileSettings = async (): Promise<ProfileSettings> => {
  const db = await getDatabase();
  const row = await db.getFirstAsync<SettingsRow>(
    `
      SELECT profile_id, pin_hash, lock_enabled, backup_pin_enabled, tts_rate, tts_pitch, preferred_voice, high_contrast, updated_at, revision
           , show_labels
      FROM profile_settings
      WHERE profile_id = ?
      LIMIT 1
    `,
    DEFAULT_PROFILE_ID
  );

  if (!row) {
    await ensureDefaultSettings();
    return getProfileSettings();
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
  pinHash?: string;
};

export const updateProfileSettings = async (update: SettingsUpdate): Promise<void> => {
  const current = await getProfileSettings();
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
    updated_at: updatedAt,
    revision,
  });
};
