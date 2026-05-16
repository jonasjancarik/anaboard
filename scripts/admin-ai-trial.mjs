#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ENV_FILE = path.join(PROJECT_ROOT, 'supabase', 'functions', '.env.local');
// Keep in sync with supabase/functions/_shared/trialQuota.ts.
const IMAGE_GENERATION_LIMIT = 10;

const printUsage = () => {
  console.log(`Usage:
  npm run admin:ai-trial -- list
  npm run admin:ai-trial -- show --user-id <uuid>
  npm run admin:ai-trial -- show --email <caregiver@email>
  npm run admin:ai-trial -- reset --user-id <uuid>
  npm run admin:ai-trial -- set-used --user-id <uuid> --count <number>

Options:
  --user-id <uuid>   Auth user id. Best for anonymous trial users.
  --email <email>    Resolve caregiver auth user via public caregivers table.
  --count <number>   Used by set-used.
  --page <number>    Used by list. Defaults to 1.
  --per-page <n>     Used by list. Defaults to 50.
  --all              Used by list. Walk pages until done.
  --env-file <path>  Defaults to supabase/functions/.env.local.
  --json             JSON output.
  --help             Show help.
`);
};

const parseArgs = (argv) => {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === 'json' || key === 'help' || key === 'all') {
      options[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return {
    command: positionals[0] ?? null,
    options,
  };
};

const stripQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const env = {};

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = stripQuotes(rawValue);
  }

  return env;
};

const resolveConfig = (envFilePath) => {
  const fileEnv = loadEnvFile(envFilePath);
  const mergedEnv = {
    ...fileEnv,
    ...process.env,
  };

  const supabaseUrl = mergedEnv.SUPABASE_URL;
  const serviceRoleKey =
    mergedEnv.SB_SECRET_KEY || mergedEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(`Missing SUPABASE_URL. Checked ${envFilePath} and process env.`);
  }

  if (!serviceRoleKey) {
    throw new Error(
      `Missing SB_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Checked ${envFilePath} and process env.`
    );
  }

  return {
    envFilePath,
    serviceRoleKey,
    supabaseUrl: supabaseUrl.replace(/\/+$/u, ''),
  };
};

const createHeaders = (serviceRoleKey) => ({
  apikey: serviceRoleKey,
  authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
});

const requestJson = async (url, options) => {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new Error(`Expected JSON response from ${url}, got: ${text.slice(0, 200)}`);
      }
    }
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'msg' in payload &&
      typeof payload.msg === 'string'
        ? payload.msg
        : payload &&
            typeof payload === 'object' &&
            'message' in payload &&
            typeof payload.message === 'string'
          ? payload.message
          : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload;
};

const getUser = async (config, userId) => {
  return requestJson(
    `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'GET',
      headers: createHeaders(config.serviceRoleKey),
    }
  );
};

const listUsersPage = async (config, page, perPage) => {
  const query = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });

  return requestJson(
    `${config.supabaseUrl}/auth/v1/admin/users?${query.toString()}`,
    {
      method: 'GET',
      headers: createHeaders(config.serviceRoleKey),
    }
  );
};

const updateUser = async (config, userId, body) => {
  return requestJson(
    `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      headers: createHeaders(config.serviceRoleKey),
      body: JSON.stringify(body),
    }
  );
};

const canonicalizeEmail = (value) => {
  const original = value.trim();
  const lowered = original.toLowerCase();
  const atIndex = lowered.lastIndexOf('@');

  if (atIndex <= 0 || atIndex === lowered.length - 1) {
    return lowered;
  }

  const localPart = lowered.slice(0, atIndex);
  const domain = lowered.slice(atIndex + 1);

  if (domain !== 'gmail.com' && domain !== 'googlemail.com') {
    return `${localPart}@${domain}`;
  }

  return `${localPart.split('+', 1)[0].replace(/\./g, '')}@gmail.com`;
};

