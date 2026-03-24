export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
