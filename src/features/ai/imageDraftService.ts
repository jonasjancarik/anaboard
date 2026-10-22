import type {
  GenerateTileImageDraftRequest,
  GenerateTileImageDraftResponse,
  PromoteTileImageDraftRequest,
  PromoteTileImageDraftResponse,
} from '../../shared/ai/contracts';
import { persistManagedMediaFromRemoteUrl } from '../../shared/media/mediaStorage';
import { logError } from '../../shared/telemetry/logger';
import { AiUnavailableError, aiClient } from './aiClient';

const getExtension = (value: string, fallback: string): string => {
  const match = value.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? fallback;
};

export const imageDraftService = {
  async generateDraft(
    request: GenerateTileImageDraftRequest
  ): Promise<GenerateTileImageDraftResponse & { localUri: string }> {
    const draft = await aiClient.generateTileImageDraft(request);
    let localUri: string;
    try {
      localUri = await persistManagedMediaFromRemoteUrl(
        'image',
        `${request.tileId}-draft`,
        draft.signedUrl,
        getExtension(draft.storagePath, 'png')
      );
    } catch (error) {
      // Native download errors carry the signed URL; never show them to the user.
      logError('ai_image_draft_download_failed', error);
      throw new AiUnavailableError('ai-image-draft-generate');
    }

    return {
      ...draft,
      localUri,
    };
  },

  async promoteDraft(
    request: PromoteTileImageDraftRequest & { localUri?: string | null }
  ): Promise<PromoteTileImageDraftResponse & { localUri: string }> {
    const promoted = await aiClient.promoteTileImageDraft(request);
    let localUri = request.localUri;
    if (!localUri) {
      try {
        localUri = await persistManagedMediaFromRemoteUrl(
          'image',
          request.tileId,
          promoted.signedUrl,
          getExtension(promoted.storagePath, 'png')
        );
      } catch (error) {
        logError('ai_image_promote_download_failed', error);
        throw new AiUnavailableError('ai-image-draft-promote');
      }
    }

    return {
      ...promoted,
      localUri,
    };
  },
};
