# AnaBoard LLM V1 Design

Last updated: 2026-03-24

## Goal

Add small, caregiver-facing AI assists without making the core AAC board depend on network or model availability.

V1 target features:

1. Label -> emoji suggestion.
2. AI-assisted autocomplete rerank.
3. Generated tile image fallback when emoji is weak or missing.

Non-goals for V1:

- No child-facing freeform chat.
- No model dependence for core board operation.
- No automatic tile creation on the child board.
- No direct API keys in the app.

## Current repo fit

Existing app shape already supports most of the storage/sync side:

- Local-first tile/media model in `src/shared/storage/*`.
- Tile visuals already support `emoji` vs `image`.
- Tile image sync already uses Supabase Storage.
- Schema already provisions private buckets:
  - `audio-clips`
  - `tile-images`

Relevant files:

- `src/features/caregiver/screens/EditorScreen.tsx`
- `src/features/board/utils/phraseSuggestions.ts`
- `src/shared/components/TileVisual.tsx`
- `src/features/sync/supabaseMediaSync.ts`
- `src/features/sync/syncService.ts`
- `supabase/schema.sql`

Important current detail:

- `TileVisual` can render:
  - local image URI
  - full URL in `imageRemotePath`
- It cannot directly render a plain Supabase storage object path like `family/profile/tile.png`.
- Therefore, when accepting a generated image, the app should store:
  - `imageRemotePath`: storage object path
  - `imageLocalUri`: locally persisted copy for immediate rendering

## Recommendation: repo structure

Do not switch to a full monorepo yet.

Reason:

- One mobile app only.
- AI backend small.
- Supabase already lives in this repo.
- Cheapest dev path: mobile app + Edge Functions in one repo.

Add to this repo:

```text
docs/
  llm-v1-design.md
supabase/
  config.toml
  functions/
    ai-emoji-suggest/
      index.ts
    ai-autocomplete-rerank/
      index.ts
    ai-image-draft-generate/
      index.ts
    ai-image-draft-promote/
      index.ts
src/
  features/
    ai/
      aiClient.ts
      featureFlags.ts
      imageDraftService.ts
  shared/
    ai/
      contracts.ts
```

Revisit monorepo only if one of these becomes true:

- separate admin/web app
- many functions/workers
- shared contracts across multiple deployables
- separate ownership/release cadence

## Why proxy / server functions

Do not call OpenAI directly from the app.

Reasons:

- API keys must not ship in mobile/web clients.
- Expo `EXPO_PUBLIC_*` values are readable in client bundles.
- AI calls need server-side auth, spend control, prompt shaping, and abuse protection.

Official references:

- Expo env safety: <https://docs.expo.dev/eas/environment-variables/manage/>
- Supabase Edge Functions: <https://supabase.com/docs/guides/functions>
- OpenAI images: <https://platform.openai.com/docs/guides/images>

## Backend choice

Use Supabase Edge Functions first.

Why:

- already in project stack
- easy auth integration via Supabase JWT
- secrets supported server-side
- close to existing storage buckets
- simple enough for low-throughput caregiver tools

Do not add a separate Node server in V1 unless one of these happens:

- function cold starts become a real UX problem
- image post-processing becomes heavy
- background jobs / queues become necessary
- provider orchestration becomes complex

## Provider choice

OpenAI is the provider for this iteration.

Expected usage:

- emoji suggestion: text response
- autocomplete rerank: text/JSON response
- image generation: OpenAI returns base64 image data; the function stores the result in Supabase Storage

Important:

- The model does not host the final image for AnaBoard.
- The function must upload the image bytes to AnaBoard-controlled cloud storage.

Official reference:

- OpenAI image generation supports transparent backgrounds and returns image data for app-controlled storage: <https://platform.openai.com/docs/guides/images/image-generation>

## Supabase limits and cost notes

What matters for design:

- app <-> function requests should stay JSON-only and small
- do not return image bytes to the app
- return storage paths and signed preview URLs instead

