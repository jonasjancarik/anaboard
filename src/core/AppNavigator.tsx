import { useEffect } from 'react';

import { BoardScreen } from '../features/board/screens/BoardScreen';
import { AuthScreen } from '../features/auth/screens/AuthScreen';
import { BootstrapScreen } from '../features/auth/screens/BootstrapScreen';
import { CaregiverGateScreen } from '../features/caregiver/screens/CaregiverGateScreen';
import { EditorScreen } from '../features/caregiver/screens/EditorScreen';
import { SettingsScreen } from '../features/caregiver/screens/SettingsScreen';
import { useAppStore } from '../store/useAppStore';

export const AppNavigator = () => {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const authStatus = useAppStore((state) => state.authStatus);
  const requiresBootstrap = useAppStore((state) => state.requiresBootstrap);
  const caregiverUnlocked = useAppStore((state) => state.caregiverUnlocked);

  const navigate = useAppStore((state) => state.navigate);
  const lockCaregiver = useAppStore((state) => state.lockCaregiver);

  useEffect(() => {
    if (!caregiverUnlocked && (currentScreen === 'editor' || currentScreen === 'settings')) {
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
        onPassed={() => navigate('editor')}
        onCancel={() => navigate('board')}
      />
    );
  }

  if (currentScreen === 'editor') {
    return (
      <EditorScreen
        onBack={() => {
          lockCaregiver();
          navigate('board');
        }}
        onOpenSettings={() => navigate('settings')}
      />
    );
  }

  if (currentScreen === 'settings') {
    return <SettingsScreen onBack={() => navigate('editor')} />;
  }

  return <BoardScreen onOpenCaregiver={() => navigate('caregiverGate')} />;
};
