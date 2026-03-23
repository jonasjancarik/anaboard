import { Alert, BackHandler } from 'react-native';
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
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);
  const settings = useAppStore((state) => state.settings);

  const navigate = useAppStore((state) => state.navigate);
  const unlockCaregiver = useAppStore((state) => state.unlockCaregiver);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);
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

    if (currentScreen === 'caregiverGate') {
      setEditorTargetTileId(null);
      navigate('board');
      return true;
    }

    return false;
  }, [currentScreen, navigate, setEditorTargetTileId]);

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
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return goBack();
    });

    return () => {
      subscription.remove();
    };
  }, [goBack]);

  const openCaregiver = async () => {
    if (!settings) {
      return;
    }

    if (!settings.lockEnabled) {
      unlockCaregiver();
      navigate('board');
      return;
    }

    if (usesAppPin) {
      navigate('caregiverGate');
      return;
    }

    const nativeAvailable = await canUseNativeCaregiverAuth();
    if (!nativeAvailable) {
      Alert.alert(
        'Ověření není dostupné',
        'Telefon nemá dostupné systémové ověření. Zapni v nastavení volbu „Vlastní PIN v aplikaci“.'
      );
      return;
    }

    const result = await authenticateWithDeviceForCaregiver();
    if (result.success) {
      unlockCaregiver();
      navigate('board');
    }
  };

  if (authStatus === 'signed_out') {
    return <AuthScreen />;
  }

  if (authStatus === 'signed_in' && requiresBootstrap) {
    return <BootstrapScreen />;
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
    return <EditorScreen onBack={() => navigate('board')} />;
  }

  if (currentScreen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => navigate('board')}
        onOpenArchive={() => navigate('tileArchive')}
        onOpenPinSettings={() => navigate('pinSettings')}
      />
    );
  }

  if (currentScreen === 'pinSettings') {
    return <PinSettingsScreen onBack={() => navigate('settings')} />;
  }

  if (currentScreen === 'tileArchive') {
    return <TileArchiveScreen onBack={() => navigate('settings')} />;
  }

  return <BoardScreen onOpenCaregiver={() => { void openCaregiver(); }} onOpenSettings={() => navigate('settings')} />;
};