At the time of writing:

- Supabase Edge Functions docs list limits like memory/time/bundle size, not a 256 KB message cap for Edge Functions: <https://supabase.com/docs/guides/functions/limits>
- Supabase Functions pricing: <https://supabase.com/docs/guides/functions/pricing>
- Supabase billing/storage overview: <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Supabase storage bandwidth doc: <https://supabase.com/docs/guides/storage/serving/bandwidth>
- OpenAI image model docs: <https://platform.openai.com/docs/models/gpt-image-1.5>

Design assumption:

- small JSON requests/responses only
- no base64 image transfer through the app
- generated image bytes handled server-side only

That keeps request size risk low.

## Product rules

Hard rules:

- AI is caregiver-only in V1.
- AI should be optional and failure-tolerant.
- Child board must remain usable offline.
- AI suggestions must be reviewable before acceptance.
- No silent overwrite of caregiver-chosen images.

Trust rules:

- emoji suggestion: never auto-apply
- autocomplete: only rerank existing tiles
- image generation: explicit user action
- suggested new tiles: later, caregiver inbox/review only

## Feature order

### 1. Emoji suggestion

Best first feature.

Why:

- low payload
- cheap
- low risk
- clear caregiver value

UI:

- in tile editor, label field section
- button: `Navrhnout emoji`
- show 3-5 chips
- tap chip -> preview emoji
- still requires save

### 2. Autocomplete rerank

Use AI only as an overlay on top of the current deterministic scorer in `src/features/board/utils/phraseSuggestions.ts`.

Rules:

- local scorer always runs
- AI only reranks a constrained candidate set
- candidate set must be existing tiles only
- no freeform generated text shown to child

### 3. Generated tile image

Use only when caregiver explicitly requests it.

UI:

- in tile visual options
- action: `Vygenerovat obrázek`
- show preview card/sheet
- actions:
  - `Použít`
  - `Zkusit znovu`
  - `Zrušit`

No auto-save on generation.

## Proposed function endpoints

### `ai-emoji-suggest`

Purpose:

- map a tile label to a few likely emoji options

Request:

```json
{
  "label": "banan",
  "locale": "cs-CZ",
  "category": "food",
  "existingEmoji": "🍌"
}
```

Response:

```json
{
  "suggestions": [
    { "value": "🍌", "confidence": 0.95, "reason": "direct match" },
    { "value": "🥭", "confidence": 0.23, "reason": "fruit alternative" }
  ],
  "provider": "openai",
  "cached": false
}
```

### `ai-autocomplete-rerank`

Purpose:

- choose the best next tiles from an already constrained candidate set

Request:

```json
{
  "locale": "cs-CZ",
  "sentenceTileIds": ["tile-ja", "tile-chci"],
  "sentenceLabels": ["já", "chci"],
  "candidates": [
    { "tileId": "tile-pit", "label": "pít", "category": "needs" },
    { "tileId": "tile-jit", "label": "jít", "category": "social" },
    { "tileId": "tile-banan", "label": "banan", "category": "food" }
  ],
  "limit": 3
}
```

Response:

```json
{
  "suggestions": [
    { "tileId": "tile-pit", "confidence": 0.82, "reason": "common continuation" },
    { "tileId": "tile-banan", "confidence": 0.44, "reason": "object after desire verb" }
  ],
  "provider": "openai"
}
```

Rule:

- function must only return `tileId` values from the input candidate list

### `ai-image-draft-generate`

Purpose:

- generate an emoji-like/pictogram-like tile image preview

Request:

```json
{
  "tileId": "tile-banan",
  "label": "banan",
  "locale": "cs-CZ",
  "category": "food",
  "stylePreset": "warm-flat-pictogram-v1"
}
```

Response:

