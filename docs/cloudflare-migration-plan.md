# Moving from Supabase to Cloudflare: plan

Last updated: 2026-10-23

Read when: deciding whether and how to move the cloud backend (sign-in, sync, media, AI functions) off Supabase.

This is decision material, not an implementation. It lists what we use from Supabase today, what would replace each piece on Cloudflare, the order to do it in, how it affects the store builds, and roughly how much work it is. Cloudflare facts were checked against the docs on 2026-10-23; limits and prices change, so recheck them before implementing.

## Summary and recommendation

- **Moving makes sense, but in stages, not all at once.** The main gain isn't "less Supabase" but a small API of our own in a Worker: configuration in code, no 1000-row limit per query, conflict checks on the server instead of in the phone, and one place where permissions live.
- **Start with cheap preparation that pays off either way** (stage 0): the app learns to ask for the minimum supported version and the address of our own API. Without that, old builds can't be retired safely.
- **Don't move file storage on its own.** Pictures and recordings are tied closely to data sync; moving only the files would split old and new builds for a while and simplify nothing. R2 and D1 belong in the same stage.
- **Move the AI functions first** (stage 1). They're small and self-contained, so the risk is low; for now the Worker checks sign-in through Supabase and reads data through Supabase.
- **Supabase Auth can stay** even after the data moves. The Worker verifies its tokens and everything else runs on Cloudflare. That's a stable state you can stay in for as long as you like. Sign-in through Better Auth on the Worker is the last, optional step: only if configuring sign-in in the Supabase dashboard keeps getting in the way, or if you want to drop Supabase entirely.
- **Timing:** start only after the seeded-board sync fix (`seedIdRekey.ts`) is released and confirmed working. We don't want two large sync changes in flight at once.

Estimate: roughly 13–21 working days in total, most of it in stage 3 (data + files). One forced app update is needed by the end of stage 3, and switching to Better Auth means everyone signs in once more with an email code.

## What we use from Supabase today

### Sign-in (Supabase Auth)

| What | Where | Notes |
| --- | --- | --- |
| Email sign-in: code + link | `src/features/auth/authService.ts` (`sendMagicLink` → `signInWithOtp`, `verifyEmailCode` → `verifyOtp`, `consumeMagicLinkUrl`) | The code is the main path, the link a fallback. See `docs/auth-email.md`. |
| Sending email | Supabase dashboard → SMTP | Already goes through Cloudflare Email Service (`prihlaseni@anaboard.jonasjancarik.cz`). Templates in `supabase/templates/`. |
| Anonymous sign-in for the AI trial | `signInAnonymously` | An anonymous user has no family and no sync, only an AI image quota. |
| Session handling | `src/shared/services/supabaseClient.ts` (AsyncStorage, automatic token refresh) | `onAuthStateChange` drives app state. |
| Account deletion | Edge function `account-delete` → `auth.admin.deleteUser` | Required by both the App Store and Google Play. |
| AI trial admin script | `scripts/admin-ai-trial.mjs` | Calls the Auth Admin API and the `caregivers` REST table; also reads the older `app_metadata.anaboard_trial` counter. |

### Database (Postgres + RLS)

The schema is in `supabase/schema.sql` and in 9 migrations under `supabase/migrations/`.

| Table | Key | Whose data | How it's protected today (RLS) |
| --- | --- | --- | --- |
| `families` | uuid | family | visible and editable by the creator (`created_by`) or a family member; only the creator may delete |
| `caregivers` | uuid = user id | caregiver | each user sees only their own row; may only join a family they created |
| `profiles` | uuid | child in the family | family member |
| `boards` | text | family (`family_id`) | family member |
| `tiles` | text | via `boards` | member of the family that owns the board |
| `audio_clips` | text | via `tiles` → `boards` | same |
| `profile_settings` | `profile_id` (text) | via `profiles` | member of the profile's family |
| `phrase_events`, `saved_phrases` | text | via `profiles` | member of the profile's family |
| `sync_events` | identity | – | RLS enabled with no policies, so the app can't reach it. Looks unused; confirm and skip during migration. |
| `ai_image_generation_events` | uuid | user / family | service role only |

Other things living in the database:

