# Supabase Functions

ÁňaBoard AI endpoints live here.

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
```

Repo helper:

```bash
npm run functions:secrets
npm run functions:deploy
```

Admin helper for anonymous image trial quota:

```bash
npm run admin:ai-trial -- list
npm run admin:ai-trial -- show --user-id <auth-user-uuid>
npm run admin:ai-trial -- reset --user-id <auth-user-uuid>
node ./scripts/admin-ai-trial.mjs list --json | jq -r '.[] | select(.isAnonymous) | .userId' | xargs -n1 node ./scripts/admin-ai-trial.mjs reset --user-id
```

Supports:

- `list --all` for full auth-user dump
- `set-used --count <number>` for manual overrides
- `--env-file <path>` if you do not use `supabase/functions/.env.local`
- `--email <caregiver@email>` to resolve registered caregiver ids via `caregivers.email_canonical`
- direct `node` invocation is better for JSON pipelines; `npm run` prepends banner output

## Local serve

```bash
npm run functions:serve
```

## Notes

- Functions assume authenticated caregiver access.
- Image drafts use the existing private `tile-images` bucket under `ai-drafts/`.
- Generated drafts are promoted into the final tile path on acceptance.
- Image generation uses OpenAI `gpt-image-1.5` with transparent PNG output.
- `verify_jwt` is disabled; functions verify Supabase JWTs manually from the `Authorization` header.
