import type { AuthStatus } from '../../features/auth/types';
import type { SyncIssueCode } from '../../features/sync/types';
import type {
  AudioClip,
  Board,
  ProfileSettings,
  SyncStatus,
  Tile,
} from '../types/domain';
import type { WebPersistenceSmokeSummary } from '../storage/webPersistenceSmoke';
import type { TelemetryRecord } from '../telemetry/privacy';

export type DiagnosticsAuthStatus = 'disabled' | 'signed_out' | 'anonymous' | 'signed_in';

export type DiagnosticsPayload = {
  version: 1;
  generated_at: string;
  app: {
    version: string;
    platform: string;
  };
  auth: {
    status: DiagnosticsAuthStatus;
  };
  sync: {
    status: SyncStatus;
    pending_count: number;
    error_count: number;
    last_successful_sync_at: string | null;
    last_pull_at: string | null;
    last_issue_code: SyncIssueCode | null;
  };
  board: {
    loaded: boolean;
    columns: number | null;
    rows: number | null;
    tile_count: number;
    image_tile_count: number;
    recording_tile_count: number;
    clip_count: number;
  };
  speech: {
    tts_rate: number | null;
    tts_pitch: number | null;
    preferred_voice_configured: boolean;
  };
  web_persistence?: WebPersistenceSmokeSummary;
  telemetry: Array<Omit<TelemetryRecord, 'id'>>;
};

export type DiagnosticsBuildInput = {
  generatedAt: string;
  appVersion: string;
  platform: string;
  authStatus: AuthStatus;
  authIsAnonymous: boolean;
  syncStatus: SyncStatus;
  pendingSyncEvents: number;
  syncErrorEvents: number;
  lastSuccessfulSyncAt: string | null;
  lastSyncPullAt: string | null;
  syncLastIssue: SyncIssueCode | null;
  board: Board | null;
  tiles: Tile[];
  clipsById: Record<string, AudioClip>;
  settings: ProfileSettings | null;
  webPersistenceSummary?: WebPersistenceSmokeSummary | null;
  telemetryRecords: TelemetryRecord[];
};

const toDiagnosticsAuthStatus = (
  authStatus: AuthStatus,
  authIsAnonymous: boolean
): DiagnosticsAuthStatus => {
  if (authStatus === 'disabled') {
    return 'disabled';
  }

  if (authStatus === 'signed_in') {
    return authIsAnonymous ? 'anonymous' : 'signed_in';
  }

  return 'signed_out';
};

const stripTelemetryRecordId = (record: TelemetryRecord): Omit<TelemetryRecord, 'id'> => ({
  kind: record.kind,
  name: record.name,
  timestamp: record.timestamp,
  payload: record.payload,
  error: record.error,
});

export const buildDiagnosticsPayload = ({
  generatedAt,
  appVersion,
  platform,
  authStatus,
  authIsAnonymous,
  syncStatus,
  pendingSyncEvents,
  syncErrorEvents,
  lastSuccessfulSyncAt,
  lastSyncPullAt,
  syncLastIssue,
  board,
  tiles,
  clipsById,
  settings,
  webPersistenceSummary,
  telemetryRecords,
}: DiagnosticsBuildInput): DiagnosticsPayload => {
  const payload: DiagnosticsPayload = {
    version: 1,
    generated_at: generatedAt,
    app: {
      version: appVersion,
      platform,
    },
    auth: {
      status: toDiagnosticsAuthStatus(authStatus, authIsAnonymous),
    },
    sync: {
      status: syncStatus,
      pending_count: pendingSyncEvents,
      error_count: syncErrorEvents,
      last_successful_sync_at: lastSuccessfulSyncAt,
      last_pull_at: lastSyncPullAt,
      last_issue_code: syncLastIssue,
    },
    board: {
      loaded: board !== null,
      columns: board?.columns ?? null,
      rows: board?.rows ?? null,
      tile_count: tiles.length,
      image_tile_count: tiles.filter((tile) => tile.visualType === 'image').length,
      recording_tile_count: tiles.filter((tile) => tile.speechMode === 'recording_only').length,
      clip_count: Object.keys(clipsById).length,
    },
    speech: {
      tts_rate: settings?.ttsRate ?? null,
      tts_pitch: settings?.ttsPitch ?? null,
      preferred_voice_configured: Boolean(settings?.preferredVoice),
    },
    telemetry: telemetryRecords.map(stripTelemetryRecordId),
  };

  if (webPersistenceSummary) {
    payload.web_persistence = webPersistenceSummary;
  }

  return payload;
};

export const serializeDiagnosticsPayload = (payload: DiagnosticsPayload): string => {
  return JSON.stringify(payload, null, 2);
};
