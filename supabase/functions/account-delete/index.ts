import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

import { corsHeaders, errorResponse, errorResponseFromError, jsonResponse } from '../_shared/cors.ts';
import { TILE_IMAGES_BUCKET } from '../_shared/storage.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

const AUDIO_CLIPS_BUCKET = 'audio-clips';
const LIST_PAGE_SIZE = 1000;

type CaregiverRow = {
  id: string;
  family_id: string;
};

// Storage has no recursive delete; walk the folder and remove files page by page.
const removeStorageFolder = async (
  admin: SupabaseClient,
  bucket: string,
  folder: string
): Promise<number> => {
  const files: string[] = [];
  const folders = [folder];

  while (folders.length > 0) {
    const current = folders.pop() as string;
    let offset = 0;

    while (true) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(current, { limit: LIST_PAGE_SIZE, offset });

      if (error) {
        throw error;
      }

      for (const entry of data ?? []) {
        const path = `${current}/${entry.name}`;
        if (entry.id === null) {
          folders.push(path);
        } else {
          files.push(path);
        }
      }

      if (!data || data.length < LIST_PAGE_SIZE) {
        break;
      }
      offset += LIST_PAGE_SIZE;
    }
  }

  for (let index = 0; index < files.length; index += LIST_PAGE_SIZE) {
    const { error } = await admin.storage
      .from(bucket)
      .remove(files.slice(index, index + LIST_PAGE_SIZE));

    if (error) {
      throw error;
    }
  }

  return files.length;
};

const throwIfError = (error: unknown) => {
  if (error) {
    throw error;
  }
};

const deleteFamily = async (admin: SupabaseClient, familyId: string) => {
  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id')
    .eq('family_id', familyId);
  throwIfError(profilesError);

  // These tables key on profile_id as text without a foreign key, so the
  // family cascade does not reach them.
  const profileIds = (profiles ?? []).map((profile: { id: string }) => String(profile.id));
  if (profileIds.length > 0) {
    for (const table of ['profile_settings', 'phrase_events', 'saved_phrases']) {
      const { error } = await admin.from(table).delete().in('profile_id', profileIds);
      throwIfError(error);
    }
  }

  await removeStorageFolder(admin, AUDIO_CLIPS_BUCKET, familyId);
  await removeStorageFolder(admin, TILE_IMAGES_BUCKET, familyId);

  const { error: eventsError } = await admin
    .from('ai_image_generation_events')
    .delete()
    .eq('family_id', familyId);
  throwIfError(eventsError);

  // Cascades to caregivers, profiles, boards, tiles and audio_clips.
  const { error: familyError } = await admin.from('families').delete().eq('id', familyId);
  throwIfError(familyError);
};

const leaveSharedFamily = async (
  admin: SupabaseClient,
  caregiver: CaregiverRow,
  nextOwnerId: string
) => {
  const { error: ownerError } = await admin
    .from('families')
    .update({ created_by: nextOwnerId })
    .eq('id', caregiver.family_id)
    .eq('created_by', caregiver.id);
  throwIfError(ownerError);

  const { error } = await admin.from('caregivers').delete().eq('id', caregiver.id);
  throwIfError(error);
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const user = await requireUser(request);
    const admin = createAdminClient();

    const { data: caregiver, error: caregiverError } = await admin
      .from('caregivers')
      .select('id, family_id')
      .eq('id', user.id)
      .maybeSingle<CaregiverRow>();
    throwIfError(caregiverError);

    let deletedFamily = false;
    if (caregiver) {
      const { data: otherCaregivers, error: othersError } = await admin
        .from('caregivers')
        .select('id')
        .eq('family_id', caregiver.family_id)
        .neq('id', user.id)
        .order('created_at', { ascending: true })
        .limit(1);
      throwIfError(othersError);

      const nextOwner = otherCaregivers?.[0] as { id: string } | undefined;
      if (nextOwner) {
        // Another caregiver still uses the family board; remove only this account.
        await leaveSharedFamily(admin, caregiver, nextOwner.id);
      } else {
        await deleteFamily(admin, caregiver.family_id);
        deletedFamily = true;
      }
    }

    await removeStorageFolder(admin, TILE_IMAGES_BUCKET, `trials/${user.id}`);

    const { error: userEventsError } = await admin
      .from('ai_image_generation_events')
      .delete()
      .eq('user_id', user.id);
    throwIfError(userEventsError);

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    throwIfError(deleteUserError);

    return jsonResponse({ deleted: true, deletedFamily });
  } catch (error) {
    console.error('account delete failed', error);
    return errorResponseFromError(error, 'Account delete failed');
  }
});
