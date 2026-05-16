# ÁňaBoard

Mobile-first AAC board for pilot families. Czech-first UX, caregiver controls, local-first persistence, optional Supabase sync.

## Implemented foundations

- Modular app structure: `features/board`, `features/speech`, `features/caregiver`, `features/sync`, `shared/*`
- Zustand store slices for board/speech/session/sync state
- Local database with `expo-sqlite` repositories
- Speech engine with queue + cancel semantics
- Per-tile speech modes:
  - `tts`
  - `recording_only`
- Recording support (`expo-audio`) with per-tile clip save/delete
- Caregiver PIN gate / native unlock for editing
- Caregiver tile editor:
  - tile text/emoji/category/speech mode
  - per-tile recording management
  - delete selected tile
- Deleted-tile archive:
  - restore removed tiles back onto the board
  - preserves recording metadata for easy re-add
- Board shortcuts:
  - PIN only unlocks caregiver mode; stays on board
  - overflow tiles continue on horizontal pages
  - caregiver unlocked: long-press tile opens editor for that tile
  - caregiver unlocked: button below the grid adds a new tile at the end of the board
  - caregiver unlocked + `PŘESUN`: long-press + drag reorders tiles
  - caregiver locked: long-press does not trigger editor
  - caregiver mode can be locked/unlocked from board action button
  - adaptive phrase bar:
    - empty sentence: saved phrases + recent replays
    - while composing: next-word suggestions from phrase history
  - caregiver unlocked: current sentence can be saved as a reusable phrase
- Settings screen:
  - preferred voice
  - TTS rate/pitch
  - high contrast
  - quick phrases / suggestions toggle
  - suggestion count
  - PIN change
- Sync service scaffold with pending event queue and optional Supabase push
- Supabase auth flow:
  - optional email magic-link sign in
  - first-run family + child profile bootstrap
  - persisted session via AsyncStorage
- Privacy-safe telemetry abstraction with local diagnostics buffer
- Opt-in Sentry error reporting plus caregiver diagnostics email/share action

## Run

```bash
npm install
npm run start
npm run ios
npm run android
npm run web
```

## Android builds

Tester APK via EAS Build:

```bash
npx eas-cli@latest build -p android --profile preview
```

Google Play bundle:

```bash
npx eas-cli@latest build -p android --profile production
```

Local APK on your machine:

```bash
npm run android:doctor
npm run android:prebuild
npm run android:apk
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Notes:

- The helper script prefers Android Studio's bundled Java runtime to avoid local JDK mismatches.
- Install Android SDK components in Android Studio if `npm run android:doctor` reports a missing SDK.
- The generated `/android` folder is local/ignored; regenerate with `npm run android:prebuild` when native config changes.
- The local release APK is debug-signed by Expo's generated template, good for device testing, not for Play Store upload.

## Environment

Copy `.env.example` to `.env.local` and set values when enabling cloud sync.

```bash
cp .env.example .env.local
```

Env vars:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_AI_EMOJI_SUGGESTIONS`
- `EXPO_PUBLIC_AI_GENERATED_TILE_IMAGES`

`EXPO_PUBLIC_SENTRY_DSN` enables the Settings toggle for remote error reporting. The toggle is off by default and stored only on the current device.

For magic-link auth:

- add `anaboard://**` to Supabase Auth redirect URLs
- add your web preview URL too if you want magic links on web
- rebuild native app after changing the Expo `scheme`

## Supabase functions for AI

LLM features use Supabase Edge Functions in `/Users/janca/projects/anaboard/supabase/functions`.

Required function secrets:

- `SUPABASE_URL`
- `SB_PUBLISHABLE_KEY`
- `SB_SECRET_KEY`
- `OPENAI_API_KEY`

Optional function secrets:

- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`

Suggested rollout:

- keep all `EXPO_PUBLIC_AI_*` flags at `0` until functions are deployed and tested
- local function env example: `/Users/janca/projects/anaboard/supabase/functions/.env.example`
- local/static function check: `npm run functions:check`
- app should prefer `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `EXPO_PUBLIC_SUPABASE_ANON_KEY` remains fallback during migration

Admin helper for anonymous AI image trial quota:

```bash
npm run admin:ai-trial -- list
npm run admin:ai-trial -- show --user-id <auth-user-uuid>
npm run admin:ai-trial -- reset --user-id <auth-user-uuid>
npm run admin:ai-trial -- set-used --user-id <auth-user-uuid> --count 3
node ./scripts/admin-ai-trial.mjs list --json | jq -r '.[] | select(.isAnonymous) | .userId' | xargs -n1 node ./scripts/admin-ai-trial.mjs reset --user-id
```

Notes:

- defaults to `supabase/functions/.env.local`
- requires `SUPABASE_URL` + `SB_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`)
- `list --all` walks all auth users; default page size `50`
- `--email <caregiver@email>` resolves registered caregivers via `caregivers.email_canonical`
- anonymous users usually need `--user-id`
- use `node ./scripts/admin-ai-trial.mjs ... --json` for pipelines; `npm run` adds banner text ahead of JSON

## Supabase schema

See `/Users/janca/projects/anaboard/supabase/schema.sql` for baseline tables and RLS policy template.

Caregiver emails keep the original `email` for UI/outgoing auth, with generated `email_canonical` for Gmail-aware lookup and dedup.

## Notes

- Default caregiver PIN is `1234` until changed in Settings.
- Default board ships as a 2-page preschool starter set: page 1 home/core words, page 2 child fringe/routines/favorites.
- Tile labels are shown by default for easier symbol learning and partner interpretation.
- Saved phrases and recent phrase history sync through Supabase when cloud sync is enabled.
- Caregiver settings act as the central hub for archive, reset-to-defaults, appearance, speech, PIN, and account actions.
- Diagnostics export sends sanitized JSON only: counts/statuses/settings plus recent local telemetry, without tile labels, phrases, emails, media paths, or auth IDs.
- On physical iPhone/iPad devices, Expo TTS can still stay silent while the device is in silent mode.
- App currently keeps web support for preview/testing.
- Supabase sync requires schema setup and auth membership alignment for RLS policies.
- First cloud bind is conservative: if this device already has non-default local data, sync stops instead of overwriting it silently.
- If Supabase env vars are missing, app runs local-only mode.
