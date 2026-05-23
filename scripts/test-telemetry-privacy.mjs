import assert from 'node:assert/strict';

import {
  TELEMETRY_RING_BUFFER_LIMIT,
  appendCappedTelemetryRecord,
  isSensitiveTelemetryKey,
  sanitizeError,
  sanitizeStringValue,
  sanitizeTelemetryPayload,
} from '../src/shared/telemetry/privacy.ts';
import { buildDiagnosticsPayload } from '../src/shared/diagnostics/buildDiagnosticsPayload.ts';

assert.equal(isSensitiveTelemetryKey('email'), true);
assert.equal(isSensitiveTelemetryKey('caregiverEmail'), true);
assert.equal(isSensitiveTelemetryKey('tile_id'), true);
assert.equal(isSensitiveTelemetryKey('image_remote_path'), true);
assert.equal(isSensitiveTelemetryKey('status_code'), false);

assert.deepEqual(
  sanitizeTelemetryPayload({
    email: 'caregiver@example.com',
    caregiverId: 'abc',
    tile_id: 'tile-1',
    label: 'Mliko',
    text: 'Ahoj',
    phrase_tokens: ['secret'],
    image_remote_path: 'family/profile/tile.png',
    status: 'offline',
    issue_code: 'initial_bind_requires_review',
    pending_count: 2,
    fallback: true,
    unknown_object: { unsafe: true },
  }),
  {
    status: 'offline',
    issue_code: 'initial_bind_requires_review',
    pending_count: 2,
    fallback: true,
  }
);

assert.equal(
  sanitizeStringValue('Fetch failed for https://example.com/a?token=secret by name@example.com'),
  'Fetch failed for [redacted-url] by [redacted-email]'
);

assert.deepEqual(sanitizeError(new Error('Bad URL https://example.com/secret')), {
  name: 'Error',
  message: 'Bad URL [redacted-url]',
});

const records = Array.from({ length: TELEMETRY_RING_BUFFER_LIMIT + 8 }, (_, index) => ({
  id: String(index),
  kind: 'event',
  name: `event_${index}`,
  timestamp: `2026-05-01T00:00:${String(index).padStart(2, '0')}.000Z`,
  payload: {
    index,
  },
}));

const cappedRecords = records.reduce(
  (result, record) => appendCappedTelemetryRecord(result, record),
  []
);

assert.equal(cappedRecords.length, TELEMETRY_RING_BUFFER_LIMIT);
assert.equal(cappedRecords[0].name, 'event_8');

const diagnostics = buildDiagnosticsPayload({
  generatedAt: '2026-05-01T12:00:00.000Z',
  appVersion: '1.0.0',
  platform: 'ios',
  authStatus: 'signed_in',
  authIsAnonymous: false,
  syncStatus: 'idle',
  pendingSyncEvents: 1,
  syncErrorEvents: 0,
  lastSuccessfulSyncAt: null,
  lastSyncPullAt: null,
  syncLastIssue: null,
  board: {
    id: 'board-secret',
    profileId: 'profile-secret',
    name: 'Child board',
    locale: 'cs-CZ',
    columns: 4,
    rows: 3,
    isActive: true,
    updatedAt: '2026-05-01T12:00:00.000Z',
    revision: 1,
  },
  tiles: [
    {
      id: 'tile-secret',
      boardId: 'board-secret',
      position: 0,
      labelCs: 'Mliko',
      emoji: '🥛',
      visualType: 'image',
      imageLocalUri: 'file:///private/secret.png',
      imageRemotePath: 'family/profile/secret.png',
      category: 'food',
      speechMode: 'recording_only',
      audioClipId: 'clip-secret',
      updatedAt: '2026-05-01T12:00:00.000Z',
      revision: 1,
    },
  ],
  clipsById: {
    'clip-secret': {
      id: 'clip-secret',
      tileId: 'tile-secret',
      localUri: 'file:///private/clip.m4a',
      remotePath: 'family/profile/clip.m4a',
      durationMs: 1000,
      format: 'm4a',
      updatedAt: '2026-05-01T12:00:00.000Z',
    },
  },
  settings: {
    profileId: 'profile-secret',
    pinHash: 'secret',
    lockEnabled: true,
    backupPinEnabled: true,
    ttsRate: 0.86,
    ttsPitch: 1,
    preferredVoice: 'voice-secret',
    highContrast: false,
    showLabels: true,
    phraseBarEnabled: true,
    suggestionCount: 3,
    boardLayoutMode: 'manual',
    categoryOrder: ['needs', 'feelings', 'social', 'activities', 'food'],
    categoriesStartNewPage: true,
    childGender: 'masculine',
    updatedAt: '2026-05-01T12:00:00.000Z',
    revision: 1,
  },
  telemetryRecords: cappedRecords,
});

const diagnosticsJson = JSON.stringify(diagnostics);

assert.equal(diagnostics.auth.status, 'signed_in');
assert.equal(diagnostics.board.tile_count, 1);
assert.equal(diagnostics.board.image_tile_count, 1);
assert.equal(diagnostics.board.clip_count, 1);
assert.equal(diagnostics.speech.preferred_voice_configured, true);
assert.equal(diagnosticsJson.includes('Mliko'), false);
assert.equal(diagnosticsJson.includes('caregiver@example.com'), false);
assert.equal(diagnosticsJson.includes('file:///'), false);
assert.equal(diagnosticsJson.includes('family/profile'), false);
assert.equal(diagnosticsJson.includes('board-secret'), false);
assert.equal(diagnosticsJson.includes('profile-secret'), false);
assert.equal(diagnosticsJson.includes('voice-secret'), false);

console.log('telemetry privacy ok');
