import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthorizedStorageContext } from '../_shared/context.ts';
import { generateTransparentImage } from '../_shared/openai.ts';
import {
  buildAnonymousTileImageDraftPath,
  buildTileImageDraftPath,
  TILE_IMAGES_BUCKET,
} from '../_shared/storage.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';
import { consumeAnonymousImageGenerationQuota } from '../_shared/trialQuota.ts';

type RequestBody = {
  profileId?: string;
  tileId?: string;
  label?: string;
  locale?: string;
  category?: string;
};

const getExtension = (mimeType: string): string => {
  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
};

const buildPrompt = (body: Required<Pick<RequestBody, 'label' | 'locale'>> & RequestBody) => {
  return [
    `Create one square AAC tile illustration for the label "${body.label}".`,
    `Locale: ${body.locale}.`,
    body.category ? `Category: ${body.category}.` : 'Category: unknown.',
    'Style: warm, calm, child-friendly flat pictogram.',
    'Single clear object. Centered composition. Soft edges. Soft color palette.',
    'No text. No letters. No watermark. No frame. No busy background.',
    'White or transparent-looking plain background.',
    'Make the object instantly recognizable for a preschool child.',
  ].join(' ');
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
    const label = body.label?.trim();
    const locale = body.locale?.trim() || 'cs-CZ';

    if (!tileId || !label) {
      return errorResponse('tileId and label are required');
    }

    const storageContext =
      profileId && !user.isAnonymous
        ? await getAuthorizedStorageContext(user.id, profileId)
        : {
            admin: createAdminClient(),
            familyId: null,
          };
    const admin = storageContext.admin;
    const draftId = crypto.randomUUID();
    const trialQuota = await consumeAnonymousImageGenerationQuota(admin, user.id, user.isAnonymous);
    const image = await generateTransparentImage(
      buildPrompt({
        label,
        locale,
        category: body.category,
      })
    );

    const extension = getExtension(image.mimeType);
    const storagePath =
      profileId && !user.isAnonymous
        ? buildTileImageDraftPath(storageContext.familyId as string, profileId, draftId, extension)
        : buildAnonymousTileImageDraftPath(user.id, draftId, extension);
    const { error: uploadError } = await admin.storage.from(TILE_IMAGES_BUCKET).upload(
      storagePath,
      image.bytes,
      {
        contentType: image.mimeType,
        upsert: false,
      }
    );

    if (uploadError) {
      throw uploadError;
    }

    const { data: signedUrlData, error: signedUrlError } = await admin.storage
      .from(TILE_IMAGES_BUCKET)
      .createSignedUrl(storagePath, 600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw signedUrlError ?? new Error('Signed URL generation failed');
    }

    return jsonResponse({
      draftId,
      storagePath,
      signedUrl: signedUrlData.signedUrl,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      provider: 'openai',
      promptVersion: 'tile-image-v1-openai',
      trialRemaining: trialQuota.remaining,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Image draft generation failed', 500);
  }
});
