import { create } from 'zustand';

import {
  duplicateActiveBoard,
  ensureDefaultBoard,
  getActiveBoardSnapshot,
  resetActiveBoardToDefaults,
} from '../shared/storage/repositories/boardRepository';
import {
  deleteAudioClipForTile,
  saveAudioClipForTile,
} from '../shared/storage/repositories/audioClipRepository';
import {
  createTileAfter as createTileAfterInRepository,
  deleteTileById,
  updateTile,
  updateTilePosition,
  type TileUpdateInput,
} from '../shared/storage/repositories/tileRepository';
import {
  ensureDefaultSettings,
  getProfileSettings,
  updateProfileSettings,
} from '../shared/storage/repositories/settingsRepository';
import { countPendingSyncEvents } from '../shared/storage/repositories/syncRepository';
import { logError } from '../shared/telemetry/logger';
import type { AuthStatus, RemoteContext } from '../features/auth/types';
import type {
  AudioClip,
  Board,
  Category,
  ProfileSettings,
  SentenceToken,
  SpeechMode,
  SyncStatus,
  Tile,
} from '../shared/types/domain';
import { createId } from '../shared/utils/id';

export type ScreenName = 'board' | 'caregiverGate' | 'editor' | 'settings';

type ClipMap = Record<string, AudioClip>;

const toClipMap = (clips: AudioClip[]): ClipMap => {
  return clips.reduce<ClipMap>((map, clip) => {
    map[clip.id] = clip;
    return map;
  }, {});
};

type AppStore = {
  currentScreen: ScreenName;
  authStatus: AuthStatus;
  authUserId: string | null;
  authEmail: string | null;
  isAuthLoading: boolean;
  requiresBootstrap: boolean;
  remoteContext: RemoteContext | null;
  board: Board | null;
  tiles: Tile[];
  clipsById: ClipMap;
  sentence: SentenceToken[];
  isBoardLoading: boolean;
  settings: ProfileSettings | null;
  isSettingsLoading: boolean;
  caregiverUnlocked: boolean;
  failedPinAttempts: number;
  lockoutUntil: number | null;
  syncStatus: SyncStatus;
  pendingSyncEvents: number;
  isSpeaking: boolean;
  editorTargetTileId: string | null;

  navigate: (screen: ScreenName) => void;
  setAuthState: (params: {
    status: AuthStatus;
    userId: string | null;
    email: string | null;
  }) => void;
  setAuthLoading: (value: boolean) => void;
  setRequiresBootstrap: (value: boolean) => void;
  setRemoteContext: (context: RemoteContext | null) => void;
  initializeApp: () => Promise<void>;
  refreshBoard: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  addTileToSentence: (tileId: string) => void;
  removeSentenceToken: (tokenId: string) => void;
  clearSentence: () => void;
  setSpeaking: (value: boolean) => void;

  updateTileDraft: (tileId: string, update: TileUpdateInput) => Promise<void>;
  moveTile: (tileId: string, nextPosition: number) => Promise<void>;
  createTileAfter: (
    tileId: string,
    input?: {
      labelCs?: string;
      emoji?: string;
      category?: Category;
      speechMode?: SpeechMode;
    }
  ) => Promise<string>;
  deleteTile: (tileId: string) => Promise<void>;
  saveClip: (
    tileId: string,
    clipData: { localUri: string; durationMs: number; checksum?: string; format: string }
  ) => Promise<void>;
  deleteClip: (tileId: string) => Promise<void>;
  resetBoard: () => Promise<void>;
  duplicateBoard: () => Promise<void>;

  updateSettings: (update: {
    lockEnabled?: boolean;
    ttsRate?: number;
    ttsPitch?: number;
    preferredVoice?: string | null;
    highContrast?: boolean;
    showLabels?: boolean;
    pinHash?: string;
  }) => Promise<void>;

  unlockCaregiver: () => void;
  lockCaregiver: () => void;
  registerPinFailure: () => void;
  clearPinFailures: () => void;
  setEditorTargetTileId: (tileId: string | null) => void;

  setSyncStatus: (status: SyncStatus) => void;
  refreshPendingSyncEvents: () => Promise<void>;
};

