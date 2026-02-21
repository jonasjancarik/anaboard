import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RemoteContext } from '../auth/types';

const REMOTE_CONTEXT_KEY = 'anaboard.remote.context';

export const saveRemoteContext = async (context: RemoteContext): Promise<void> => {
  await AsyncStorage.setItem(REMOTE_CONTEXT_KEY, JSON.stringify(context));
};

export const loadRemoteContext = async (): Promise<RemoteContext | null> => {
  const rawValue = await AsyncStorage.getItem(REMOTE_CONTEXT_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as RemoteContext;
    if (!parsed.familyId || !parsed.profileId || !parsed.caregiverId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const clearRemoteContext = async (): Promise<void> => {
  await AsyncStorage.removeItem(REMOTE_CONTEXT_KEY);
};
