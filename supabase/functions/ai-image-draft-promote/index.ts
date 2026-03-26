import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthorizedStorageContext } from '../_shared/context.ts';
import {
  buildAnonymousTileImagePath,
  buildTileImagePath,
  TILE_IMAGES_BUCKET,
} from '../_shared/storage.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

type RequestBody = {
  profileId?: string;
  tileId?: string;
  draftId?: string;
  draftStoragePath?: string;
};

const getExtension = (value: string): string => {
  const match = value.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? 'png';
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
    const body = (await request.json()) as RequestBody;

    const profileId = body.profileId?.trim();
    const tileId = body.tileId?.trim();
    const draftId = body.draftId?.trim();
    const draftStoragePath = body.draftStoragePath?.trim();

    if (!tileId || !draftId || !draftStoragePath) {
      return errorResponse('tileId, draftId, and draftStoragePath are required');
    }

    const isAnonymous = user.isAnonymous || !profileId;
    const { admin, familyId } =
      !isAnonymous && profileId
        ? await getAuthorizedStorageContext(user.id, profileId)
        : { admin: createAdminClient(), familyId: null };
    const expectedPrefix = isAnonymous
      ? `trials/${user.id}/ai-drafts/`
      : `${familyId}/${profileId}/ai-drafts/`;
    if (!draftStoragePath.startsWith(expectedPrefix)) {
      return errorResponse('Draft path outside authorized prefix', 403);
    }

    const finalPath = isAnonymous
      ? buildAnonymousTileImagePath(user.id, tileId, getExtension(draftStoragePath))
      : buildTileImagePath(
          familyId as string,
          profileId as string,
          tileId,
          getExtension(draftStoragePath)
        );

    await admin.storage.from(TILE_IMAGES_BUCKET).remove([finalPath]);

    const { error: copyError } = await admin.storage
      .from(TILE_IMAGES_BUCKET)
      .copy(draftStoragePath, finalPath);

    if (copyError) {
      throw copyError;
    }

    await admin.storage.from(TILE_IMAGES_BUCKET).remove([draftStoragePath]);

    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from(TILE_IMAGES_BUCKET)
      .createSignedUrl(finalPath, 600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw signedUrlError ?? new Error('Signed URL generation failed');
    }

    return jsonResponse({
      storagePath: finalPath,
      signedUrl: signedUrlData.signedUrl,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Image draft promote failed', 500);
  }
});
