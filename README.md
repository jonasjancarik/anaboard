# ÁňaBoard

Mobile-first AAC board for pilot families. Czech/English UX, caregiver controls, local-first persistence, optional Supabase sync.

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
  - first-run family + child profile bootstrap with board language and Czech user-gender form
  - persisted session via AsyncStorage
- Internationalization:
  - Czech and English UI copy
  - Czech masculine/feminine starter tile sets
  - English starter tile set
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

GitHub Release APK, fast local path:

- create and push a tag like `v1.0.0`
- run `npm run android:release:upload -- v1.0.0`
- the script builds the local release APK and uploads `anaboard-v1.0.0.apk`
- when the GitHub Release is published, the workflow sees the uploaded APK and skips the remote APK build

GitHub Actions fallback:

- publish a GitHub Release without an APK asset
- or manually run Actions -> Release Android APK -> enter an existing tag
- the workflow creates or updates the matching GitHub Release and uploads `anaboard-v1.0.0.apk`
- this is a tester APK; use the production EAS build for Google Play

Required release environment values, set either in the local shell or `.env.local`, or as GitHub Actions variables or secrets:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Optional release environment values, set the same way:

- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_AI_EMOJI_SUGGESTIONS`
- `EXPO_PUBLIC_AI_GENERATED_TILE_IMAGES`

These `EXPO_PUBLIC_*` values are embedded in the APK. Do not add server-only secrets such as Supabase service-role keys or OpenAI API keys to the app build.

Google Play bundle:

```bash
npx eas-cli@latest build -p android --profile production
```

Local APK on your machine:

```bash
npm run android:doctor
npm run android:prebuild
npm run android:apk
npm run android:release:upload -- v1.0.0 android/app/build/outputs/apk/release/app-release.apk
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Notes:

- The helper script prefers Android Studio's bundled Java runtime to avoid local JDK mismatches.
- Install Android SDK components in Android Studio if `npm run android:doctor` reports a missing SDK.
- The generated `/android` folder is local/ignored; `npm run android:apk` syncs it with Expo config before Gradle runs.
- Local APK builds default `SENTRY_DISABLE_AUTO_UPLOAD=true`; CI can upload source maps separately when configured.
- The local release APK is debug-signed by Expo's generated template, good for device testing, not for Play Store upload.

## iOS builds (TestFlight)

Local path: the build is archived and signed on your Mac, then uploaded straight to App Store Connect.

```bash
npm run ios:doctor
npm run ios:testflight
```

One-time setup:

- App Store Connect -> Users and Access -> Integrations -> App Store Connect API -> create a Team key with the Admin role (needed so Xcode can create the distribution certificate and profiles)
- save the downloaded file as `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`
- add `ASC_KEY_ID` and `ASC_ISSUER_ID` to `.env.local`
- App Store Connect -> Apps -> New App: platform iOS, bundle ID `cz.jonasjancarik.anaboard`; the bundle ID appears in the list after the first `npm run ios:archive`

Notes:

- `npm run ios:archive` regenerates `/ios` from `app.json` (`expo prebuild --clean`) and builds a signed archive in `release-artifacts/ios/`.
- `npm run ios:testflight` archives and uploads. Override the build number with `IOS_BUILD_NUMBER`; by default it is a timestamp such as `261022.2305`, so every upload is newer than the last one.
- The marketing version comes from `expo.version` in `app.json`.
- Builds default `SENTRY_DISABLE_AUTO_UPLOAD=true`, like the Android script.
- `ITSAppUsesNonExemptEncryption` is `false` in `app.json`, so App Store Connect does not ask about export compliance for each build.
- Android keeps the `com.anonymous.anaboard` package so existing APK installs keep updating.

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
- `AI_IMAGE_GENERATION_ENABLED` (`1` by default; set `0` as a server kill switch)
- `AI_IMAGE_RATE_LIMIT_WINDOW_SECONDS` (`60` by default)
- `AI_IMAGE_RATE_LIMIT_MAX` (`3` by default)
- `AI_IMAGE_ANONYMOUS_LIFETIME_LIMIT` (`10` by default)
- `AI_IMAGE_SIGNED_IN_DAILY_LIMIT` (`20` by default)
- `AI_IMAGE_FAMILY_DAILY_LIMIT` (`50` by default)
- `AI_IMAGE_SIGNED_IN_MONTHLY_LIMIT` (`200` by default)
- `AI_IMAGE_FAMILY_MONTHLY_LIMIT` (`500` by default)

Suggested rollout:

- keep all `EXPO_PUBLIC_AI_*` flags at `0` until functions are deployed and tested
- local function env example: `/Users/janca/projects/anaboard/supabase/functions/.env.example`
- local/static function check: `npm run functions:check`
- app should prefer `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `EXPO_PUBLIC_SUPABASE_ANON_KEY` remains fallback during migration
- AI image quota and usage events live in the private `ai_image_generation_events` table; inspect it with service-role access only
- configure a dedicated OpenAI project/key budget for image generation so provider-side spend has a hard ceiling too

## Supabase schema

See `/Users/janca/projects/anaboard/supabase/schema.sql` for baseline tables and RLS policy template.

Caregiver emails keep the original `email` for UI/outgoing auth, with generated `email_canonical` for Gmail-aware lookup and dedup.

## Notes

- Default caregiver PIN is `1234` until changed in Settings.
- Default board ships as a 2-page starter set. Czech has masculine and feminine variants for user-facing forms; English uses one neutral set.
- Tile labels are shown by default for easier symbol learning and partner interpretation.
- Saved phrases and recent phrase history sync through Supabase when cloud sync is enabled.
- Caregiver settings act as the central hub for archive, reset-to-defaults, appearance, speech, PIN, and account actions.
- Diagnostics export sends sanitized JSON only: counts/statuses/settings plus recent local telemetry, without tile labels, phrases, emails, media paths, or auth IDs.
- On physical iPhone/iPad devices, Expo TTS can still stay silent while the device is in silent mode.
- App currently keeps web support for preview/testing.
- Supabase sync requires schema setup and auth membership alignment for RLS policies.
- First cloud bind is conservative: if this device already has non-default local data, sync stops instead of overwriting it silently.
- If Supabase env vars are missing, app runs local-only mode.
