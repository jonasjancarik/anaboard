import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

const IMAGE_GENERATION_LIMIT = 10;

type AuthAdminUser = {
  app_metadata?: Record<string, unknown>;
};

const getTrialUsage = (user: AuthAdminUser | null): { imageGenerationsUsed: number } => {
  const metadata = user?.app_metadata;
  const trial =
    metadata && typeof metadata.anaboard_trial === 'object' && metadata.anaboard_trial
      ? (metadata.anaboard_trial as Record<string, unknown>)
      : null;

  return {
    imageGenerationsUsed:
      typeof trial?.image_generations_used === 'number'
        ? trial.image_generations_used
        : 0,
  };
};

export const consumeAnonymousImageGenerationQuota = async (
  admin: SupabaseClient,
  userId: string,
  isAnonymous: boolean
): Promise<{ remaining: number | null }> => {
  if (!isAnonymous) {
    return { remaining: null };
  }

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw error ?? new Error('Anonymous trial user not found');
  }

  const currentUsage = getTrialUsage(data.user);
  if (currentUsage.imageGenerationsUsed >= IMAGE_GENERATION_LIMIT) {
    throw new Error('Bez účtu už je vyčerpáno 10 AI obrázků. Přihlas se pro další.');
  }

  const nextUsed = currentUsage.imageGenerationsUsed + 1;
  const nextAppMetadata = {
    ...(data.user.app_metadata ?? {}),
    anaboard_trial: {
      ...(typeof data.user.app_metadata?.anaboard_trial === 'object' &&
      data.user.app_metadata?.anaboard_trial
        ? (data.user.app_metadata.anaboard_trial as Record<string, unknown>)
        : {}),
      image_generations_used: nextUsed,
    },
  };

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: nextAppMetadata,
  });

  if (updateError) {
    throw updateError;
  }

  return {
    remaining: IMAGE_GENERATION_LIMIT - nextUsed,
  };
};
