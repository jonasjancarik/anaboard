import type {
  EmojiSuggestion,
  EmojiSuggestionRequest,
  EmojiSuggestionResponse,
  GenerateTileImageDraftRequest,
  GenerateTileImageDraftResponse,
  PromoteTileImageDraftRequest,
  PromoteTileImageDraftResponse,
} from '../../shared/ai/contracts';
import { hasSupabaseConfig, supabaseClient } from '../../shared/services/supabaseClient';

const EMOJI_CACHE = new Map<string, EmojiSuggestionResponse>();
const MAX_EMOJI_SUGGESTIONS = 5;

const buildEmojiCacheKey = (request: EmojiSuggestionRequest): string => {
  return JSON.stringify([
    request.label.trim().toLocaleLowerCase(request.locale),
    request.locale,
    request.category ?? '',
  ]);
};

const normalizeConfidence = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
};

const sanitizeEmojiSuggestions = (suggestions: EmojiSuggestion[]): EmojiSuggestion[] => {
  const seen = new Set<string>();

  return suggestions
    .filter((suggestion) => {
      const value = suggestion.value.trim();
      if (!value || /\s/.test(value) || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    })
    .slice(0, MAX_EMOJI_SUGGESTIONS)
    .map((suggestion) => ({
      value: suggestion.value.trim(),
      confidence: normalizeConfidence(suggestion.confidence),
      reason: suggestion.reason?.trim() || undefined,
    }));
};

const invokeFunction = async <TResponse>(
  functionName: string,
  body: unknown
): Promise<TResponse> => {
  if (!hasSupabaseConfig || !supabaseClient) {
    throw new Error('Supabase není nastavené.');
  }

  const { data, error } = await supabaseClient.functions.invoke(functionName, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    const errorWithContext = error as typeof error & {
      context?: {
        clone?: () => {
          json?: () => Promise<unknown>;
          text?: () => Promise<string>;
        };
      };
    };

    const responseClone = errorWithContext.context?.clone?.();
    let detailedMessage: string | null = null;

    if (responseClone?.json) {
      try {
        const payload = await responseClone.json();
        detailedMessage =
          payload &&
          typeof payload === 'object' &&
          'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : null;
      } catch {
        // Fall through to text/default handling.
      }
    }

    if (!detailedMessage && responseClone?.text) {
      try {
        const text = await responseClone.text();
        if (text.trim()) {
          detailedMessage = text.trim();
        }
      } catch {
        // Fall through to default handling.
      }
    }

    throw new Error(detailedMessage || error.message || `Volání AI funkce ${functionName} selhalo.`);
  }

  return data as TResponse;
};

export const aiClient = {
  async suggestEmoji(request: EmojiSuggestionRequest): Promise<EmojiSuggestionResponse> {
    const normalizedRequest: EmojiSuggestionRequest = {
      ...request,
      label: request.label.trim(),
    };

    if (!normalizedRequest.label) {
      return {
        suggestions: [],
        provider: 'openai',
        cached: false,
      };
    }

    const cacheKey = buildEmojiCacheKey(normalizedRequest);
    const cached = EMOJI_CACHE.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        cached: true,
      };
    }

    const response = await invokeFunction<EmojiSuggestionResponse>('ai-emoji-suggest', normalizedRequest);
    const normalizedResponse: EmojiSuggestionResponse = {
      suggestions: sanitizeEmojiSuggestions(response.suggestions ?? []),
      provider: response.provider ?? 'openai',
      cached: false,
    };

    EMOJI_CACHE.set(cacheKey, normalizedResponse);
    return normalizedResponse;
  },

  async generateTileImageDraft(
    request: GenerateTileImageDraftRequest
  ): Promise<GenerateTileImageDraftResponse> {
    return invokeFunction<GenerateTileImageDraftResponse>('ai-image-draft-generate', request);
  },

  async promoteTileImageDraft(
    request: PromoteTileImageDraftRequest
  ): Promise<PromoteTileImageDraftResponse> {
    return invokeFunction<PromoteTileImageDraftResponse>('ai-image-draft-promote', request);
  },
};
