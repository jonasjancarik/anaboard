import { getOptionalEnv, getRequiredEnv } from './env.ts';

const OPENAI_API_KEY = getRequiredEnv('OPENAI_API_KEY');
const OPENAI_TEXT_MODEL = getOptionalEnv('OPENAI_TEXT_MODEL', 'gpt-5-mini');
const OPENAI_IMAGE_MODEL = getOptionalEnv('OPENAI_IMAGE_MODEL', 'gpt-image-1.5');

type OpenAIResponsesApiResponse = {
  error?: {
    message?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type OpenAIImageApiResponse = {
  error?: {
    message?: string;
  };
  data?: Array<{
    b64_json?: string;
  }>;
};

const decodeBase64 = (value: string): Uint8Array => {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
};

const postJson = async <TResponse>(
  url: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TResponse & {
    error?: {
      message?: string;
    };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'OpenAI request failed');
  }

  return payload;
};

const extractOutputText = (payload: OpenAIResponsesApiResponse): string => {
  const message = payload.output?.find((item) => item.type === 'message');
  const outputText = message?.content?.find((item) => item.type === 'output_text')?.text;

  if (!outputText) {
    throw new Error('OpenAI did not return structured text');
  }

  return outputText;
};

export const generateJsonText = async <T,>(params: {
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> => {
  const payload = await postJson<OpenAIResponsesApiResponse>('https://api.openai.com/v1/responses', {
    model: OPENAI_TEXT_MODEL,
    input: params.prompt,
    store: false,
    text: {
      format: {
        type: 'json_schema',
        name: params.schemaName,
        strict: true,
        schema: params.schema,
      },
    },
  });

  return JSON.parse(extractOutputText(payload)) as T;
};

export const generateTransparentImage = async (
  prompt: string
): Promise<{ bytes: Uint8Array; mimeType: string; width: number; height: number }> => {
  const payload = await postJson<OpenAIImageApiResponse>('https://api.openai.com/v1/images/generations', {
    model: OPENAI_IMAGE_MODEL,
    prompt,
    background: 'transparent',
    output_format: 'png',
    quality: 'medium',
    size: '1024x1024',
  });

  const imageBase64 = payload.data?.[0]?.b64_json;
  if (!imageBase64) {
    throw new Error('OpenAI did not return image data');
  }

  return {
    bytes: decodeBase64(imageBase64),
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
  };
};