```json
{
  "draftId": "draft_123",
  "storagePath": "family-id/profile-id/ai-drafts/draft_123.png",
  "signedUrl": "https://....",
  "mimeType": "image/png",
  "width": 1024,
  "height": 1024,
  "provider": "openai",
  "promptVersion": "tile-image-v1-openai"
}
```

### `ai-image-draft-promote`

Purpose:

- accept a generated draft and turn it into the tile's real remote image

Request:

```json
{
  "tileId": "tile-banan",
  "draftId": "draft_123",
  "draftStoragePath": "family-id/profile-id/ai-drafts/draft_123.png"
}
```

Response:

```json
{
  "storagePath": "family-id/profile-id/tile-banan.png",
  "signedUrl": "https://...."
}
```

## Storage design

Reuse the existing private `tile-images` bucket.

Do not create a second bucket for generated images in V1.

Object paths:

- final tile image:
  - `{familyId}/{profileId}/{tileId}.png`
- temporary AI draft:
  - `{familyId}/{profileId}/ai-drafts/{draftId}.png`

Why drafts:

- preview before accept
- avoid overwriting current icon during generation
- easy cleanup policy later

Cleanup policy:

- V1: manual/lazy cleanup acceptable
- later: scheduled cleanup of `ai-drafts/` older than 24h or 7d

## Image generation flow

### Generate draft

1. Caregiver taps `Vygenerovat obrázek`.
2. App calls `ai-image-draft-generate`.
3. Function calls OpenAI.
4. OpenAI returns base64 image data.
5. Function uploads bytes to `tile-images/{familyId}/{profileId}/ai-drafts/{draftId}.png`.
6. Function returns:
   - `draftId`
   - `storagePath`
   - short-lived signed URL for preview
7. App shows preview via signed URL.

### Accept draft

1. Caregiver taps `Použít`.
2. App calls `ai-image-draft-promote`.
3. Function copies/moves draft object to final tile path.
4. Function returns final `storagePath` and signed URL.
5. App persists the signed URL locally into managed media.
6. App updates tile with:
   - `visualType: "image"`
   - `imageRemotePath: final storage path`
   - `imageLocalUri: persisted local copy`
7. Caregiver presses normal `Uložit`.

### Why local persistence on accept

The app needs immediate local rendering.

Best implementation:

- use the signed URL returned by the function
- download/persist locally using the same managed-media flow already used for remote assets
- store both remote path and local URI on the tile draft before save

## Text prompt strategy

Use strict style presets, not freeform styling.

Single V1 preset:

- `warm-flat-pictogram-v1`

Prompt goals:

- child-friendly
- calm
- simple silhouette
- centered composition
- minimal background clutter
- no text
- no multiple objects unless required
- no photorealism

Example prompt skeleton:

```text
Create one square AAC tile illustration for the Czech label "{label}".
Style: warm, calm, child-friendly flat pictogram.
Single main object. Clean centered composition. Soft edges. Soft color palette.
No text, no letters, no watermark, no frame, no busy background.
White or transparent-looking plain background.
Make the object instantly recognizable for a preschool child.
```

Guardrails:

- always square output
- fixed max size, e.g. 512x512
- prefer PNG or WEBP
- reject provider text-only responses for image endpoint

## Auth and security

Use authenticated Supabase calls only.

Expected function protections:

- verify Supabase JWT
- map requester to caregiver/family/profile
- store objects only inside that family path
- no client-supplied arbitrary bucket/path writes
- rate limit by caregiver ID and family ID
- log minimal metadata only

V1 scope restriction:

- signed-in caregivers only
- if signed out, AI controls hidden or disabled

## Client feature flags

Add local feature flags:

- `aiEmojiSuggestions`
- `aiAutocompleteRerank`
- `aiGeneratedTileImages`

Gate by:

- signed-in
- online
- feature enabled

Optional later gate:

- remote-config rollout by family or beta cohort

## UI states

### Emoji suggestion states

- idle
- loading
- success with chips
- empty result
- error

Behavior:

