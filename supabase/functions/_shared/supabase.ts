import { createClient } from 'npm:@supabase/supabase-js@2.100.0';

import { getRequiredEnv } from './env.ts';

const supabaseUrl = getRequiredEnv('SUPABASE_URL');
const getFirstEnv = (...names: string[]): string | null => {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) {
      return value;
    }
  }

  return null;
};

const requireFirstEnv = (...names: string[]): string => {
  const value = getFirstEnv(...names);
  if (!value) {
    throw new Error(`Missing required env. Tried: ${names.join(', ')}`);
  }

  return value;
};

const supabaseUserKey = requireFirstEnv('SB_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
const supabaseAdminKey = requireFirstEnv('SB_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

const getBearerToken = (request: Request): string => {
  const authorization =
    request.headers.get('Authorization') ?? request.headers.get('authorization') ?? '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new Error('Unauthorized');
  }

  return token;
};

export const createUserClient = () => {
  return createClient(supabaseUrl, supabaseUserKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const createAdminClient = () => {
  return createClient(supabaseUrl, supabaseAdminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const requireUser = async (request: Request) => {
  const client = createUserClient();
  const token = getBearerToken(request);
  const { data, error } = await client.auth.getClaims(token);
  const userId = typeof data?.claims?.sub === 'string' ? data.claims.sub : null;
  const isAnonymous = data?.claims?.is_anonymous === true;

  if (error || !userId) {
    throw new Error('Unauthorized');
  }

  return {
    id: userId,
    isAnonymous,
  };
};
