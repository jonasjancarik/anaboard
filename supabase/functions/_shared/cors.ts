export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const jsonResponse = (body: unknown, init?: ResponseInit): Response => {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
};

export const errorResponse = (message: string, status = 400): Response => {
  return jsonResponse(
    {
      error: message,
    },
    {
      status,
    }
  );
};

export const errorResponseFromError = (
  error: unknown,
  fallbackMessage: string,
  fallbackStatus = 500
): Response => {
  if (error instanceof HttpError) {
    return errorResponse(error.message, error.status);
  }

  return errorResponse(
    error instanceof Error ? error.message : fallbackMessage,
    fallbackStatus
  );
};
