# Supabase Functions

ÁňaBoard AI endpoints and account deletion live here.

`account-delete` removes the signed-in user from Supabase Auth. When they are the last caregiver of their family it also deletes the family (cascading to profiles, boards, tiles and audio clips), the profile-keyed rows (`profile_settings`, `phrase_events`, `saved_phrases`), the family's `audio-clips` and `tile-images` folders, the user's `trials/<user>` images and their `ai_image_generation_events`. If other caregivers remain, only this caregiver is removed and family ownership moves to the next one.

## Required secrets

Set before deploy:

- `SUPABASE_URL`
- `SUPABASE_PROJECT_REF` optional override
- `SB_PUBLISHABLE_KEY`
- `SB_SECRET_KEY`
- `OPENAI_API_KEY`

Optional:

- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `AI_IMAGE_GENERATION_ENABLED` (`1` by default; set `0` as a server kill switch)
- `AI_IMAGE_RATE_LIMIT_WINDOW_SECONDS` (`60` by default)
- `AI_IMAGE_RATE_LIMIT_MAX` (`3` by default)
- `AI_IMAGE_ANONYMOUS_LIFETIME_LIMIT` (`10` by default)
- `AI_IMAGE_SIGNED_IN_DAILY_LIMIT` (`20` by default)
- `AI_IMAGE_FAMILY_DAILY_LIMIT` (`50` by default)
- `AI_IMAGE_SIGNED_IN_MONTHLY_LIMIT` (`200` by default)
- `AI_IMAGE_FAMILY_MONTHLY_LIMIT` (`500` by default)
- `SUPABASE_ANON_KEY` fallback during migration only
- `SUPABASE_SERVICE_ROLE_KEY` fallback during migration only

## Check locally

```bash
npm run functions:check
npm run functions:env
```

Current code path:

- prefers `SB_PUBLISHABLE_KEY` for JWT claim verification
- prefers `SB_SECRET_KEY` for admin database/storage access
- falls back to legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` only if the new keys are missing

## Deploy

Install Supabase CLI if missing, then:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_ANON_KEY=<anon-key> \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  OPENAI_API_KEY=<openai-api-key>
supabase functions deploy ai-emoji-suggest
supabase functions deploy ai-image-draft-generate
supabase functions deploy ai-image-draft-promote
supabase functions deploy account-delete
```

Repo helper:

```bash
npm run functions:secrets
npm run functions:deploy
```

Quota and usage inspection:

- Accepted image generation requests are logged in the private `ai_image_generation_events` table.
- The quota check is atomic in `anaboard_consume_ai_image_generation_quota(...)`.
- Function completion updates the same event through `anaboard_complete_ai_image_generation_event(...)`.
- Inspect or adjust events with service-role access only; client roles have no table policies.

## Local serve

```bash
npm run functions:serve
```

## Notes

- Functions assume authenticated caregiver access.
- Image drafts use the existing private `tile-images` bucket under `ai-drafts/`.
- Generated drafts are promoted into the final tile path on acceptance.
- Image generation uses OpenAI `gpt-image-1.5` with transparent PNG output.
- Image generation has a server-side kill switch, per-user short-window rate limit, anonymous lifetime quota, and signed-in user/family daily and monthly quotas.
- Use a dedicated OpenAI project/key budget for this feature so provider-side spend has a hard ceiling.
- `verify_jwt` is disabled; functions verify Supabase JWTs manually from the `Authorization` header.
