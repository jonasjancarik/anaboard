export type SyncOverview = {
  pendingCount: number;
  errorCount: number;
  lastSuccessfulSyncAt: string | null;
  lastPullAt: string | null;
  boundProfileId: string | null;
  lastIssue: SyncIssueCode | null;
};

export type SyncIssueCode =
  | 'initial_bind_requires_review'
  | 'profile_switch_requires_review';

export type RemoteBoardRow = {
  id: string;
  family_id: string;
  profile_id: string;
  name: string;
  locale: string;
  columns_count: number;
  rows_count: number;
  is_active?: boolean | null;
  updated_at: string;
  revision: number;
};

export type RemoteTileRow = {
  id: string;
  board_id: string;
  position: number;
  label_cs: string;
  emoji: string;
  visual_type: 'emoji' | 'image';
  image_remote_path?: string | null;
  category: 'needs' | 'feelings' | 'social' | 'food';
  speech_mode: 'tts' | 'recording_only';
  audio_clip_id?: string | null;
  updated_at: string;
  revision: number;
};

export type RemoteAudioClipRow = {
  id: string;
  tile_id: string;
  remote_path?: string | null;
  duration_ms: number;
  checksum?: string | null;
  format: string;
  updated_at: string;
};

export type RemoteSettingsRow = {
  profile_id: string;
  pin_hash: string;
  lock_enabled: boolean;
  backup_pin_enabled?: boolean | null;
  tts_rate: number;
  tts_pitch: number;
  preferred_voice?: string | null;
  high_contrast: boolean;
  show_labels: boolean;
  phrase_bar_enabled: boolean;
  suggestion_count: number;
  updated_at: string;
  revision: number;
};

export type RemoteSnapshot = {
  boards: RemoteBoardRow[];
  tiles: RemoteTileRow[];
  audioClips: RemoteAudioClipRow[];
  settings: RemoteSettingsRow | null;
};
