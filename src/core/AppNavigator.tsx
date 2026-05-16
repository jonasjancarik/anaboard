import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import { useCallback, useEffect } from 'react';

import { BoardScreen } from '../features/board/screens/BoardScreen';
import { AuthScreen } from '../features/auth/screens/AuthScreen';
import { BootstrapScreen } from '../features/auth/screens/BootstrapScreen';
import { CaregiverGateScreen } from '../features/caregiver/screens/CaregiverGateScreen';
import { EditorScreen } from '../features/caregiver/screens/EditorScreen';
import { PinSettingsScreen } from '../features/caregiver/screens/PinSettingsScreen';
import { SettingsScreen } from '../features/caregiver/screens/SettingsScreen';
import { TileArchiveScreen } from '../features/caregiver/screens/TileArchiveScreen';
import { isWebPlatform } from '../shared/platform/runtime';
import { authenticateWithDeviceForCaregiver, canUseNativeCaregiverAuth } from '../shared/utils/deviceAuth';
import { useAppStore } from '../store/useAppStore';

export const AppNavigator = () => {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const requiresBootstrap = useAppStore((state) => state.requiresBootstrap);
  const authStatus = useAppStore((state) => state.authStatus);
  const authIsAnonymous = useAppStore((state) => state.authIsAnonymous);
  const authReturnScreen = useAppStore((state) => state.authReturnScreen);
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);
  const settings = useAppStore((state) => state.settings);

  const navigate = useAppStore((state) => state.navigate);
  const setAuthReturnScreen = useAppStore((state) => state.setAuthReturnScreen);
  const unlockCaregiver = useAppStore((state) => state.unlockCaregiver);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);
  const clearPendingCaregiverAction = useAppStore((state) => state.clearPendingCaregiverAction);
  const usesAppPin = isWebPlatform || Boolean(settings?.backupPinEnabled);

  const goBack = useCallback((): boolean => {
    if (currentScreen === 'pinSettings' || currentScreen === 'tileArchive') {
      navigate('settings');
      return true;
    }

    if (currentScreen === 'editor' || currentScreen === 'settings') {
      navigate('board');
      return true;
    }

    if (currentScreen === 'auth') {
      const nextScreen = authReturnScreen ?? 'settings';
      setAuthReturnScreen(null);
      navigate(nextScreen);
      return true;
    }

    if (currentScreen === 'caregiverGate') {
      clearPendingCaregiverAction();
      setEditorTargetTileId(null);
      navigate('board');
      return true;
    }

    return false;
  }, [authReturnScreen, clearPendingCaregiverAction, currentScreen, navigate, setAuthReturnScreen, setEditorTargetTileId]);

  useEffect(() => {
    if (
      !caregiverUnlocked &&
      (currentScreen === 'editor' ||
        currentScreen === 'settings' ||
        currentScreen === 'pinSettings' ||
        currentScreen === 'tileArchive')
    ) {
      navigate(usesAppPin ? 'caregiverGate' : 'board');
    }
  }, [caregiverUnlocked, currentScreen, navigate, usesAppPin]);

  useEffect(() => {
    if (
      currentScreen === 'auth' &&
      authStatus === 'signed_in' &&
      !authIsAnonymous &&
      !requiresBootstrap
    ) {
      const nextScreen = authReturnScreen ?? 'settings';
      setAuthReturnScreen(null);
      navigate(nextScreen);
    }
  }, [authIsAnonymous, authReturnScreen, authStatus, currentScreen, navigate, requiresBootstrap, setAuthReturnScreen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return goBack();
    });

    return () => {
      subscription.remove();
    };
  }, [goBack]);

  const openCaregiver = async (): Promise<boolean> => {
    if (!settings) {
      return false;
    }

    if (!settings.lockEnabled) {
      unlockCaregiver();
      navigate('board');
      return true;
    }

    if (usesAppPin) {
      navigate('caregiverGate');
      return true;
    }

    const nativeAvailable = await canUseNativeCaregiverAuth();
    if (!nativeAvailable) {
      Alert.alert(
        'Ověření není dostupné',
        'Telefon nemá dostupné systémové ověření. Zapni v nastavení volbu „Vlastní PIN v aplikaci“.'
      );
      return false;
    }

    const result = await authenticateWithDeviceForCaregiver();
    if (result.success) {
      unlockCaregiver();
      navigate('board');
      return true;
    }

    return false;
  };

  if (authStatus === 'signed_in' && requiresBootstrap) {
    return <BootstrapScreen />;
  }

  const editorScreen = <EditorScreen onBack={() => navigate('board')} />;

  if (currentScreen === 'auth') {
    const authScreen = (
      <AuthScreen
        onBack={() => {
          const nextScreen = authReturnScreen ?? 'settings';
          setAuthReturnScreen(null);
          navigate(nextScreen);
        }}
      />
    );

    if (authReturnScreen === 'editor') {
      return (
        <>
          {editorScreen}
          <View style={styles.authOverlay}>{authScreen}</View>
        </>
      );
    }

    return authScreen;
  }

  if (currentScreen === 'caregiverGate') {
    return (
      <CaregiverGateScreen
        onPassed={() => navigate('board')}
        onCancel={() => {
          goBack();
        }}
      />
    );
  }

  if (currentScreen === 'editor') {
    return editorScreen;
  }

  if (currentScreen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => navigate('board')}
        onOpenArchive={() => navigate('tileArchive')}
        onOpenPinSettings={() => navigate('pinSettings')}
        onOpenAuth={() => navigate('auth')}
      />
    );
  }

  if (currentScreen === 'pinSettings') {
    return <PinSettingsScreen onBack={() => navigate('settings')} />;
  }

  if (currentScreen === 'tileArchive') {
    return <TileArchiveScreen onBack={() => navigate('settings')} />;
  }

  return <BoardScreen onOpenCaregiver={openCaregiver} onOpenSettings={() => navigate('settings')} />;
};

const styles = StyleSheet.create({
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