- do not block tile editing
- hide error behind small helper text, not modal

### Autocomplete states

- local deterministic suggestions always available
- AI rerank pending
- rerank accepted silently only if response arrives quickly and confidence is above threshold
- otherwise keep local order

Suggested threshold:

- only reorder when top candidate confidence is significantly above others

### Image generation states

- idle
- generating
- preview ready
- apply in progress
- error

Behavior:

- generation should not auto-save tile
- previous tile image remains active until caregiver accepts

## Fallback rules

Hard fallback rules:

- if network fails: keep current local UX
- if function times out: keep current local UX
- if model returns invalid shape: discard, log, keep current local UX
- if image generation fails: stay on emoji/photo path
- if user is offline/signed-out: do not expose AI-dependent flows as primary actions

Autocomplete fallback:

- local scorer remains source of truth
- AI may rerank only when response arrives within a short timeout

Suggested timeout:

- emoji suggestion: ~4s
- autocomplete rerank: ~400-800ms budget
- image generation: longer, explicit spinner acceptable

## Caching

Useful cheap caches:

- emoji suggestion cache by normalized `label + locale + category`
- image draft metadata in local editor state only
- optional server cache for frequent label -> emoji pairs

Do not cache:

- full phrase history prompts server-side unless clearly needed

## Privacy

Minimize data sent to AI providers.

For emoji suggestion:

- send only label/category/locale

For autocomplete:

- send sentence labels and constrained candidate labels
- avoid whole profile history in provider prompt

For image generation:

- send only tile label/category/locale/style preset

Avoid sending:

- caregiver email
- family name
- profile name unless truly necessary
- raw long-term phrase history

## Cheap implementation path

### Phase 1

- add `supabase/config.toml`
- add Edge Function local dev setup
- add shared contracts in `src/shared/ai/contracts.ts`
- add `src/features/ai/aiClient.ts`
- add feature flags

### Phase 2

- implement `ai-emoji-suggest`
- wire editor UI chips
- add local timeout + error handling

### Phase 3

- implement `ai-autocomplete-rerank`
- keep current deterministic scorer as baseline
- rerank only constrained candidates

### Phase 4

- implement `ai-image-draft-generate`
- implement `ai-image-draft-promote`
- wire preview/apply flow in tile editor
- persist local image copy on accept

### Phase 5

- add basic analytics:
  - suggestion requested
  - suggestion accepted
  - suggestion rejected
  - image generated
  - image applied

## Open questions

1. Signed-in only for all AI, or allow emoji suggestion without account via another backend path?
2. OpenAI only, or provider abstraction from day 1?
3. Do we want one fixed visual preset or 2-3 presets for caregiver choice?
4. How aggressive should autocomplete reranking be before it feels unstable?
5. Should accepted generated images immediately replace local draft image, or wait until tile save?

## Initial recommendation

Choose the smallest path:

1. Same repo.
2. Supabase Edge Functions.
3. Reuse existing `tile-images` bucket.
4. Emoji suggestion first.
5. Autocomplete rerank second.
6. Generated image drafts third.

This keeps V1 cheap, reversible, and aligned with the app's local-first architecture.

## References

- Expo env variable safety:
  - <https://docs.expo.dev/eas/environment-variables/manage/>
- Supabase Edge Functions:
  - <https://supabase.com/docs/guides/functions>
- Supabase Edge Functions limits:
  - <https://supabase.com/docs/guides/functions/limits>
- Supabase Edge Functions pricing:
  - <https://supabase.com/docs/guides/functions/pricing>
- Supabase billing/storage:
  - <https://supabase.com/docs/guides/platform/billing-on-supabase>
- Supabase storage bandwidth:
  - <https://supabase.com/docs/guides/storage/serving/bandwidth>
- OpenAI image generation:
  - <https://platform.openai.com/docs/guides/images/image-generation>
- OpenAI models:
  - <https://platform.openai.com/docs/models/gpt-image-1.5>
