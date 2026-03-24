# AnaBoard

Mobile-first AAC board for pilot families. Czech-first UX, caregiver controls, local-first persistence, optional Supabase sync.

## Implemented foundations

- Modular app structure: `features/board`, `features/speech`, `features/caregiver`, `features/sync`, `shared/*`
- Zustand store slices for board/speech/session/sync state
- Local database with `expo-sqlite` repositories
- Speech engine with queue + cancel semantics
- Per-tile speech modes:
  - `tts`
  - `recording_with_tts_fallback`
  - `recording_only`
- Recording support (`expo-av`) with per-tile clip save/delete
- Caregiver PIN gate with lockout (3 failed attempts -> 30s)
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
- Telemetry abstraction with console logging

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
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

For magic-link auth:

- add `anaboard://**` to Supabase Auth redirect URLs
- add your web preview URL too if you want magic links on web
- rebuild native app after changing the Expo `scheme`

## Supabase schema

See `/Users/janca/projects/anaboard/supabase/schema.sql` for baseline tables and RLS policy template.

## Notes

- Default caregiver PIN is `1234` until changed in Settings.
- Default board ships as a 2-page preschool starter set: page 1 home/core words, page 2 child fringe/routines/favorites.
- Tile labels are shown by default for easier symbol learning and partner interpretation.
- Saved phrases and recent phrase history stay local for now; no Supabase sync yet.
- Caregiver settings act as the central hub for archive, reset-to-defaults, appearance, speech, PIN, and account actions.
- On physical iPhone/iPad devices, Expo TTS can still stay silent while the device is in silent mode.
- App currently keeps web support for preview/testing.
- Supabase sync requires schema setup and auth membership alignment for RLS policies.
- If Supabase env vars are missing, app runs local-only mode.
