import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppNavigator } from './AppNavigator';
import { authService } from '../features/auth/authService';
import { speechEngine } from '../features/speech/speechEngine';
import { syncService } from '../features/sync/syncService';
import type { AuthStatus } from '../features/auth/types';
import { initTelemetry } from '../shared/telemetry/logger';
import { useAppStore } from '../store/useAppStore';

export const AppRoot = () => {
  const initializeApp = useAppStore((state) => state.initializeApp);
  const setAuthState = useAppStore((state) => state.setAuthState);
  const setAuthLoading = useAppStore((state) => state.setAuthLoading);
  const setRequiresBootstrap = useAppStore((state) => state.setRequiresBootstrap);
  const setRemoteContext = useAppStore((state) => state.setRemoteContext);
  const authStatus = useAppStore((state) => state.authStatus);
  const isAuthLoading = useAppStore((state) => state.isAuthLoading);
  const requiresBootstrap = useAppStore((state) => state.requiresBootstrap);
  const remoteContext = useAppStore((state) => state.remoteContext);
  const isBoardLoading = useAppStore((state) => state.isBoardLoading);
  const isSettingsLoading = useAppStore((state) => state.isSettingsLoading);
  const refreshPendingSyncEvents = useAppStore((state) => state.refreshPendingSyncEvents);
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);
  const settings = useAppStore((state) => state.settings);

  useEffect(() => {
    initTelemetry();
    void initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    let isMounted = true;

    const applyAuthState = async (
      params: {
        status: AuthStatus;
        userId: string | null;
        email: string | null;
      },
      opts: { resolveBootstrap?: boolean } = { resolveBootstrap: false }
    ) => {
      if (!isMounted) {
        return;
      }

      setAuthState(params);

      if (!opts.resolveBootstrap || !params.userId) {
        if (params.status === 'signed_out') {
          await authService.clearCachedRemoteContext();
        }
        setRequiresBootstrap(false);
        setRemoteContext(null);
        return;
      }

      try {
        const session = await authService.getSession();
        const user = session?.user ?? null;

        if (!user) {
          setRequiresBootstrap(false);
          setRemoteContext(null);
          return;
        }

        const cachedContext = await authService.loadCachedRemoteContext();
        if (cachedContext?.caregiverId === user.id) {
          setRemoteContext(cachedContext);
        }

        const bootstrapState = await authService.resolveBootstrapState(user);
        if (!isMounted) {
          return;
        }

        setRemoteContext(bootstrapState.context);
        setRequiresBootstrap(bootstrapState.requiresBootstrap);
      } catch {
        if (!isMounted) {
          return;
        }
        setRequiresBootstrap(true);
      }
    };

    const initAuth = async () => {
      setAuthLoading(true);

      if (!authService.isEnabled()) {
        await applyAuthState({
          status: 'disabled',
          userId: null,
          email: null,
        });
        setAuthLoading(false);
        return;
      }

      try {
        const session = await authService.getSession();
        const user = session?.user ?? null;

        if (!user) {
          await applyAuthState({
            status: 'signed_out',
            userId: null,
            email: null,
          });
          return;
        }

        await applyAuthState(
          {
            status: 'signed_in',
            userId: user.id,
            email: user.email ?? null,
          },
          { resolveBootstrap: true }
        );
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    };

    void initAuth();

    const subscription = authService.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      void (async () => {
        setAuthLoading(true);
        try {
          const user = session?.user ?? null;
          if (!user) {
            await applyAuthState({
              status: 'signed_out',
              userId: null,
              email: null,
            });
            return;
          }

          await applyAuthState(
            {
              status: 'signed_in',
              userId: user.id,
              email: user.email ?? null,
            },
            { resolveBootstrap: true }
          );
        } finally {
          if (isMounted) {
            setAuthLoading(false);
          }
        }
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [setAuthLoading, setAuthState, setRemoteContext, setRequiresBootstrap]);

  useEffect(() => {
    syncService.setRuntime({
      isAuthenticated: authStatus === 'signed_in' && !requiresBootstrap,
      remoteContext,
    });
  }, [authStatus, remoteContext, requiresBootstrap]);

  useEffect(() => {
    syncService.start({
      onStatusChange: (status) => setSyncStatus(status),
      onPendingCountChange: () => {
        void refreshPendingSyncEvents();
      },
    });

    return () => {
      syncService.stop();
    };
  }, [refreshPendingSyncEvents, setSyncStatus]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    speechEngine.setSettings({
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      preferredVoice: settings.preferredVoice,
    });
  }, [settings]);

  return (
    <SafeAreaProvider>
      {isAuthLoading || isBoardLoading || isSettingsLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#2E73CD" />
          <Text style={styles.loaderText}>Načítám AnaBoard...</Text>
        </View>
      ) : (
        <AppNavigator />
      )}
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F7FC',
    gap: 12,
  },
  loaderText: {
    color: '#304663',
    fontWeight: '700',
  },
});
