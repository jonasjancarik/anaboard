import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';

import { AppNavigator } from './AppNavigator';
import { UnsupportedBrowserScreen } from './UnsupportedBrowserScreen';
import { authService } from '../features/auth/authService';
import { speechEngine } from '../features/speech/speechEngine';
import { syncService } from '../features/sync/syncService';
import type { AuthStatus } from '../features/auth/types';
import { APP_THEME } from '../shared/constants/theme';
import { isWebPlatform } from '../shared/platform/runtime';
import { getWebStorageSupport } from '../shared/platform/webStorageSupport';
import { runWebPersistenceSmokeTest } from '../shared/storage/webPersistenceSmoke';
import { initTelemetry, logEvent } from '../shared/telemetry/logger';
import { useAppStore } from '../store/useAppStore';

export const AppRoot = () => {
  const [webSupportState, setWebSupportState] = useState<{
    status: 'checking' | 'supported' | 'unsupported';
    message: string;
  }>(() =>
    isWebPlatform
      ? {
          status: 'checking',
          message: '',
        }
      : {
          status: 'supported',
          message: '',
        }
  );

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
  const refreshBoard = useAppStore((state) => state.refreshBoard);
  const refreshSettings = useAppStore((state) => state.refreshSettings);
  const refreshPhrases = useAppStore((state) => state.refreshPhrases);
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);
  const settings = useAppStore((state) => state.settings);

  const canBootApp = webSupportState.status === 'supported';
  const authCallbackUrl = Linking.useURL();

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      initTelemetry();

      if (isWebPlatform) {
        const support = await getWebStorageSupport();
        if (!isMounted) {
          return;
        }

        if (!support.supported) {
          setWebSupportState({
            status: 'unsupported',
            message: support.message,
          });
          return;
        }

        setWebSupportState({
          status: 'supported',
          message: '',
        });
      }

      await initializeApp();

      if (!isMounted || !isWebPlatform) {
        return;
      }

      const summary = await runWebPersistenceSmokeTest();
      logEvent('web_storage_smoke', {
        status: summary.status,
        boot_count: summary.bootCount,
      });
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [initializeApp]);

  useEffect(() => {
    if (!canBootApp) {
      return;
    }

    let isMounted = true;

    const applyAuthState = async (
      params: {
        status: AuthStatus;
        isAnonymous: boolean;
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
          isAnonymous: false,
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
          const anonymousSession = await authService.signInAnonymously();
          const anonymousUser = anonymousSession?.user ?? null;

          if (!anonymousUser) {
            await applyAuthState({
              status: 'signed_out',
              isAnonymous: false,
              userId: null,
              email: null,
            });
            return;
          }

          await applyAuthState(
            {
              status: 'signed_in',
              isAnonymous: authService.isAnonymousUser(anonymousUser),
              userId: anonymousUser.id,
              email: anonymousUser.email ?? null,
            },
            { resolveBootstrap: true }
          );
          return;
        }

        await applyAuthState(
          {
            status: 'signed_in',
            isAnonymous: authService.isAnonymousUser(user),
            userId: user.id,
            email: user.email ?? null,
          },
          { resolveBootstrap: true }
        );
      } catch {
        await applyAuthState({
          status: 'signed_out',
          isAnonymous: false,
          userId: null,
          email: null,
        });
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
              isAnonymous: false,
              userId: null,
              email: null,
            });
            return;
          }

          await applyAuthState(
            {
              status: 'signed_in',
              isAnonymous: authService.isAnonymousUser(user),
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
  }, [canBootApp, setAuthLoading, setAuthState, setRemoteContext, setRequiresBootstrap]);

  useEffect(() => {
    if (!canBootApp) {
      return;
    }

    syncService.setRuntime({
      isAuthenticated: authStatus === 'signed_in' && !requiresBootstrap,
      remoteContext,
    });

    if (authStatus === 'signed_in' && !requiresBootstrap && remoteContext) {
      void syncService.runOnce();
    }
  }, [authStatus, canBootApp, remoteContext, requiresBootstrap]);

  useEffect(() => {
    if (!canBootApp || !authCallbackUrl || !authService.isEnabled()) {
      return;
    }

    void (async () => {
      try {
        await authService.consumeMagicLinkUrl(authCallbackUrl);
      } catch {
        // Auth screen handles the next retry; keep local app usable.
      }
    })();
  }, [authCallbackUrl, canBootApp]);

  useEffect(() => {
    if (!canBootApp) {
      return;
    }

    syncService.start({
      onStatusChange: (status) => setSyncStatus(status),
      onPendingCountChange: () => {
        void refreshPendingSyncEvents();
      },
      onDataChanged: () => {
        void (async () => {
          await Promise.all([
            refreshBoard(),
            refreshSettings(),
            refreshPhrases(),
            refreshPendingSyncEvents(),
          ]);
        })();
      },
    });

    return () => {
      syncService.stop();
    };
  }, [
    canBootApp,
    refreshBoard,
    refreshPendingSyncEvents,
    refreshPhrases,
    refreshSettings,
    setSyncStatus,
  ]);

  useEffect(() => {
    if (!canBootApp || !settings) {
      return;
    }

    speechEngine.setSettings({
      ttsRate: settings.ttsRate,
      ttsPitch: settings.ttsPitch,
      preferredVoice: settings.preferredVoice,
    });
  }, [canBootApp, settings]);

  if (webSupportState.status === 'unsupported') {
    return (
      <SafeAreaProvider>
        <UnsupportedBrowserScreen message={webSupportState.message} />
      </SafeAreaProvider>
    );
  }

  const isLoading =
    webSupportState.status === 'checking' || isAuthLoading || isBoardLoading || isSettingsLoading;
  const loaderText =
    webSupportState.status === 'checking' ? 'Ověřuji prohlížeč...' : 'Načítám AnaBoard...';

  return (
    <SafeAreaProvider>
      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={APP_THEME.primary} />
          <Text style={styles.loaderText}>{loaderText}</Text>
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
    backgroundColor: APP_THEME.background,
    gap: 12,
  },
  loaderText: {
    color: APP_THEME.text,
    fontWeight: '700',
  },
});
