import { getOptionalEnv, getRequiredEnv } from './env.ts';

const GEMINI_API_KEY = getRequiredEnv('GEMINI_API_KEY');
const GEMINI_TEXT_MODEL = getOptionalEnv('GEMINI_TEXT_MODEL', 'gemini-2.5-flash');
const GEMINI_IMAGE_MODEL = getOptionalEnv('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image');

type GeminiTextPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
  }>;
  error?: {
    message?: string;
  };
};

const extractJsonString = (raw: string): string => {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('Gemini returned empty JSON payload');
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return trimmed.slice(firstBracket, lastBracket + 1);
  }

  return trimmed;
};

const decodeBase64 = (value: string): Uint8Array => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
};

const callGemini = async (model: string, body: Record<string, unknown>): Promise<GeminiResponse> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  const payload = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Gemini request failed');
  }

  return payload;
};

export const generateJsonText = async <T,>(prompt: string): Promise<T> => {
  const payload = await callGemini(GEMINI_TEXT_MODEL, {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
  if (!text) {
    throw new Error('Gemini did not return text');
  }

  return JSON.parse(extractJsonString(text)) as T;
};

export const generateImage = async (
  prompt: string
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  const payload = await callGemini(GEMINI_IMAGE_MODEL, {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  });

  const inlineData = payload.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.inlineData?.data === 'string'
  )?.inlineData;

  if (!inlineData?.data) {
    throw new Error('Gemini did not return image data');
  }

  return {
    bytes: decodeBase64(inlineData.data),
    mimeType: inlineData.mimeType ?? 'image/png',
  };
};
