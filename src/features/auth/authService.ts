import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { isWebPlatform } from '../../shared/platform/runtime';

import { logError } from '../../shared/telemetry/logger';
import { hasSupabaseConfig, supabaseClient } from '../../shared/services/supabaseClient';
import type { RemoteContext } from './types';
import { clearRemoteContext, loadRemoteContext, saveRemoteContext } from '../sync/remoteContextStorage';

export type BootstrapInput = {
  familyName: string;
  childName: string;
};

type CaregiverRow = {
  id: string;
  family_id: string;
  email: string;
};

type ProfileRow = {
  id: string;
  family_id: string;
  name: string;
};

const isAnonymousUser = (user: User): boolean => {
  const maybeAnonymousUser = user as User & { is_anonymous?: boolean };
  if (maybeAnonymousUser.is_anonymous === true) {
    return true;
  }

  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes('anonymous')) {
    return true;
  }

  return user.app_metadata?.provider === 'anonymous';
};

const getClient = () => {
  if (!hasSupabaseConfig || !supabaseClient) {
    throw new Error('Supabase config missing');
  }

  return supabaseClient;
};

const parseAuthCallbackParams = (url: string): URLSearchParams => {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash);

  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  return params;
};

const stripAuthCallbackParams = (url: string): string => {
  const parsedUrl = new URL(url);
  parsedUrl.hash = '';
  parsedUrl.searchParams.delete('access_token');
  parsedUrl.searchParams.delete('refresh_token');
  parsedUrl.searchParams.delete('token_hash');
  parsedUrl.searchParams.delete('type');
  return parsedUrl.toString();
};

const ensureProfileForFamily = async (
  familyId: string,
  fallbackName: string
): Promise<ProfileRow> => {
  const client = getClient();

  const { data: existingProfile, error: fetchError } = await client
    .from('profiles')
    .select('id, family_id, name')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<ProfileRow>();

  if (fetchError) {
    throw fetchError;
  }

  if (existingProfile) {
    return existingProfile;
  }

  const { data: newProfile, error: insertError } = await client
    .from('profiles')
    .insert({
      family_id: familyId,
      name: fallbackName,
    })
    .select('id, family_id, name')
    .single<ProfileRow>();

  if (insertError || !newProfile) {
    throw insertError ?? new Error('Failed to create profile');
  }

  return newProfile;
};

const buildRemoteContext = async (user: User): Promise<RemoteContext | null> => {
  if (isAnonymousUser(user)) {
    return null;
  }

  const client = getClient();

  const { data: caregiver, error: caregiverError } = await client
    .from('caregivers')
    .select('id, family_id, email')
    .eq('id', user.id)
    .maybeSingle<CaregiverRow>();

  if (caregiverError) {
    throw caregiverError;
  }

  if (!caregiver) {
    return null;
  }

  const profile = await ensureProfileForFamily(
    caregiver.family_id,
    user.email ? `${user.email.split('@')[0]} profil` : 'Dítě'
  );

  const context: RemoteContext = {
    familyId: caregiver.family_id,
    profileId: profile.id,
    caregiverId: caregiver.id,
    caregiverEmail: caregiver.email,
  };

  await saveRemoteContext(context);

  return context;
};

export const authService = {
  isEnabled(): boolean {
    return hasSupabaseConfig;
  },

  async getSession(): Promise<Session | null> {
    if (!hasSupabaseConfig || !supabaseClient) {
      return null;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }

    return data.session;
  },

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ): { unsubscribe: () => void } {
    if (!hasSupabaseConfig || !supabaseClient) {
      return { unsubscribe: () => {} };
    }

    const { data } = supabaseClient.auth.onAuthStateChange(callback);

    return {
      unsubscribe: () => {
        data.subscription.unsubscribe();
      },
    };
  },

  async sendMagicLink(email: string, emailRedirectTo: string): Promise<void> {
    const client = getClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      throw error;
    }
  },

  async signInAnonymously(): Promise<Session | null> {
    const client = getClient();
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      throw error;
    }

    return data.session;
  },

  async consumeMagicLinkUrl(url: string): Promise<boolean> {
    const client = getClient();
    const params = parseAuthCallbackParams(url);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const tokenHash = params.get('token_hash');

    if (accessToken && refreshToken) {
      const { error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        throw error;
      }

      if (isWebPlatform && typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, stripAuthCallbackParams(window.location.href));
      }

      return true;
    }

    if (tokenHash) {
      const { error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      });

      if (error) {
        throw error;
      }

      if (isWebPlatform && typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, stripAuthCallbackParams(window.location.href));
      }

      return true;
    }

    return false;
  },

  async signOut(): Promise<void> {
    const client = getClient();
    const { error } = await client.auth.signOut();

    await clearRemoteContext();

    if (error) {
      throw error;
    }
  },

  async resolveBootstrapState(user: User): Promise<{ requiresBootstrap: boolean; context: RemoteContext | null }> {
    try {
      if (isAnonymousUser(user)) {
        return {
          requiresBootstrap: false,
          context: null,
        };
      }

      const remoteContext = await buildRemoteContext(user);
      return {
        requiresBootstrap: !remoteContext,
        context: remoteContext,
      };
    } catch (error) {
      logError('resolve_bootstrap_state_failed', error, {
        user_id: user.id,
      });
      throw error;
    }
  },

  async bootstrapCurrentUser(input: BootstrapInput): Promise<RemoteContext> {
    const client = getClient();
    const { data: authState, error: authError } = await client.auth.getUser();

    if (authError || !authState.user) {
      throw authError ?? new Error('User not authenticated');
    }

    const user = authState.user;

    const { data: existingCaregiver, error: caregiverFetchError } = await client
      .from('caregivers')
      .select('id, family_id, email')
      .eq('id', user.id)
      .maybeSingle<CaregiverRow>();

    if (caregiverFetchError) {
      throw caregiverFetchError;
    }

    let caregiver = existingCaregiver;

    if (!caregiver) {
      const { data: family, error: familyError } = await client
        .from('families')
        .insert({ name: input.familyName.trim() || 'Moje rodina' })
        .select('id')
        .single<{ id: string }>();

      if (familyError || !family) {
        throw familyError ?? new Error('Failed to create family');
      }

      const { data: caregiverInsert, error: caregiverInsertError } = await client
        .from('caregivers')
        .insert({
          id: user.id,
          family_id: family.id,
          email: user.email ?? `${user.id}@anaboard.local`,
        })
        .select('id, family_id, email')
        .single<CaregiverRow>();

      if (caregiverInsertError || !caregiverInsert) {
        throw caregiverInsertError ?? new Error('Failed to create caregiver');
      }

      caregiver = caregiverInsert;
    }

    const profile = await ensureProfileForFamily(caregiver.family_id, input.childName || 'Dítě');

    const context: RemoteContext = {
      familyId: caregiver.family_id,
      profileId: profile.id,
      caregiverId: caregiver.id,
      caregiverEmail: caregiver.email,
    };

    await saveRemoteContext(context);

    return context;
  },

  async loadCachedRemoteContext(): Promise<RemoteContext | null> {
    return loadRemoteContext();
  },

  async clearCachedRemoteContext(): Promise<void> {
    await clearRemoteContext();
  },

  isAnonymousUser,
};
