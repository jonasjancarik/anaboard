import { useEffect } from 'react';

import { BoardScreen } from '../features/board/screens/BoardScreen';
import { AuthScreen } from '../features/auth/screens/AuthScreen';
import { BootstrapScreen } from '../features/auth/screens/BootstrapScreen';
import { CaregiverGateScreen } from '../features/caregiver/screens/CaregiverGateScreen';
import { EditorScreen } from '../features/caregiver/screens/EditorScreen';
import { SettingsScreen } from '../features/caregiver/screens/SettingsScreen';
import { TileArchiveScreen } from '../features/caregiver/screens/TileArchiveScreen';
import { useAppStore } from '../store/useAppStore';

export const AppNavigator = () => {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const authStatus = useAppStore((state) => state.authStatus);
  const requiresBootstrap = useAppStore((state) => state.requiresBootstrap);
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);

  const navigate = useAppStore((state) => state.navigate);
  const lockCaregiver = useAppStore((state) => state.lockCaregiver);
  const setEditorTargetTileId = useAppStore((state) => state.setEditorTargetTileId);

  useEffect(() => {
    if (!caregiverUnlocked && (currentScreen === 'editor' || currentScreen === 'settings' || currentScreen === 'tileArchive')) {
      navigate('caregiverGate');
    }
  }, [caregiverUnlocked, currentScreen, navigate]);

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
          setEditorTargetTileId(null);
          navigate('board');
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
        onLock={() => {
          lockCaregiver();
          navigate('board');
        }}
      />
    );
  }

  if (currentScreen === 'tileArchive') {
    return <TileArchiveScreen onBack={() => navigate('settings')} />;
  }

  return <BoardScreen onOpenCaregiver={() => navigate('caregiverGate')} onOpenSettings={() => navigate('settings')} />;
};
