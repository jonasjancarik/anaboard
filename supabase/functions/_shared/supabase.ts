import { createClient } from 'npm:@supabase/supabase-js@2';

import { getRequiredEnv } from './env.ts';

const supabaseUrl = getRequiredEnv('SUPABASE_URL');
const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY');

export const createUserClient = (request: Request) => {
  const authorization = request.headers.get('Authorization') ?? '';

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  });
};

export const createAdminClient = () => {
  return createClient(supabaseUrl, getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const requireUser = async (request: Request) => {
  const client = createUserClient(request);
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new Error('Unauthorized');
  }

  return data.user;
};
