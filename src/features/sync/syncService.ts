import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

import type { RemoteContext } from '../auth/types';
import { logError, logEvent } from '../../shared/telemetry/logger';
import { hasSupabaseConfig, supabaseClient } from '../../shared/services/supabaseClient';
import {
  clearUnsyncedSyncEvents,
  countErroredSyncEvents,
  getPendingSyncEvents,
  markSyncEventsError,
  markSyncEventsSynced,
  retryErroredSyncEvents,
} from '../../shared/storage/repositories/syncRepository';
import type { EntityType, SyncEvent, SyncStatus } from '../../shared/types/domain';
import { normalizeChildGender } from '../../shared/i18n/profileLanguage';
import {
  applyRemoteSnapshot,
  fetchRemoteSnapshot,
  getLocalEntitySyncPayload,
  remoteSnapshotHasData,
} from './remoteSyncRepository';
import {
  getBoundSyncProfileId,
  recordSuccessfulPull,
  recordSuccessfulSync,
  setLastSyncIssue,
  setBoundSyncProfileId,
} from './syncStateRepository';
import {
  uploadAudioClipToSupabase,
  uploadTileImageToSupabase,
} from './supabaseMediaSync';
import { canSafelyDiscardLocalStateForInitialBind, SyncIssueError } from './initialBindGuard';

type SyncCallbacks = {
  onStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
  onDataChanged?: () => void;
};

const SYNC_INTERVAL_MS = 20_000;
const EVENT_PRIORITY: Record<EntityType, number> = {
  boards: 0,
  profile_settings: 1,
  tiles: 2,
  audio_clips: 3,
  saved_phrases: 4,
  phrase_events: 5,
};

const isTileImagePathForRemoteContext = (
  context: RemoteContext,
  remotePath: string | null
): boolean => {
  if (!remotePath) {
    return false;
  }

  const expectedPrefix = `${context.familyId}/${context.profileId}/`;
  return remotePath.startsWith(expectedPrefix) && !remotePath.includes('/ai-drafts/');
};

const primaryKeyColumn = (entityType: EntityType): 'id' | 'profile_id' => {
  return entityType === 'profile_settings' ? 'profile_id' : 'id';
};

const sortPendingEvents = (events: SyncEvent[]): SyncEvent[] => {
  return [...events].sort((left, right) => {
    const priorityDelta = EVENT_PRIORITY[left.entityType] - EVENT_PRIORITY[right.entityType];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return left.id - right.id;
  });
};

class SyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  private appStateSubscription: { remove: () => void } | null = null;

  private callbacks: SyncCallbacks = {};

  private remoteContext: RemoteContext | null = null;

  private isAuthenticated = false;

  private isRunning = false;

  public setRuntime = (params: {
    remoteContext: RemoteContext | null;
    isAuthenticated: boolean;
  }): void => {
    this.remoteContext = params.remoteContext;
    this.isAuthenticated = params.isAuthenticated;
  };

  public start = (callbacks: SyncCallbacks): void => {
    this.callbacks = callbacks;
    this.stop();

    void this.runOnce();

    this.syncTimer = setInterval(() => {
      void this.runOnce();
    }, SYNC_INTERVAL_MS);

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  };

  public stop = (): void => {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  };

  public retryFailed = async (): Promise<void> => {
    await retryErroredSyncEvents();
    this.callbacks.onPendingCountChange?.(0);
    await this.runOnce();
  };

  public runOnce = async (): Promise<void> => {
    if (this.isRunning) {
      return;
    }

    if (!hasSupabaseConfig || !supabaseClient) {
      this.callbacks.onStatusChange?.('disabled');
      return;
    }

    if (!this.isAuthenticated || !this.remoteContext) {
      this.callbacks.onStatusChange?.('disabled');
      return;
    }

    this.isRunning = true;

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        this.callbacks.onStatusChange?.('offline');
        return;
      }

      this.callbacks.onStatusChange?.('syncing');

      const boundProfileId = await getBoundSyncProfileId();
      const isBoundToCurrentProfile = boundProfileId === this.remoteContext.profileId;

      if (!isBoundToCurrentProfile) {
        if (boundProfileId && boundProfileId !== this.remoteContext.profileId) {
          throw new SyncIssueError(
            'profile_switch_requires_review',
            'This device was previously linked to a different cloud profile.'
          );
        }

        const snapshot = await fetchRemoteSnapshot(this.remoteContext);
        if (remoteSnapshotHasData(snapshot)) {
          const canDiscardLocalState = await canSafelyDiscardLocalStateForInitialBind();
          if (!canDiscardLocalState) {
            throw new SyncIssueError(
              'initial_bind_requires_review',
              'Local-only data exists on this device, so initial cloud bind was blocked.'
            );
          }

          const applied = await applyRemoteSnapshot(snapshot);
          await clearUnsyncedSyncEvents();
          await recordSuccessfulPull();
          await setBoundSyncProfileId(this.remoteContext.profileId);
          await setLastSyncIssue(null);
          await recordSuccessfulSync();
          this.callbacks.onPendingCountChange?.(0);
          if (applied) {
            this.callbacks.onDataChanged?.();
          }
          this.callbacks.onStatusChange?.('idle');
          return;
        }
      }

      const pending = sortPendingEvents(await getPendingSyncEvents(100));
      this.callbacks.onPendingCountChange?.(pending.length);

      if (pending.length > 0) {
        const pushResult = await this.pushPendingEvents(pending);
        if (pushResult.failedEventIds.length > 0) {
          await markSyncEventsError(pushResult.failedEventIds);
          this.callbacks.onPendingCountChange?.(0);
          this.callbacks.onStatusChange?.('error');
          return;
        }

        if (pushResult.successfulEventIds.length > 0) {
          await markSyncEventsSynced(pushResult.successfulEventIds);
          logEvent('sync_events_synced', {
            count: pushResult.successfulEventIds.length,
          });
        }
      }

      const erroredEvents = await countErroredSyncEvents();
      if (erroredEvents > 0) {
        this.callbacks.onPendingCountChange?.(0);
        this.callbacks.onStatusChange?.('error');
        return;
      }

      await this.pullRemoteSnapshot();
      await setBoundSyncProfileId(this.remoteContext.profileId);
      await setLastSyncIssue(null);
      await recordSuccessfulSync();
      this.callbacks.onPendingCountChange?.(0);
      this.callbacks.onStatusChange?.('idle');
    } catch (error) {
      if (error instanceof SyncIssueError) {
        await setLastSyncIssue(error.issueCode);
        logEvent('sync_blocked', {
          issue_code: error.issueCode,
        });
        this.callbacks.onPendingCountChange?.(0);
        this.callbacks.onStatusChange?.('error');
        return;
      }

      logError('sync_run_failed', error, {
        profile_id: this.remoteContext.profileId,
      });
      this.callbacks.onPendingCountChange?.(0);
      this.callbacks.onStatusChange?.('error');
    } finally {
      this.isRunning = false;
    }
  };

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      void this.runOnce();
    }
  };

  private pullRemoteSnapshot = async (
    options: { clearQueueBeforeApply?: boolean } = {}
  ): Promise<boolean> => {
    if (!this.remoteContext) {
      return false;
    }

    const snapshot = await fetchRemoteSnapshot(this.remoteContext);
    if (!remoteSnapshotHasData(snapshot)) {
      return false;
    }

    const applied = await applyRemoteSnapshot(snapshot);
    if (options.clearQueueBeforeApply) {
      await clearUnsyncedSyncEvents();
    }
    await recordSuccessfulPull();
    if (applied) {
      this.callbacks.onDataChanged?.();
    }

    return applied;
  };

  private pushPendingEvents = async (
    pending: SyncEvent[]
  ): Promise<{ successfulEventIds: number[]; failedEventIds: number[] }> => {
    const successfulEventIds: number[] = [];
    const failedEventIds: number[] = [];

    for (const event of pending) {
      try {
        await this.pushEvent(event);
        successfulEventIds.push(event.id);
      } catch (error) {
        failedEventIds.push(event.id);
        logError('sync_event_failed', error, {
          entity_type: event.entityType,
          entity_id: event.entityId,
          operation: event.operation,
        });
      }
    }

    return {
      successfulEventIds,
      failedEventIds,
    };
  };

  private pushEvent = async (event: SyncEvent): Promise<void> => {
    if (!supabaseClient) {
      throw new Error('Supabase client missing');
    }

    const primaryKey = primaryKeyColumn(event.entityType);
    if (event.operation === 'delete') {
      const { error } = await supabaseClient
        .from(event.entityType)
        .delete()
        .eq(primaryKey, event.entityId);

      if (error) {
        throw error;
      }

      return;
    }

    const eventPayload = JSON.parse(event.payload) as Record<string, unknown>;
    const localPayload = await getLocalEntitySyncPayload(event.entityType, event.entityId);
    const payload = localPayload ?? eventPayload;
    const enrichedPayload = this.enrichPayload(event.entityType, payload);
    const remotePayload = await this.prepareRemotePayload(event.entityType, enrichedPayload);

    let { error } = await supabaseClient
      .from(event.entityType)
      .upsert(remotePayload, { onConflict: primaryKey });

    if (
      error &&
      event.entityType === 'profile_settings' &&
      (
        Object.prototype.hasOwnProperty.call(remotePayload, 'backup_pin_enabled') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'show_labels') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'phrase_bar_enabled') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'suggestion_count') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'board_layout_mode') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'category_order') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'categories_start_new_page') ||
        Object.prototype.hasOwnProperty.call(remotePayload, 'child_gender')
      )
    ) {
      const fallbackPayload = { ...remotePayload };
      delete fallbackPayload.backup_pin_enabled;
      delete fallbackPayload.show_labels;
      delete fallbackPayload.phrase_bar_enabled;
      delete fallbackPayload.suggestion_count;
      delete fallbackPayload.board_layout_mode;
      delete fallbackPayload.category_order;
      delete fallbackPayload.categories_start_new_page;
      delete fallbackPayload.child_gender;
      const fallbackResult = await supabaseClient
        .from(event.entityType)
        .upsert(fallbackPayload, { onConflict: primaryKey });
      error = fallbackResult.error ?? null;
    }

    if (
      error &&
      event.entityType === 'boards' &&
      Object.prototype.hasOwnProperty.call(remotePayload, 'is_active')
    ) {
      const fallbackPayload = { ...remotePayload };
      delete fallbackPayload.is_active;
      const fallbackResult = await supabaseClient
        .from(event.entityType)
        .upsert(fallbackPayload, { onConflict: primaryKey });
      error = fallbackResult.error ?? null;
    }

    if (error) {
      throw error;
    }
  };

  private enrichPayload = (
    entityType: EntityType,
    payload: Record<string, unknown>
  ): Record<string, unknown> => {
    if (!this.remoteContext) {
      return payload;
    }

    if (entityType === 'boards') {
      return {
        ...payload,
        family_id: this.remoteContext.familyId,
        profile_id: this.remoteContext.profileId,
      };
    }

    if (entityType === 'profile_settings') {
      return {
        ...payload,
        profile_id: this.remoteContext.profileId,
      };
    }

    return payload;
  };

  private prepareRemotePayload = async (
    entityType: EntityType,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (entityType === 'boards') {
      return {
        id: payload.id,
        family_id: payload.family_id,
        profile_id: payload.profile_id,
        name: payload.name,
        locale: payload.locale,
        columns_count: payload.columns_count,
        rows_count: payload.rows_count,
        is_active: Boolean(payload.is_active),
        updated_at: payload.updated_at,
        revision: payload.revision,
      };
    }

    if (entityType === 'tiles') {
      return await this.prepareTilePayload(payload);
    }

    if (entityType === 'audio_clips') {
      return await this.prepareAudioClipPayload(payload);
    }

    if (entityType === 'saved_phrases') {
      return {
        id: payload.id,
        profile_id: this.remoteContext?.profileId ?? payload.profile_id,
        phrase_key: payload.phrase_key,
        label: payload.label,
        spoken_text: payload.spoken_text,
        tokens_json: payload.tokens_json,
        created_at: payload.created_at,
        updated_at: payload.updated_at,
        usage_count: payload.usage_count,
      };
    }

    if (entityType === 'phrase_events') {
      return {
        id: payload.id,
        profile_id: this.remoteContext?.profileId ?? payload.profile_id,
        tile_sequence: payload.tile_sequence,
        spoken_text: payload.spoken_text,
        mode: payload.mode,
        spoken_at: payload.spoken_at,
      };
    }

    return {
      profile_id: payload.profile_id,
      pin_hash: payload.pin_hash,
      lock_enabled: Boolean(payload.lock_enabled),
      backup_pin_enabled: Boolean(payload.backup_pin_enabled),
      tts_rate: payload.tts_rate,
      tts_pitch: payload.tts_pitch,
      preferred_voice: payload.preferred_voice ?? null,
      high_contrast: Boolean(payload.high_contrast),
      show_labels: Boolean(payload.show_labels),
      phrase_bar_enabled: Boolean(payload.phrase_bar_enabled),
      suggestion_count: payload.suggestion_count,
      board_layout_mode: payload.board_layout_mode ?? 'manual',
      category_order: payload.category_order ?? '["needs","feelings","social","food"]',
      categories_start_new_page: Boolean(payload.categories_start_new_page ?? true),
      child_gender: normalizeChildGender(payload.child_gender),
      updated_at: payload.updated_at,
      revision: payload.revision,
    };
  };

  private prepareTilePayload = async (
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const existingRemotePath =
      typeof payload.image_remote_path === 'string' && payload.image_remote_path.length > 0
        ? payload.image_remote_path
        : null;
    const existingRemotePathMatchesContext =
      this.remoteContext !== null &&
      isTileImagePathForRemoteContext(this.remoteContext, existingRemotePath);
    const nextPayload = {
      id: payload.id,
      board_id: payload.board_id,
      position: payload.position,
      label_cs: payload.label_cs,
      emoji: payload.emoji,
      visual_type: payload.visual_type,
      image_remote_path:
        this.remoteContext && !existingRemotePathMatchesContext
          ? null
          : existingRemotePath,
      category: payload.category,
      speech_mode: payload.speech_mode,
      audio_clip_id: payload.audio_clip_id ?? null,
      updated_at: payload.updated_at,
      revision: payload.revision,
    };

    if (
      this.remoteContext &&
      payload.visual_type === 'image' &&
      typeof payload.image_local_uri === 'string' &&
      payload.image_local_uri.length > 0 &&
      !existingRemotePathMatchesContext
    ) {
      nextPayload.image_remote_path = await uploadTileImageToSupabase(
        this.remoteContext,
        String(payload.id),
        payload.image_local_uri
      );
    }

    return nextPayload;
  };

  private prepareAudioClipPayload = async (
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    const nextPayload = {
      id: payload.id,
      tile_id: payload.tile_id,
      remote_path: payload.remote_path ?? null,
      duration_ms: payload.duration_ms,
      checksum: payload.checksum ?? null,
      format: payload.format,
      updated_at: payload.updated_at,
    };

    if (
      this.remoteContext &&
      typeof payload.local_uri === 'string' &&
      payload.local_uri.length > 0 &&
      typeof payload.format === 'string'
    ) {
      nextPayload.remote_path = await uploadAudioClipToSupabase(
        this.remoteContext,
        String(payload.id),
        payload.local_uri,
        payload.format
      );
    }

    return nextPayload;
  }
}

export const syncService = new SyncService();
