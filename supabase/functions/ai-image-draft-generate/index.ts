import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getAuthorizedStorageContext } from '../_shared/context.ts';
import { generateTransparentImage } from '../_shared/openai.ts';
import { buildTileImageDraftPath, TILE_IMAGES_BUCKET } from '../_shared/storage.ts';
import { requireUser } from '../_shared/supabase.ts';

type RequestBody = {
  profileId?: string;
  tileId?: string;
  label?: string;
  locale?: string;
  category?: string;
  stylePreset?: string;
};

const getExtension = (mimeType: string): string => {
  if (mimeType === 'image/webp') {
    return 'webp';
  }

  return 'png';
};

const buildPrompt = (body: Required<Pick<RequestBody, 'label' | 'locale'>> & RequestBody) => {
  const stylePreset = body.stylePreset?.trim() || 'warm-flat-pictogram-v1';

  return [
    `Create one square AAC tile illustration for the Czech label "${body.label}".`,
    `Locale: ${body.locale}.`,
    body.category ? `Category: ${body.category}.` : 'Category: unknown.',
    `Style preset: ${stylePreset}.`,
    'Style: warm, calm, child-friendly flat pictogram.',
    'Single clear object. Centered composition. Soft edges. Soft color palette.',
    'No text. No letters. No watermark. No frame. No busy background.',
    'White or transparent-looking plain background.',
    'Instantly recognizable for a preschool child.',
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

    if (!profileId || !tileId || !label) {
      return errorResponse('profileId, tileId, and label are required');
    }

    const { admin, familyId } = await getAuthorizedStorageContext(user.id, profileId);
    const draftId = crypto.randomUUID();
    const image = await generateTransparentImage(
      buildPrompt({
        label,
        locale,
        category: body.category,
        stylePreset: body.stylePreset,
      })
    );

    const extension = getExtension(image.mimeType);
    const storagePath = buildTileImageDraftPath(familyId, profileId, draftId, extension);
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
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Image draft generation failed', 500);
  }
});
