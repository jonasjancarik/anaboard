import { create } from 'zustand';

import {
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
import {
  deleteSavedPhrase as deleteSavedPhraseInRepository,
  getRecentPhraseEvents,
  getSuggestionPhraseEvents,
  getSavedPhrases,
  noteSavedPhrasePlayed,
  recordPhraseEvent,
  savePhrase,
  toPhraseTokenSnapshot,
} from '../shared/storage/repositories/phraseRepository';
import { getSyncOverview } from '../features/sync/syncStateRepository';
import { logError } from '../shared/telemetry/logger';
import type { AuthStatus, RemoteContext } from '../features/auth/types';
import type { SyncIssueCode } from '../features/sync/types';
import type {
  AudioClip,
  Board,
  PhraseEventRecord,
  PhraseSource,
  PhraseTokenSnapshot,
  ProfileSettings,
  SavedPhrase,
  SentenceToken,
  SyncStatus,
  Tile,
} from '../shared/types/domain';
import { DEFAULT_PROFILE_ID } from '../shared/constants/defaults';
import { createId } from '../shared/utils/id';

export type ScreenName =
  | 'board'
  | 'caregiverGate'
  | 'editor'
  | 'settings'
  | 'pinSettings'
  | 'tileArchive'
  | 'auth';
export type PendingCaregiverAction = 'savePhrase' | null;

type ClipMap = Record<string, AudioClip>;

const toClipMap = (clips: AudioClip[]): ClipMap => {
  return clips.reduce<ClipMap>((map, clip) => {
    map[clip.id] = clip;
    return map;
  }, {});
};

const toSentenceToken = (token: PhraseTokenSnapshot): SentenceToken => ({
  tokenId: createId('token'),
  tileId: token.tileId,
  label: token.label,
  emoji: token.emoji,
  visualType: token.visualType,
  imageLocalUri: token.imageLocalUri,
  imageRemotePath: token.imageRemotePath,
});

const toSentenceTokens = (tokens: PhraseTokenSnapshot[]): SentenceToken[] => {
  return tokens.map(toSentenceToken);
};

const getActiveProfileId = (state: Pick<AppStore, 'board' | 'settings'>): string => {
  return state.board?.profileId ?? state.settings?.profileId ?? DEFAULT_PROFILE_ID;
};

type AppStore = {
  currentScreen: ScreenName;
  authStatus: AuthStatus;
  authIsAnonymous: boolean;
  authUserId: string | null;
  authEmail: string | null;
  authReturnScreen: ScreenName | null;
  isAuthLoading: boolean;
  requiresBootstrap: boolean;
  remoteContext: RemoteContext | null;
  board: Board | null;
  tiles: Tile[];
  clipsById: ClipMap;
  sentence: SentenceToken[];
  savedPhrases: SavedPhrase[];
  recentPhrases: PhraseEventRecord[];
  suggestionPhrases: PhraseEventRecord[];
  isBoardLoading: boolean;
  settings: ProfileSettings | null;
  isSettingsLoading: boolean;
  caregiverUnlocked: boolean;
  failedPinAttempts: number;
  lockoutUntil: number | null;
  syncStatus: SyncStatus;
  pendingSyncEvents: number;
  syncErrorEvents: number;
  lastSuccessfulSyncAt: string | null;
  lastSyncPullAt: string | null;
  syncBoundProfileId: string | null;
  syncLastIssue: SyncIssueCode | null;
  isSpeaking: boolean;
  editorTargetTileId: string | null;
  boardPageIndex: number;
  pendingCaregiverAction: PendingCaregiverAction;

  navigate: (screen: ScreenName) => void;
  setAuthState: (params: {
    status: AuthStatus;
    isAnonymous: boolean;
    userId: string | null;
    email: string | null;
  }) => void;
  setAuthLoading: (value: boolean) => void;
  setAuthReturnScreen: (screen: ScreenName | null) => void;
  setRequiresBootstrap: (value: boolean) => void;
  setRemoteContext: (context: RemoteContext | null) => void;
  initializeApp: () => Promise<void>;
  refreshBoard: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshPhrases: () => Promise<void>;
  addTileToSentence: (tileId: string) => void;
  appendPhraseTokens: (tokens: PhraseTokenSnapshot[]) => void;
  replaceSentenceWithTokens: (tokens: PhraseTokenSnapshot[]) => void;
  removeSentenceToken: (tokenId: string) => void;
  clearSentence: () => void;
  setSpeaking: (value: boolean) => void;
  saveCurrentSentenceAsPhrase: () => Promise<void>;
  deleteSavedPhrase: (phraseId: string) => Promise<void>;
  recordPhraseComposition: (tokens: PhraseTokenSnapshot[]) => Promise<void>;
  recordPhrasePlayback: (params: {
    tokens: PhraseTokenSnapshot[];
    source: PhraseSource;
    savedPhraseId?: string;
  }) => Promise<void>;

  updateTileDraft: (tileId: string, update: TileUpdateInput) => Promise<void>;
  createTileAfter: (tileId: string) => Promise<string>;
  moveTile: (tileId: string, nextPosition: number) => Promise<void>;
  deleteTile: (tileId: string) => Promise<void>;
  resetBoardToDefaults: () => Promise<void>;
  saveClip: (
    tileId: string,
    clipData: { localUri: string; durationMs: number; checksum?: string; format: string }
  ) => Promise<void>;
  deleteClip: (tileId: string) => Promise<void>;

  updateSettings: (update: {
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
  }) => Promise<void>;

  unlockCaregiver: () => void;
  lockCaregiver: () => void;
  registerPinFailure: () => void;
  clearPinFailures: () => void;
  setEditorTargetTileId: (tileId: string | null) => void;
  setBoardPageIndex: (pageIndex: number) => void;
  setPendingCaregiverAction: (action: PendingCaregiverAction) => void;
  clearPendingCaregiverAction: () => void;

  setSyncStatus: (status: SyncStatus) => void;
  refreshPendingSyncEvents: () => Promise<void>;
};

export const useAppStore = create<AppStore>((set, get) => ({
  currentScreen: 'board',
  authStatus: 'loading',
  authIsAnonymous: false,
  authUserId: null,
  authEmail: null,
  authReturnScreen: null,
  isAuthLoading: true,
  requiresBootstrap: false,
  remoteContext: null,
  board: null,
  tiles: [],
  clipsById: {},
  sentence: [],
  savedPhrases: [],
  recentPhrases: [],
  suggestionPhrases: [],
  isBoardLoading: true,
  settings: null,
  isSettingsLoading: true,
  caregiverUnlocked: false,
  failedPinAttempts: 0,
  lockoutUntil: null,
  syncStatus: 'idle',
  pendingSyncEvents: 0,
  syncErrorEvents: 0,
  lastSuccessfulSyncAt: null,
  lastSyncPullAt: null,
  syncBoundProfileId: null,
  syncLastIssue: null,
  isSpeaking: false,
  editorTargetTileId: null,
  boardPageIndex: 0,
  pendingCaregiverAction: null,

  navigate: (screen) => {
    set({ currentScreen: screen });
  },

  setAuthState: ({ status, isAnonymous, userId, email }) => {
    set({
      authStatus: status,
      authIsAnonymous: isAnonymous,
      authUserId: userId,
      authEmail: email,
    });
  },

  setAuthLoading: (value) => {
    set({ isAuthLoading: value });
  },

  setAuthReturnScreen: (screen) => {
    set({ authReturnScreen: screen });
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

      const snapshot = await getActiveBoardSnapshot();

      if (!snapshot) {
        throw new Error('Board snapshot missing');
      }

      const [settings, syncOverview, savedPhrases, recentPhrases, suggestionPhrases] = await Promise.all([
        getProfileSettings(snapshot.board.profileId),
        getSyncOverview(),
        getSavedPhrases(snapshot.board.profileId),
        getRecentPhraseEvents(snapshot.board.profileId),
        getSuggestionPhraseEvents(snapshot.board.profileId),
      ]);

      set({
        board: snapshot.board,
        tiles: snapshot.tiles,
        clipsById: toClipMap(snapshot.audioClips),
        settings,
        savedPhrases,
        recentPhrases,
        suggestionPhrases,
        pendingSyncEvents: syncOverview.pendingCount,
        syncErrorEvents: syncOverview.errorCount,
        lastSuccessfulSyncAt: syncOverview.lastSuccessfulSyncAt,
        lastSyncPullAt: syncOverview.lastPullAt,
        syncBoundProfileId: syncOverview.boundProfileId,
        syncLastIssue: syncOverview.lastIssue,
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
    const settings = await getProfileSettings(getActiveProfileId(get()));
    set({ settings });
  },

  refreshPhrases: async () => {
    const profileId = getActiveProfileId(get());
    const [savedPhrases, recentPhrases, suggestionPhrases] = await Promise.all([
      getSavedPhrases(profileId),
      getRecentPhraseEvents(profileId),
      getSuggestionPhraseEvents(profileId),
    ]);

    set({
      savedPhrases,
      recentPhrases,
      suggestionPhrases,
    });
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
      visualType: tile.visualType,
      imageLocalUri: tile.imageLocalUri,
      imageRemotePath: tile.imageRemotePath,
    };

    set((state) => ({
      sentence: [...state.sentence, token],
    }));
  },

  appendPhraseTokens: (tokens) => {
    const nextTokens = tokens.map(toPhraseTokenSnapshot).filter((token) => token.label.length > 0);
    if (nextTokens.length === 0) {
      return;
    }

    set((state) => ({
      sentence: [...state.sentence, ...toSentenceTokens(nextTokens)],
    }));
  },

  replaceSentenceWithTokens: (tokens) => {
    const nextTokens = tokens.map(toPhraseTokenSnapshot).filter((token) => token.label.length > 0);
    set({
      sentence: toSentenceTokens(nextTokens),
    });
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

  saveCurrentSentenceAsPhrase: async () => {
    const profileId = getActiveProfileId(get());
    const tokens = get().sentence.map(toPhraseTokenSnapshot);
    if (tokens.length === 0) {
      return;
    }

    await savePhrase(profileId, tokens);
    await get().refreshPhrases();
  },

  deleteSavedPhrase: async (phraseId) => {
    await deleteSavedPhraseInRepository(phraseId);
    await get().refreshPhrases();
  },

  recordPhraseComposition: async (tokens) => {
    if (tokens.length < 2) {
      return;
    }

    const profileId = getActiveProfileId(get());
    await recordPhraseEvent({
      profileId,
      tokens,
      source: 'composed',
    });
    await get().refreshPhrases();
  },

  recordPhrasePlayback: async ({ tokens, source, savedPhraseId }) => {
    const profileId = getActiveProfileId(get());
    await recordPhraseEvent({
      profileId,
      tokens,
      source,
    });

    if (savedPhraseId) {
      await noteSavedPhrasePlayed(savedPhraseId);
    }

    await get().refreshPhrases();
  },

  updateTileDraft: async (tileId, update) => {
    await updateTile(tileId, update);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  createTileAfter: async (tileId) => {
    const newTileId = await createTileAfterInRepository(tileId);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
    return newTileId;
  },

  moveTile: async (tileId, nextPosition) => {
    await updateTilePosition(tileId, nextPosition);
    await get().refreshBoard();
    await get().refreshPendingSyncEvents();
  },

  deleteTile: async (tileId) => {
    await deleteTileById(tileId);
    await get().refreshBoard();
    set((state) => ({
      sentence: state.sentence.filter((token) => token.tileId !== tileId),
    }));
    await get().refreshPendingSyncEvents();
  },

  resetBoardToDefaults: async () => {
    await resetActiveBoardToDefaults();
    await get().refreshBoard();
    set({ sentence: [], editorTargetTileId: null, boardPageIndex: 0 });
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

  updateSettings: async (update) => {
    await updateProfileSettings(getActiveProfileId(get()), update);
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

  setBoardPageIndex: (pageIndex) => {
    const nextPageIndex = Math.max(0, pageIndex);
    if (get().boardPageIndex === nextPageIndex) {
      return;
    }

    set({ boardPageIndex: nextPageIndex });
  },

  setPendingCaregiverAction: (action) => {
    set({ pendingCaregiverAction: action });
  },

  clearPendingCaregiverAction: () => {
    set({ pendingCaregiverAction: null });
  },

  setSyncStatus: (status) => {
    set({ syncStatus: status });
  },

  refreshPendingSyncEvents: async () => {
    const overview = await getSyncOverview();
    set({
      pendingSyncEvents: overview.pendingCount,
      syncErrorEvents: overview.errorCount,
      lastSuccessfulSyncAt: overview.lastSuccessfulSyncAt,
      lastSyncPullAt: overview.lastPullAt,
      syncBoundProfileId: overview.boundProfileId,
      syncLastIssue: overview.lastIssue,
    });
  },
}));

export const selectTilesById = (tiles: Tile[]): Record<string, Tile> => {
  return tiles.reduce<Record<string, Tile>>((result, tile) => {
    result[tile.id] = tile;
    return result;
  }, {});
};
