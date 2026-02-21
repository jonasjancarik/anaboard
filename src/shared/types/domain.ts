export type Category = 'needs' | 'feelings' | 'social' | 'food';

export type SpeechMode =
  | 'tts'
  | 'recording_with_tts_fallback'
  | 'recording_only';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'disabled'
  | 'error';

export type EntityType =
  | 'boards'
  | 'tiles'
  | 'audio_clips'
  | 'profile_settings';

export interface Board {
  id: string;
  profileId: string;
  name: string;
  locale: string;
  columns: number;
  rows: number;
  isActive: boolean;
  updatedAt: string;
  revision: number;
}

export interface Tile {
  id: string;
  boardId: string;
  position: number;
  labelCs: string;
  emoji: string;
  category: Category;
  speechMode: SpeechMode;
  audioClipId?: string;
  updatedAt: string;
  revision: number;
}

export interface AudioClip {
  id: string;
  tileId: string;
  localUri?: string;
  remotePath?: string;
  durationMs: number;
  checksum?: string;
  format: string;
  updatedAt: string;
}

export interface ProfileSettings {
  profileId: string;
  pinHash: string;
  lockEnabled: boolean;
  ttsRate: number;
  ttsPitch: number;
  preferredVoice?: string;
  highContrast: boolean;
  showLabels: boolean;
  updatedAt: string;
  revision: number;
}

export interface SpeechSegment {
  tokenId: string;
  kind: 'clip' | 'tts';
  text?: string;
  clipUri?: string;
  mode: SpeechMode;
  estimatedMs: number;
  tileId: string;
  fallback: boolean;
}

export interface SentenceToken {
  tokenId: string;
  tileId: string;
  label: string;
  emoji: string;
}

export interface SyncEvent {
  id: number;
  entityType: EntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  payload: string;
  createdAt: string;
  syncedAt?: string;
  status: 'pending' | 'synced' | 'error';
}

export interface BoardSnapshot {
  board: Board;
  tiles: Tile[];
  audioClips: AudioClip[];
}
