import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

import type { RemoteContext } from '../auth/types';
import { logError, logEvent } from '../../shared/telemetry/logger';
import { hasSupabaseConfig, supabaseClient } from '../../shared/services/supabaseClient';
import { getPendingSyncEvents, markSyncEventsError, markSyncEventsSynced } from '../../shared/storage/repositories/syncRepository';
import type { SyncStatus } from '../../shared/types/domain';

type SyncCallbacks = {
  onStatusChange?: (status: SyncStatus) => void;
  onPendingCountChange?: (count: number) => void;
};

const SYNC_INTERVAL_MS = 20_000;

class SyncService {
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  private appStateSubscription: { remove: () => void } | null = null;

  private callbacks: SyncCallbacks = {};

  private remoteContext: RemoteContext | null = null;

  private isAuthenticated = false;

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

    this.runOnce();

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

  public runOnce = async (): Promise<void> => {
    if (!hasSupabaseConfig || !supabaseClient) {
      this.callbacks.onStatusChange?.('disabled');
      return;
    }

    if (!this.isAuthenticated || !this.remoteContext) {
      this.callbacks.onStatusChange?.('disabled');
      return;
    }

    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      this.callbacks.onStatusChange?.('offline');
      return;
    }

    this.callbacks.onStatusChange?.('syncing');

    const pending = await getPendingSyncEvents(50);
    this.callbacks.onPendingCountChange?.(pending.length);

    if (pending.length === 0) {
      this.callbacks.onStatusChange?.('idle');
      return;
    }

    const successfulEventIds: number[] = [];
    const failedEventIds: number[] = [];

    for (const event of pending) {
      try {
        const payload = JSON.parse(event.payload) as Record<string, unknown>;
        const enrichedPayload = this.enrichPayload(event.entityType, payload);

        if (event.operation === 'delete') {
          const { error } = await supabaseClient
            .from(event.entityType)
            .delete()
            .eq('id', event.entityId);

          if (error) {
            throw error;
          }
        } else {
          let { error } = await supabaseClient.from(event.entityType).upsert(enrichedPayload);
          if (
            error &&
            event.entityType === 'profile_settings' &&
            Object.prototype.hasOwnProperty.call(enrichedPayload, 'show_labels')
          ) {
            const fallbackPayload = { ...enrichedPayload };
            delete fallbackPayload.show_labels;
            const fallbackResult = await supabaseClient
              .from(event.entityType)
              .upsert(fallbackPayload);
            error = fallbackResult.error ?? null;
          }

          if (error) {
            throw error;
          }
        }

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

    if (successfulEventIds.length > 0) {
      await markSyncEventsSynced(successfulEventIds);
      logEvent('sync_events_synced', {
        count: successfulEventIds.length,
      });
    }

    if (failedEventIds.length > 0) {
      await markSyncEventsError(failedEventIds);
      this.callbacks.onStatusChange?.('error');
      return;
    }

    this.callbacks.onStatusChange?.('idle');
  };

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState === 'active') {
      void this.runOnce();
    }
  };

  private enrichPayload = (
    entityType: string,
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

    if (entityType === 'phrase_events') {
      return {
        ...payload,
        profile_id: this.remoteContext.profileId,
      };
    }

    return payload;
  };
}

export const syncService = new SyncService();
