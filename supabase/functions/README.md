# Supabase Functions

AnaBoard AI endpoints live here.

## Required secrets

Set before deploy:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional:

- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`

## Check locally

```bash
npm run functions:check
```

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
supabase functions deploy ai-autocomplete-rerank
supabase functions deploy ai-image-draft-generate
supabase functions deploy ai-image-draft-promote
```

## Notes

- Functions assume authenticated caregiver access.
- Image drafts use the existing private `tile-images` bucket under `ai-drafts/`.
- Generated drafts are promoted into the final tile path on acceptance.
- Image generation uses OpenAI `gpt-image-1.5` with transparent PNG output.
