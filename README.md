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
- Caregiver editor:
  - tile text/emoji/category/speech mode
  - tile reorder
  - insert new tile after selected tile
  - duplicate selected tile
  - reset to defaults
  - create board copy and switch to it
- Board shortcuts:
  - caregiver unlocked: long-press + drag reorders tiles
  - caregiver unlocked: long-press + release opens editor on that tile
  - caregiver locked: long-press opens PIN and then editor for that tile
  - caregiver mode can be locked/unlocked from board action button
- Settings screen:
  - TTS rate/pitch
  - high contrast
  - PIN change
- Sync service scaffold with pending event queue and optional Supabase push
- Supabase auth flow:
  - sign in / sign up screen
  - first-run family + child profile bootstrap
  - persisted session via AsyncStorage
- Telemetry abstraction with optional Sentry init

## Run

```bash
npm install
npm run start
npm run ios
npm run android
npm run web
```

## Environment

Copy `.env.example` to `.env` and set values when enabling cloud sync / Sentry.

```bash
cp .env.example .env
```

Env vars:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SENTRY_DSN`

## Supabase schema

See `/Users/janca/projects/anaboard/supabase/schema.sql` for baseline tables and RLS policy template.

## Notes

- Default caregiver PIN is `1234` until changed in Settings.
- App currently keeps web support for preview/testing.
- Supabase sync requires schema setup and auth membership alignment for RLS policies.
- If Supabase env vars are missing, app runs local-only mode.
