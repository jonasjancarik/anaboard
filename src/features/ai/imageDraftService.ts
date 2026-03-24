import type {
  GenerateTileImageDraftRequest,
  GenerateTileImageDraftResponse,
  PromoteTileImageDraftRequest,
  PromoteTileImageDraftResponse,
} from '../../shared/ai/contracts';
import { persistManagedMediaFromRemoteUrl } from '../../shared/media/mediaStorage';
import { aiClient } from './aiClient';

const getExtension = (value: string, fallback: string): string => {
  const match = value.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
  return match?.[1]?.toLowerCase() ?? fallback;
};

export const imageDraftService = {
  async generateDraft(
    request: GenerateTileImageDraftRequest
  ): Promise<GenerateTileImageDraftResponse> {
    return aiClient.generateTileImageDraft(request);
  },

  async promoteDraft(
    request: PromoteTileImageDraftRequest
  ): Promise<PromoteTileImageDraftResponse & { localUri: string }> {
    const promoted = await aiClient.promoteTileImageDraft(request);
    const localUri = await persistManagedMediaFromRemoteUrl(
      'image',
      request.tileId,
      promoted.signedUrl,
      getExtension(promoted.storagePath, 'png')
    );

    return {
      ...promoted,
      localUri,
    };
  },
};
