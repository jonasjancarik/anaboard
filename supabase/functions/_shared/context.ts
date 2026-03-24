import { createAdminClient } from './supabase.ts';

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
    throw new Error('Caregiver context missing');
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, family_id')
    .eq('id', profileId)
    .eq('family_id', caregiver.family_id)
    .maybeSingle<ProfileRow>();

  if (profileError || !profile) {
    throw new Error('Profile does not belong to caregiver family');
  }

  return {
    admin,
    familyId: caregiver.family_id,
    profileId: profile.id,
  };
};
