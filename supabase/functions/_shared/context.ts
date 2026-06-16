import { createAdminClient } from './supabase.ts';
import { HttpError } from './cors.ts';

type CaregiverRow = {
  id: string;
  family_id: string;
};

type ProfileRow = {
  id: string;
  family_id: string;
};

export const getAuthorizedStorageContext = async (userId: string, profileId: string) => {
  const admin = createAdminClient();

  const { data: caregiver, error: caregiverError } = await admin
    .from('caregivers')
    .select('id, family_id')
    .eq('id', userId)
    .maybeSingle<CaregiverRow>();

  if (caregiverError || !caregiver) {
    throw new HttpError('Caregiver context missing', 403);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, family_id')
    .eq('id', profileId)
    .eq('family_id', caregiver.family_id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile) {
    throw new HttpError('Profile does not belong to caregiver family', 403);
  }

  return {
    admin,
    familyId: caregiver.family_id,
    profileId: profile.id,
  };
};