export const useAppStore = create<AppStore>((set, get) => ({
  currentScreen: 'board',
  authStatus: 'loading',
  authUserId: null,
  authEmail: null,
  isAuthLoading: true,
  requiresBootstrap: false,
  remoteContext: null,
  board: null,
  tiles: [],
  clipsById: {},
  sentence: [],
  isBoardLoading: true,
  settings: null,
  isSettingsLoading: true,
  caregiverUnlocked: false,
  failedPinAttempts: 0,
  lockoutUntil: null,
  syncStatus: 'idle',
  pendingSyncEvents: 0,
  isSpeaking: false,
  editorTargetTileId: null,

  navigate: (screen) => {
    set({ currentScreen: screen });
  },

  setAuthState: ({ status, userId, email }) => {
    set({
      authStatus: status,
      authUserId: userId,
      authEmail: email,
    });
  },

  setAuthLoading: (value) => {
    set({ isAuthLoading: value });
  },

  setRequiresBootstrap: (value) => {
    set({ requiresBootstrap: value });
  },

  setRemoteContext: (context) => {
    set({ remoteContext: context });
  },

  initializeApp: async () => {
    set({ isBoardLoading: true, isSettingsLoading: true });

    try {
      await ensureDefaultSettings();
      await ensureDefaultBoard();

      const [snapshot, settings, pendingSyncEvents] = await Promise.all([
        getActiveBoardSnapshot(),
        getProfileSettings(),
        countPendingSyncEvents(),
      ]);

      if (!snapshot) {
        throw new Error('Board snapshot missing');
      }

      set({
        board: snapshot.board,
        tiles: snapshot.tiles,
        clipsById: toClipMap(snapshot.audioClips),
        settings,
        pendingSyncEvents,
      });
    } catch (error) {
      logError('initialize_app_failed', error);
    } finally {
      set({ isBoardLoading: false, isSettingsLoading: false });
    }
  },

  refreshBoard: async () => {
    const snapshot = await getActiveBoardSnapshot();
    if (!snapshot) {
      return;
    }

    set({
      board: snapshot.board,
      tiles: snapshot.tiles,
      clipsById: toClipMap(snapshot.audioClips),
    });
  },

  refreshSettings: async () => {
    const settings = await getProfileSettings();
    set({ settings });
  },

  addTileToSentence: (tileId) => {
    const tile = get().tiles.find((candidate) => candidate.id === tileId);
    if (!tile) {
      return;
    }

    const token: SentenceToken = {
      tokenId: createId('token'),
      tileId: tile.id,
      label: tile.labelCs,
      emoji: tile.emoji,
    };

    set((state) => ({
      sentence: [...state.sentence, token],
    }));
  },

  removeSentenceToken: (tokenId) => {
    set((state) => ({
      sentence: state.sentence.filter((token) => token.tokenId !== tokenId),
    }));
  },

  clearSentence: () => {
    set({ sentence: [] });
  },

  setSpeaking: (value) => {
    set({ isSpeaking: value });
  },

  updateTileDraft: async (tileId, update) => {
    await updateTile(tileId, update);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  moveTile: async (tileId, nextPosition) => {
    await updateTilePosition(tileId, nextPosition);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  createTileAfter: async (tileId, input) => {
    const newTileId = await createTileAfterInRepository(tileId, input);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
    return newTileId;
  },

  deleteTile: async (tileId) => {
    await deleteTileById(tileId);
    await get().refreshBoard();
    set((state) => ({
      sentence: state.sentence.filter((token) => token.tileId !== tileId),
    }));
    await get().refreshPendingSyncEvents();
  },

  saveClip: async (tileId, clipData) => {
    await saveAudioClipForTile(tileId, clipData);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  deleteClip: async (tileId) => {
    await deleteAudioClipForTile(tileId);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  resetBoard: async () => {
    await resetActiveBoardToDefaults();
    await get().refreshBoard();
    set({ sentence: [] });
    await get().refreshPendingSyncEvents();
  },

  duplicateBoard: async () => {
    await duplicateActiveBoard();
    await get().refreshBoard();
    set({ sentence: [] });
    await get().refreshPendingSyncEvents();
  },

  updateSettings: async (update) => {
    await updateProfileSettings(update);
    await get().refreshSettings();
    await get().refreshPendingSyncEvents();
  },

  unlockCaregiver: () => {
    set({ caregiverUnlocked: true, failedPinAttempts: 0, lockoutUntil: null });
  },

  lockCaregiver: () => {
    set({ caregiverUnlocked: false, editorTargetTileId: null });
  },

  registerPinFailure: () => {
    const failedPinAttempts = get().failedPinAttempts + 1;
    if (failedPinAttempts >= 3) {
      set({
        failedPinAttempts: 0,
        lockoutUntil: Date.now() + 30_000,
      });
      return;
    }

    set({ failedPinAttempts });
  },

  clearPinFailures: () => {
    set({ failedPinAttempts: 0, lockoutUntil: null });
  },

  setEditorTargetTileId: (tileId) => {
    set({ editorTargetTileId: tileId });
  },

  setSyncStatus: (status) => {
    set({ syncStatus: status });
  },

  refreshPendingSyncEvents: async () => {
    const pendingSyncEvents = await countPendingSyncEvents();
    set({ pendingSyncEvents });
  },
}));

export const selectTilesById = (tiles: Tile[]): Record<string, Tile> => {
  return tiles.reduce<Record<string, Tile>>((result, tile) => {
    result[tile.id] = tile;
    return result;
  }, {});
};
