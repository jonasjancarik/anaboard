import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { generateJsonText } from '../_shared/openai.ts';
import { requireUser } from '../_shared/supabase.ts';

type RequestBody = {
  label?: string;
  locale?: string;
  category?: string;
  existingEmoji?: string;
};

type ProviderSuggestion = {
  value?: string;
  confidence?: number;
  reason?: string;
};

const MAX_SUGGESTIONS = 5;

const clampConfidence = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
};

const sanitizeSuggestions = (suggestions: ProviderSuggestion[]) => {
  const seen = new Set<string>();

  return suggestions
    .map((suggestion) => ({
      value: suggestion.value?.trim() ?? '',
      confidence: clampConfidence(suggestion.confidence),
      reason: suggestion.reason?.trim() || undefined,
    }))
    .filter((suggestion) => {
      if (!suggestion.value || /\s/.test(suggestion.value) || seen.has(suggestion.value)) {
        return false;
      }

      seen.add(suggestion.value);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
};

const buildPrompt = ({ label, locale, category, existingEmoji }: Required<Pick<RequestBody, 'label' | 'locale'>> & RequestBody) => {
  return [
    'You suggest emoji for AAC tiles for kids and caregivers.',
    `Label: ${label}`,
    `Locale: ${locale}`,
    category ? `Category: ${category}` : 'Category: unknown',
    existingEmoji ? `Existing emoji: ${existingEmoji}` : 'Existing emoji: none',
    'Return valid JSON with this exact shape:',
    '{"suggestions":[{"value":"🍌","confidence":0.95,"reason":"short reason"}]}',
    'Rules:',
    '- Suggest at most 5 emoji.',
    '- Prefer standard single emoji or short emoji sequences.',
    '- No words, no markdown, no prose.',
    '- Confidence must be between 0 and 1.',
    '- Optimize for preschool AAC clarity.',
  ].join('\n');
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    await requireUser(request);

    const body = (await request.json()) as RequestBody;
    const label = body.label?.trim();
    const locale = body.locale?.trim() || 'cs-CZ';

    if (!label) {
      return errorResponse('Label is required');
    }

    const result = await generateJsonText<{ suggestions?: ProviderSuggestion[] }>({
      prompt: buildPrompt({
        label,
        locale,
        category: body.category,
        existingEmoji: body.existingEmoji,
      }),
      schemaName: 'emoji_suggestions',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          suggestions: {
            type: 'array',
            maxItems: MAX_SUGGESTIONS,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                value: { type: 'string' },
                confidence: { type: 'number' },
                reason: { type: 'string' },
              },
              required: ['value', 'confidence'],
            },
          },
        },
        required: ['suggestions'],
      },
    });

    return jsonResponse({
      suggestions: sanitizeSuggestions(result.suggestions ?? []),
      provider: 'openai',
      cached: false,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Emoji suggestion failed', 500);
  }
});
