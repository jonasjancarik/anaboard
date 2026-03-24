import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { generateJsonText } from '../_shared/gemini.ts';
import { requireUser } from '../_shared/supabase.ts';

type Candidate = {
  tileId: string;
  label: string;
  category?: string;
};

type RequestBody = {
  locale?: string;
  sentenceTileIds?: string[];
  sentenceLabels?: string[];
  candidates?: Candidate[];
  limit?: number;
};

type GeminiSuggestion = {
  tileId?: string;
  confidence?: number;
  reason?: string;
};

const clampConfidence = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
};

const buildPrompt = (body: Required<Pick<RequestBody, 'locale'>> & Required<Pick<RequestBody, 'sentenceLabels' | 'candidates'>> & RequestBody) => {
  const candidateLines = body.candidates.map((candidate) =>
    `- ${candidate.tileId}: ${candidate.label}${candidate.category ? ` (${candidate.category})` : ''}`
  );

  return [
    'You rerank AAC next-tile suggestions for a child communication board.',
    `Locale: ${body.locale}`,
    `Current sentence: ${body.sentenceLabels.join(' | ') || '(empty)'}`,
    'Candidates:',
    ...candidateLines,
    'Return valid JSON with this exact shape:',
    '{"suggestions":[{"tileId":"tile-1","confidence":0.8,"reason":"short reason"}]}',
    'Rules:',
    '- Only return tileId values from the candidate list.',
    '- Return at most the requested limit.',
    '- No prose, no markdown.',
    '- Confidence must be between 0 and 1.',
    '- Optimize for preschool AAC continuation quality.',
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
    const candidates = body.candidates ?? [];
    const locale = body.locale?.trim() || 'cs-CZ';
    const limit = Math.max(1, Math.min(body.limit ?? 3, candidates.length || 3));
    const sentenceLabels = body.sentenceLabels ?? [];
    const allowedTileIds = new Set(candidates.map((candidate) => candidate.tileId));

    if (candidates.length === 0) {
      return jsonResponse({
        suggestions: [],
        provider: 'gemini',
      });
    }

    const result = await generateJsonText<{ suggestions?: GeminiSuggestion[] }>(
      buildPrompt({
        locale,
        sentenceLabels,
        candidates,
      })
    );

    return jsonResponse({
      suggestions: (result.suggestions ?? [])
        .filter((suggestion) => suggestion.tileId && allowedTileIds.has(suggestion.tileId))
        .slice(0, limit)
        .map((suggestion) => ({
          tileId: suggestion.tileId,
          confidence: clampConfidence(suggestion.confidence),
          reason: suggestion.reason?.trim() || undefined,
        })),
      provider: 'gemini',
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Autocomplete rerank failed', 500);
  }
});
