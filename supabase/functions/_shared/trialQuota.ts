import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

import { HttpError } from './cors.ts';
import { getOptionalBooleanEnv, getOptionalIntEnv } from './env.ts';

const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;
const DEFAULT_RATE_LIMIT_MAX = 3;
const DEFAULT_ANONYMOUS_LIFETIME_LIMIT = 10;
const DEFAULT_SIGNED_IN_DAILY_LIMIT = 20;
const DEFAULT_FAMILY_DAILY_LIMIT = 50;
const DEFAULT_SIGNED_IN_MONTHLY_LIMIT = 200;
const DEFAULT_FAMILY_MONTHLY_LIMIT = 500;

const QUOTA_ERROR_STATUSES = new Map<string, number>([
  ['AI_IMAGE_RATE_LIMIT', 429],
  ['AI_IMAGE_ANONYMOUS_LIMIT', 429],
  ['AI_IMAGE_DAILY_LIMIT', 429],
  ['AI_IMAGE_MONTHLY_LIMIT', 429],
  ['AI_IMAGE_FAMILY_DAILY_LIMIT', 429],
  ['AI_IMAGE_FAMILY_MONTHLY_LIMIT', 429],
  ['AI_IMAGE_CONFIG_ERROR', 500],
]);

export type ImageGenerationQuota = {
  eventId: string;
  rateLimitRemaining: number | null;
  signedInDailyRemaining: number | null;
  signedInMonthlyRemaining: number | null;
  familyDailyRemaining: number | null;
  familyMonthlyRemaining: number | null;
  anonymousLifetimeRemaining: number | null;
};

type ConsumeQuotaParams = {
  admin: SupabaseClient;
  userId: string;
  familyId: string | null;
  profileId: string | null;
  isAnonymous: boolean;
  labelLength: number;
  locale: string;
  category?: string;
  promptVersion: string;
  model: string;
};

type CompleteEventParams = {
  admin: SupabaseClient | null;
  eventId: string | null;
  status: 'succeeded' | 'failed';
  draftStoragePath?: string | null;
  errorMessage?: string | null;
};

type QuotaRpcRow = {
  event_id?: string;
  rate_limit_remaining?: number | null;
  signed_in_daily_remaining?: number | null;
  signed_in_monthly_remaining?: number | null;
  family_daily_remaining?: number | null;
  family_monthly_remaining?: number | null;
  anonymous_lifetime_remaining?: number | null;
};

const normalizeRemaining = (value: number | null | undefined): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getQuotaConfig = () => ({
  rateLimitWindowSeconds: getOptionalIntEnv(
    'AI_IMAGE_RATE_LIMIT_WINDOW_SECONDS',
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS
  ),
  rateLimitMax: getOptionalIntEnv('AI_IMAGE_RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX),
  anonymousLifetimeLimit: getOptionalIntEnv(
    'AI_IMAGE_ANONYMOUS_LIFETIME_LIMIT',
    DEFAULT_ANONYMOUS_LIFETIME_LIMIT
  ),
  signedInDailyLimit: getOptionalIntEnv(
    'AI_IMAGE_SIGNED_IN_DAILY_LIMIT',
    DEFAULT_SIGNED_IN_DAILY_LIMIT
  ),
  familyDailyLimit: getOptionalIntEnv('AI_IMAGE_FAMILY_DAILY_LIMIT', DEFAULT_FAMILY_DAILY_LIMIT),
  signedInMonthlyLimit: getOptionalIntEnv(
    'AI_IMAGE_SIGNED_IN_MONTHLY_LIMIT',
    DEFAULT_SIGNED_IN_MONTHLY_LIMIT
  ),
  familyMonthlyLimit: getOptionalIntEnv(
    'AI_IMAGE_FAMILY_MONTHLY_LIMIT',
    DEFAULT_FAMILY_MONTHLY_LIMIT
  ),
});

const throwQuotaError = (message: string): never => {
  const match = message.match(/^([A-Z_]+):\s*(.+)$/);
  if (!match) {
    throw new Error(message);
  }

  const [, code, cleanMessage] = match;
  const status = QUOTA_ERROR_STATUSES.get(code);
  if (!status) {
    throw new Error(cleanMessage);
  }

  throw new HttpError(cleanMessage, status);
};

export const assertImageGenerationEnabled = () => {
  if (!getOptionalBooleanEnv('AI_IMAGE_GENERATION_ENABLED', true)) {
    throw new HttpError('AI obrázky jsou teď dočasně vypnuté.', 503);
  }
};

export const consumeImageGenerationQuota = async ({
  admin,
  userId,
  familyId,
  profileId,
  isAnonymous,
  labelLength,
  locale,
  category,
  promptVersion,
  model,
}: ConsumeQuotaParams): Promise<ImageGenerationQuota> => {
  const config = getQuotaConfig();
  const { data, error } = await admin.rpc('anaboard_consume_ai_image_generation_quota', {
    p_user_id: userId,
    p_family_id: familyId,
    p_profile_id: profileId,
    p_is_anonymous: isAnonymous,
    p_label_length: labelLength,
    p_locale: locale,
    p_category: category ?? null,
    p_prompt_version: promptVersion,
    p_model: model,
    p_rate_limit_window_seconds: config.rateLimitWindowSeconds,
    p_rate_limit_max: config.rateLimitMax,
    p_anonymous_lifetime_limit: config.anonymousLifetimeLimit,
    p_signed_in_daily_limit: config.signedInDailyLimit,
    p_family_daily_limit: config.familyDailyLimit,
    p_signed_in_monthly_limit: config.signedInMonthlyLimit,
    p_family_monthly_limit: config.familyMonthlyLimit,
  });

  if (error) {
    throwQuotaError(error.message);
  }

  const row = Array.isArray(data) ? (data[0] as QuotaRpcRow | undefined) : undefined;
  if (!row?.event_id) {
    throw new Error('Image generation quota check returned no event id');
  }

  return {
    eventId: row.event_id,
    rateLimitRemaining: normalizeRemaining(row.rate_limit_remaining),
    signedInDailyRemaining: normalizeRemaining(row.signed_in_daily_remaining),
    signedInMonthlyRemaining: normalizeRemaining(row.signed_in_monthly_remaining),
    familyDailyRemaining: normalizeRemaining(row.family_daily_remaining),
    familyMonthlyRemaining: normalizeRemaining(row.family_monthly_remaining),
    anonymousLifetimeRemaining: normalizeRemaining(row.anonymous_lifetime_remaining),
  };
};

export const completeImageGenerationEvent = async ({
  admin,
  eventId,
  status,
  draftStoragePath,
  errorMessage,
}: CompleteEventParams): Promise<void> => {
  if (!admin || !eventId) {
    return;
  }

  const { error } = await admin.rpc('anaboard_complete_ai_image_generation_event', {
    p_event_id: eventId,
    p_status: status,
    p_draft_storage_path: draftStoragePath ?? null,
    p_error_message: errorMessage ?? null,
  });

  if (error) {
    console.error('Failed to complete image generation event', error);
  }
};
