import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

import { corsHeaders, errorResponse, errorResponseFromError, jsonResponse } from '../_shared/cors.ts';
import { getAuthorizedStorageContext } from '../_shared/context.ts';
import { generateTransparentImage, getOpenAIImageModel } from '../_shared/openai.ts';
import {
  buildAnonymousTileImageDraftPath,
  buildTileImageDraftPath,
  TILE_IMAGES_BUCKET,
} from '../_shared/storage.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';
import {
  buildTileImagePrompt,
  describeTileMeaning,
  TILE_IMAGE_PROMPT_VERSION,
  type TileMeaning,
} from '../_shared/tileImagePrompt.ts';
import {
  assertImageGenerationEnabled,
  completeImageGenerationEvent,
  consumeImageGenerationQuota,
} from '../_shared/trialQuota.ts';

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

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let quotaAdmin: SupabaseClient | null = null;
  let quotaEventId: string | null = null;
  let draftStoragePath: string | null = null;

  try {
    const user = await requireUser(request);
    assertImageGenerationEnabled();

    const body = (await request.json()) as RequestBody;

    const profileId = body.profileId?.trim();
    const tileId = body.tileId?.trim();
    const label = body.label?.trim();
    const locale = body.locale?.trim() || 'cs-CZ';

    if (!tileId || !label) {
      return errorResponse('tileId and label are required');
    }

    if (!user.isAnonymous && !profileId) {
      return errorResponse('profileId is required for signed-in image generation');
    }

    const storageContext =
      profileId && !user.isAnonymous
        ? await getAuthorizedStorageContext(user.id, profileId)
        : {
            admin: createAdminClient(),
            familyId: null,
          };
    const admin = storageContext.admin;
    quotaAdmin = admin;

    const draftId = crypto.randomUUID();
    const quota = await consumeImageGenerationQuota({
      admin,
      userId: user.id,
      familyId: storageContext.familyId,
      profileId: profileId ?? null,
      isAnonymous: user.isAnonymous,
      labelLength: label.length,
      locale,
      category: body.category,
      promptVersion: TILE_IMAGE_PROMPT_VERSION,
      model: getOpenAIImageModel(),
    });
    quotaEventId = quota.eventId;

    const promptInput = { label, locale, category: body.category };
    let meaning: TileMeaning | null = null;
    try {
      meaning = await describeTileMeaning(promptInput);
    } catch (meaningError) {
      console.warn(
        'tile meaning lookup failed, using label-only prompt',
        meaningError instanceof Error ? meaningError.message : meaningError
      );
    }

    const image = await generateTransparentImage(buildTileImagePrompt(promptInput, meaning));

    const extension = getExtension(image.mimeType);
    const storagePath =
      profileId && !user.isAnonymous
        ? buildTileImageDraftPath(storageContext.familyId as string, profileId, draftId, extension)
        : buildAnonymousTileImageDraftPath(user.id, draftId, extension);
    draftStoragePath = storagePath;

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

    await completeImageGenerationEvent({
      admin,
      eventId: quota.eventId,
      status: 'succeeded',
      draftStoragePath: storagePath,
    });

    return jsonResponse({
      draftId,
      storagePath,
      signedUrl: signedUrlData.signedUrl,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      provider: 'openai',
      promptVersion: TILE_IMAGE_PROMPT_VERSION,
      trialRemaining: quota.anonymousLifetimeRemaining,
      quota: {
        rateLimitRemaining: quota.rateLimitRemaining,
        signedInDailyRemaining: quota.signedInDailyRemaining,
        signedInMonthlyRemaining: quota.signedInMonthlyRemaining,
        familyDailyRemaining: quota.familyDailyRemaining,
        familyMonthlyRemaining: quota.familyMonthlyRemaining,
      },
    });
  } catch (error) {
    await completeImageGenerationEvent({
      admin: quotaAdmin,
      eventId: quotaEventId,
      status: 'failed',
      draftStoragePath,
      errorMessage: error instanceof Error ? error.message : 'Image draft generation failed',
    });

    return errorResponseFromError(error, 'Image draft generation failed');
  }
});