- `anaboard_canonicalize_email()` and the generated column `caregivers.email_canonical` with a unique index (Gmail addresses without dots and `+` suffixes).
- `anaboard_consume_ai_image_generation_quota()` and `anaboard_complete_ai_image_generation_event()`: PL/pgSQL functions (`security definer`) that atomically enforce the AI image limits (per minute, per day, per month, per family, and the trial's lifetime limit).
- Board and tile primary keys are shared across all families. That's why the `seedIdRekey.ts` fix exists (see `docs/sync.md`).

### Sync (client)

- `src/features/sync/remoteSyncRepository.ts` downloads the whole profile snapshot with `supabase-js` (PostgREST) queries, page by page because of the 1000-row limit. It has fallback queries for older schemas (without `child_gender`, `board_layout_mode`, etc.).
- `src/features/sync/syncService.ts` uploads the change queue as row-by-row `upsert`/`delete`. The conflict check (is the cloud row newer?) happens on the phone: it reads `updated_at` first, then writes, and the two steps aren't atomic. It also queries the `default-board` row for the seed-id fix.
- `src/features/sync/supabaseMediaSync.ts` uploads files to Storage and downloads them through signed URLs valid for 60 s.
- Background sync runs every 20 s and downloads the full snapshot each time.

### File storage

| Bucket | Path | Contents |
| --- | --- | --- |
| `tile-images` | `<family>/<profile>/<tile>.<ext>` | tile pictures |
| `tile-images` | `<family>/<profile>/ai-drafts/<draft>.<ext>` | AI picture drafts |
| `tile-images` | `trials/<user>/…` | anonymous-trial AI pictures |
| `audio-clips` | `<family>/<profile>/<clip>.<ext>` | recordings |

Both buckets are private. Policies on `storage.objects` allow access only to members of the family whose id is the first folder of the path.

### Edge functions (`supabase/functions/`, Deno)

| Function | What it does | Depends on |
| --- | --- | --- |
| `ai-emoji-suggest` | suggests emoji for a tile (OpenAI, text) | user verification |
| `ai-image-draft-generate` | generates a transparent picture (OpenAI), stores the draft, returns a signed URL valid for 10 min | DB quota, Storage, `_shared/context.ts` (the user's family and profile) |
| `ai-image-draft-promote` | moves a draft to the tile's permanent path | Storage |
| `account-delete` | deletes the family (or only the caregiver if the family is shared), its files, AI records and the user | DB, Storage, Auth Admin |

All have `verify_jwt = false` and verify the token themselves (`_shared/supabase.ts`, `auth.getClaims`). The app calls them through `supabaseClient.functions.invoke` (`src/features/ai/aiClient.ts`, `authService.deleteAccount`).

### Configuration and scripts

- `.env.example`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `…_ANON_KEY` (baked into the build).
- `supabase/functions/.env.example`: Supabase keys, `OPENAI_*`, `AI_IMAGE_*` limits.
- `supabase/config.toml`, `scripts/supabase-functions.sh`, npm scripts `functions:*`.
- `scripts/ios-testflight.sh` and `scripts/android-release-upload.sh` require the Supabase variables.
- `src/features/caregiver/screens/SettingsScreen.tsx` uses `hasSupabaseConfig`.
- The app **doesn't use `expo-updates`**, so every client change means a new build for TestFlight and Google Play.

## What replaces what

| Today (Supabase) | On Cloudflare | Notes |
| --- | --- | --- |
| PostgREST + RLS | **One Worker with a small API** (e.g. `api.anaboard.jonasjancarik.cz`) | Permissions are enforced in Worker code, see below. |
| Postgres | **D1** (recommended) or Hyperdrive + external Postgres | See "Database: D1 or Postgres". |
| Storage | **R2**, one private bucket (prefixes `tile-images/`, `audio-clips/`) or two | Same paths as today, so existing `image_remote_path` and `remote_path` values stay valid. |
| Edge functions | **Endpoints in the same Worker** | The Deno code ports almost unchanged (`Deno.env` → `env`, `Deno.serve` → `fetch`). |
| Function secrets | **Workers secrets** (`OPENAI_API_KEY` etc.) | The `AI_IMAGE_*` limits can be plain config variables. |
| Auth | Keep Supabase Auth, or **Better Auth** in the Worker on D1 | See "Sign-in options". |
| SMTP for Auth | **Email Service binding** (`send_email`) directly from the Worker | Domain and DNS are already done; only the sending method changes. |
| PL/pgSQL AI quota | Worker code + `db.batch()` in D1 (a batch is a transaction) | If the quota ever needs stronger coordination, a Durable Object per user. Not needed at today's volume. |
| `supabase-js` in the app | A small client of our own (`fetch`) | Drops a large dependency. |

### Database: D1 or Postgres

**I recommend D1.** The data is small (boards, tiles, settings, phrase history), the app itself uses SQLite so types and queries are close, and everything sits under one account and one CLI.

D1 facts (Workers Paid): databases up to 10 GB, point-in-time recovery for the last 30 days (Time Travel), 1000 queries per Worker invocation, 100 bound parameters per query, rows up to 2 MB. Included per month: 25 billion rows read, 50 million rows written and 5 GB of storage. A database can be restricted to the `eu` jurisdiction at creation (children's data, GDPR); this can't be changed afterwards. R2 supports the same (a bucket in the `eu` jurisdiction).

Things to watch when converting the schema:

- `uuid` → `text`, `timestamptz` → ISO text (as in the local SQLite), `boolean` → `integer`, `jsonb` → `text`.
- `gen_random_uuid()` and `now()` defaults move into Worker code.
- Compute `email_canonical` in the Worker (port the logic of the SQL function `anaboard_canonicalize_email`) and keep a unique index on it.
- Indexes on `boards.family_id`, `tiles.board_id`, `audio_clips.tile_id` and `*.profile_id`, so sync every 20 s doesn't scan whole tables (D1 bills by rows read).
- Consider adding a `family_id` column to `tiles`, `audio_clips`, `profile_settings`, `phrase_events` and `saved_phrases`. The permission check then becomes a simple filter instead of a join.

**Alternative: Hyperdrive + Postgres** (Neon, or temporarily the Supabase database itself). Upside: the schema and quota functions stay; only data access gets rewritten. Downside: another vendor or still Supabase, and RLS doesn't apply through Hyperdrive anyway (the Worker connects as a single role), so permissions in Worker code have to be written either way. Only worth it as an interim step if the data move has to wait.

### Where permissions get enforced (replacing RLS)

The rule stays the same: **a caregiver may read and change only their own family's data.** The difference is that the Worker enforces it on every request instead of database policies:

1. Verify the token (signature, expiry) and get `userId` plus the anonymous flag.
2. Look up `caregivers` → `family_id`. No row means 403 (except for the endpoint that creates a family).
3. Every query filters on `family_id = ?` or `profile_id IN (the family's profiles)`. The client never sends `family_id`; the Worker fills it in.
4. On writes, check that the target row either doesn't exist or belongs to the same family. This also replaces today's "RLS rejects an upsert onto another family's row".
5. Files: the R2 key must start with the caller's `family_id` (today's "first folder of the path" rule).

To avoid gaps, have one function such as `requireFamilyContext()` in the code and run family data queries only through it. Add tests that try to read and write another family's data and expect 403/404. That gives the same protection as RLS, with one caveat: a bug in the Worker is now the only safeguard, because the database itself no longer refuses anything.

### API shape (proposal)

Rather than imitating PostgREST, design endpoints around what the app actually does:

| Endpoint | Replaces |
| --- | --- |
| `GET /v1/app-config` | new: minimum app version, enabled features |
| `GET /v1/me` | `buildRemoteContext` (family, profile) |
| `POST /v1/bootstrap` | `bootstrapCurrentUser` (creates family, caregiver, profile) |
| `GET /v1/profiles/:id/snapshot` | all queries in `remoteSyncRepository.ts`, one response with no paging |
| `GET /v1/profiles/:id/revision` | new and cheap: returns a change counter; background sync downloads the snapshot only when it changed |
| `POST /v1/profiles/:id/changes` | the `upsert`/`delete` calls in `syncService.ts`; batched, with the `updated_at` conflict check done on the server in one transaction |
| `PUT` / `GET /v1/media/...` | `supabaseMediaSync.ts` (the Worker stores/returns the file directly, or issues a signed R2 URL) |
| `POST /v1/ai/emoji`, `/v1/ai/image-drafts`, `/v1/ai/image-drafts/:id/promote` | the AI functions |
| `DELETE /v1/account` | `account-delete` |

The server-side conflict check and the change-counter endpoint address two items from "Known Limits" in `docs/sync.md` without changing the queue logic on the phone. "Queue before pull" and the initial-bind choices stay in the client as they are.

Files: R2 presigned URLs (S3 API, valid from 1 s to 7 days) need S3 credentials in the Worker. It's simpler for the Worker to stream files to and from R2 itself through the binding. The files are small, so that's fine and needs no extra keys.

### Sign-in options

**A. Keep Supabase Auth (sign-in only).** The app keeps signing in through `supabase-js` (its `auth` part); the Worker verifies JWTs against the project's public keys (JWKS). Prerequisite: the project uses the newer asymmetric JWT signing keys. If it still runs on the legacy shared secret, switch in the dashboard (or have the Worker verify with the shared secret). Upsides: no re-sign-in for users, least work. Downsides: Supabase stays (dashboard, Auth rate limits, email templates in the dashboard), and account deletion still has to call the Auth Admin API.

**B. Better Auth in the Worker on D1 (recommended end state if you want to drop Supabase).** Better Auth (currently 1.7.x) has ready-made plugins for email codes (`emailOTP`), anonymous sign-in (`anonymous`, including linking an anonymous account to a real one) and Expo (sessions in `expo-secure-store`). The Worker sends email through the Email Service binding, and templates live in the repo instead of the dashboard. Before implementing, check the current state of the D1 adapter and the Expo plugin.

- Converting users: sign-in is passwordless, so there are no password hashes to move. Create users with the **same id** as in Supabase (`auth.users.id`) and the same email; `caregivers.id` then stays valid.
- Existing sessions can't be carried over: after the switch everyone signs in once more with an email code. Local data on the phone stays, and after sign-in sync reconnects to the same family.
- Anonymous AI trials: new anonymous users get new ids, so the trial counter resets. With few users that's acceptable; otherwise tie the trial to the device as well.
- Transition: the Worker accepts **both** token types (Supabase and Better Auth) and maps them to the same `userId`. Old builds keep working until Supabase Auth is switched off.

**C. Roll our own (codes in D1 + our own JWTs).** Technically small but security-sensitive (code rate limiting, key rotation, session revocation). Not recommended; Better Auth handles this.

## Old builds in the stores

There are no over-the-air updates, so phones will keep running old builds that talk to Supabase directly. The main risk is **split data**: an old build writes to Supabase while a new one writes to D1.

Approach:

1. **Stage 0: version check.** At startup a new build asks `GET /v1/app-config` for the minimum supported version. If it's older, it shows a calm update prompt in settings and pauses sync. The child's board keeps working because it runs on the local SQLite. This build has to be out, with most users on it, before anything moves.
2. **Builds older than stage 0** can't show the prompt. At the data switch, Supabase is made read-only for them (read-only RLS policies, or revoke `insert/update/delete`). Their sync ends in an error and settings show that sync failed. The board keeps working, and after updating the queued changes upload.
3. **No data is lost even in the worst case**: the phone is the source of truth. If a change from an old build didn't make it across, the new build uploads it from the local queue after the update (the queue entry stays in `error` until it goes through).
4. Keep Supabase running read-only for a few more weeks, until requests from old builds stop (watch the API logs in the dashboard).

If there are still only a few users (TestFlight and the first Google Play release), this can be simplified: announce the update and let older builds run into the sync error.

## Data migration

**Database.** Export from Supabase (`pg_dump --data-only` or `COPY … TO CSV` per table), convert with a script to SQLite SQL (types, times as ISO text, `uuid` as text), import with `d1 execute --file`. Dry-run the script on a copy and compare row counts per table plus checksums for a few families. `sync_events`, and completed `ai_image_generation_events` older than a month, don't need to move (the monthly limit only needs the last month).

**Files.** Supabase Storage has an S3-compatible API, so R2 Super Slurper (supports S3-compatible sources) or `rclone` will work. Keep keys unchanged. The `ai-drafts/` and `trials/` folders don't need to move (temporary drafts). Copy twice: once ahead of time, and once more for only the difference during the switch window.

**Safety net for files.** When the Worker is asked for a file missing from R2, it can try Supabase Storage and store the file into R2 on the spot. That covers anything uploaded between the two copies.

**Users (option B only).** List from the Auth Admin API (`id`, `email`, `created_at`) → insert into the Better Auth tables with the same id.

## Stages, rollback points and effort

Estimates assume one developer working with an agent, including testing in the simulator and on Android. They don't include waiting for store review or for users to update.

| # | Stage | What changes | New build? | Rollback point | Estimate |
| --- | --- | --- | --- | --- | --- |
| 0 | Preparation | Worker with `GET /v1/app-config`; the app gets a minimum-version check and the API address in config (`EXPO_PUBLIC_API_URL`). No data moves. | yes | Nothing has moved; switching the Worker off leaves the app behaving as before. | 1–1.5 days |
| 1 | AI functions into the Worker | `/v1/ai/*` and `DELETE /v1/account` in the Worker. It verifies Supabase JWTs and for now reaches the Supabase DB/Storage with the service key (`supabase-js` works in Workers too). OpenAI key in Workers secrets. The edge functions stay deployed for old builds. | yes (`aiClient.ts`, `deleteAccount`) | Point the app back at the edge functions (or keep the old functions running until the new build is proven). | 2–3 days |
| 2 | Data and file groundwork | D1 (`eu` jurisdiction), R2 bucket(s), conversion script, repeated trial conversions, Worker endpoints for snapshot, changes and files, cross-family permission tests. The app calls none of it yet. | no | Nothing is live. | 4–6 days |
| 3 | Data and file switch | New build syncs through the Worker (`remoteSyncRepository.ts`, `syncService.ts`, `supabaseMediaSync.ts` rewritten on our own client). Switch window: Supabase read-only → final conversion → `app-config` raises the minimum version. | yes (forced) | Until the minimum version is raised: make Supabase writable again and point the new build back via `app-config`. After that: D1 Time Travel (30 days), and Supabase still holds the state from the moment of the switch. | 4–6 days |
| 4 | Sign-in on Better Auth (optional) | Better Auth in the Worker, user conversion, email through the Email Service binding, sign-in screen unchanged visually. The Worker accepts both token types. | yes | Supabase Auth keeps running; the new build can be pointed back via `app-config`. | 3–5 days |
| 5 | Cleanup | Switch off the edge functions, Supabase Storage and the database (after a backup); remove `supabase/`, `scripts/supabase-functions.sh`, the release-script variables and `@supabase/supabase-js`. Update `docs/sync.md`, `docs/auth-email.md`, README. | no | Supabase backup (dump + files) kept elsewhere. | 0.5–1 day + waiting for old builds |

Total 13–21 days of work, or about 11–17 without stage 4.

Stages 3 and 4 could ship in one build so users update only once. I'd keep them apart: if something breaks, it's immediately clear whether it's the data or the sign-in.

## What we gain and what it costs

Gains:

- configuration in the repo (Worker, D1 migrations, email templates) instead of clicking through a dashboard;
- one account and one CLI (`cf`) for the website, email, API, data and files;
- no more 1000-row limit and paging;
- server-side conflict checks and a cheap change check instead of downloading the full snapshot every 20 s;
- no pausing of an inactive project (the Supabase free tier pauses a project after a week without traffic).

Costs:

- 2–4 weeks of work during which nothing else gets built;
- risk of bugs in sync and in permissions; the access checks the database used to do now have to be covered by code and tests;
- one forced app update and (with Better Auth) one extra sign-in.

Running costs: you already have Workers Paid ($5/month); at today's volume D1 and R2 fit within the included limits (R2: 10 GB, 1 million writes and 10 million reads per month, no egress fees). Any paid Supabase plan goes away.

## Open decisions

1. Start stages 0 and 1 right after the seed-id fix ships? (I'd say yes; both are worth it even if nothing further happens.)
2. D1, or Postgres through Hyperdrive? (I'd pick D1.)
3. Sign-in: keep Supabase Auth for now (option A), or plan for Better Auth (B) from the start?
4. How many active installs are there outside TestFlight today? That decides how long Supabase should stay read-only.