const resolveUserIdByCaregiverEmail = async (config, email) => {
  const canonicalEmail = canonicalizeEmail(email);
  const query = new URLSearchParams({
    select: 'id,email,email_canonical',
    email_canonical: `eq.${canonicalEmail}`,
  });
  let rows;

  try {
    rows = await requestJson(
      `${config.supabaseUrl}/rest/v1/caregivers?${query.toString()}`,
      {
        method: 'GET',
        headers: createHeaders(config.serviceRoleKey),
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('email_canonical')) {
      throw error;
    }

    const legacyQuery = new URLSearchParams({
      select: 'id,email',
      email: `eq.${email.trim()}`,
    });
    rows = await requestJson(
      `${config.supabaseUrl}/rest/v1/caregivers?${legacyQuery.toString()}`,
      {
        method: 'GET',
        headers: createHeaders(config.serviceRoleKey),
      }
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Caregiver not found for email ${email}`);
  }

  if (rows.length > 1) {
    throw new Error(`Multiple caregivers found for email ${email}`);
  }

  return rows[0].id;
};

const getTrialUsage = (user) => {
  const metadata = user?.app_metadata;
  const trial =
    metadata && typeof metadata.anaboard_trial === 'object' && metadata.anaboard_trial
      ? metadata.anaboard_trial
      : null;
  const imageGenerationsUsed =
    typeof trial?.image_generations_used === 'number'
      ? trial.image_generations_used
      : 0;

  return {
    imageGenerationsRemaining: Math.max(0, IMAGE_GENERATION_LIMIT - imageGenerationsUsed),
    imageGenerationsUsed,
  };
};

const buildUpdatedAppMetadata = (user, imageGenerationsUsed) => {
  const currentMetadata =
    user?.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata : {};
  const currentTrial =
    currentMetadata.anaboard_trial &&
    typeof currentMetadata.anaboard_trial === 'object'
      ? currentMetadata.anaboard_trial
      : {};

  return {
    ...currentMetadata,
    anaboard_trial: {
      ...currentTrial,
      image_generations_used: imageGenerationsUsed,
    },
  };
};

const inferAnonymous = (user) => {
  if (typeof user?.is_anonymous === 'boolean') {
    return user.is_anonymous;
  }

  if (Array.isArray(user?.identities)) {
    return user.identities.some((identity) => identity?.provider === 'anonymous');
  }

  return false;
};

const summarizeUser = (user) => {
  const usage = getTrialUsage(user);

  return {
    email: user.email ?? null,
    imageGenerationLimit: IMAGE_GENERATION_LIMIT,
    imageGenerationsRemaining: usage.imageGenerationsRemaining,
    imageGenerationsUsed: usage.imageGenerationsUsed,
    isAnonymous: inferAnonymous(user),
    lastSignInAt: user.last_sign_in_at ?? null,
    userId: user.id,
  };
};

const printSummary = (summary, asJson) => {
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`user_id: ${summary.userId}`);
  console.log(`email: ${summary.email ?? '-'}`);
  console.log(`anonymous: ${summary.isAnonymous ? 'yes' : 'no'}`);
  console.log(`used: ${summary.imageGenerationsUsed}/${summary.imageGenerationLimit}`);
  console.log(`remaining: ${summary.imageGenerationsRemaining}`);
  console.log(`last_sign_in_at: ${summary.lastSignInAt ?? '-'}`);
};

const printUsers = (users, asJson) => {
  const summaries = users.map((user) => summarizeUser(user));

  if (asJson) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  for (const summary of summaries) {
    console.log(
      [
        summary.userId,
        summary.email ?? '-',
        summary.isAnonymous ? 'anonymous' : 'registered',
        `used=${summary.imageGenerationsUsed}`,
        `remaining=${summary.imageGenerationsRemaining}`,
      ].join('\t')
    );
  }
};

const parseCount = (value) => {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`Invalid count: ${value}`);
  }

  return count;
};

const parsePositiveCount = (value, name) => {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return count;
};

const resolveTargetUserId = async (config, options) => {
  if (options['user-id'] && options.email) {
    throw new Error('Use either --user-id or --email, not both.');
  }

  if (options['user-id']) {
    return options['user-id'];
  }

  if (options.email) {
    return resolveUserIdByCaregiverEmail(config, options.email);
  }

  throw new Error('Missing target user. Pass --user-id or --email.');
};

const main = async () => {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (options.help || !command) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const envFilePath = path.resolve(options['env-file'] || DEFAULT_ENV_FILE);
  const config = resolveConfig(envFilePath);

  if (command === 'list') {
    const page = options.all ? 1 : parsePositiveCount(options.page ?? '1', 'page');
    const perPage = parsePositiveCount(options['per-page'] ?? '50', 'per-page');
    const users = [];

    if (options.all) {
      let nextPage = 1;

      while (true) {
        const payload = await listUsersPage(config, nextPage, perPage);
        const pageUsers = Array.isArray(payload?.users) ? payload.users : [];
        users.push(...pageUsers);

        if (pageUsers.length < perPage) {
          break;
        }

        nextPage += 1;
      }
    } else {
      const payload = await listUsersPage(config, page, perPage);
      users.push(...(Array.isArray(payload?.users) ? payload.users : []));
    }

    printUsers(users, Boolean(options.json));
    return;
  }

  const userId = await resolveTargetUserId(config, options);

  if (command === 'show') {
    const user = await getUser(config, userId);
    printSummary(summarizeUser(user), Boolean(options.json));
    return;
  }

  if (command === 'reset' || command === 'set-used') {
    const nextUsed =
      command === 'reset' ? 0 : parseCount(options.count);
    const currentUser = await getUser(config, userId);
    const updatedUser = await updateUser(config, userId, {
      app_metadata: buildUpdatedAppMetadata(currentUser, nextUsed),
    });

    printSummary(summarizeUser(updatedUser), Boolean(options.json));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
