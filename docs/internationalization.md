# Internationalization And Child Gender

Last updated: 2026-05-16

Read when: changing onboarding language choices, default tile text, profile language metadata, or settings sync.

## Current Scope

ÁňaBoard is Czech-first but now ships with an English app surface too. The i18n layer is intentionally small:

- Supported board locales: `cs-CZ`, `en-US`.
- Language metadata: `src/shared/i18n/profileLanguage.ts`.
- UI copy: `src/shared/i18n/appCopy.ts`.
- Board language source: `boards.locale`.
- Child grammatical gender source: `profile_settings.child_gender`.

`child_gender` is used for languages where the child-facing sentence form changes by speaker. Czech currently supports:

- `masculine`
- `feminine`

## Default Tiles

Default tiles live in `src/shared/constants/defaults.ts`.

Czech has two starter tile sets:

- `DEFAULT_TILE_ROWS_CS_MASCULINE`
- `DEFAULT_TILE_ROWS_CS_FEMININE`

English has one starter tile set:

- `DEFAULT_TILE_ROWS_EN`

Both sets must keep the same length, tile ids, positions, emojis, and categories unless the board layout intentionally changes. Gendered labels can differ, for example:

- `Hotový` / `Hotová`
- `Veselý` / `Veselá`
- `Smutný` / `Smutná`

Keep default labels short. Prefer flexible one-word tiles over complete sentences so children can answer across contexts and caregivers can model combinations.

`DEFAULT_TILES(updatedAt, { locale, childGender })` is the public generator. Use it instead of importing a concrete row set for app behavior.

## Onboarding And Reset

During first cloud bootstrap, the caregiver chooses the board language and, for Czech, the user grammatical gender. If the active local board is still the untouched default board, onboarding rewrites the default labels to the selected locale/form before sync starts.

Changing the board language later in Settings rewrites starter labels only when the active board still matches a known untouched default set. Changing `Rod uživatele` updates the profile preference. It affects future resets to default tiles; it does not rewrite a customized board silently.

## UI Copy

User-facing copy should come from `getAppCopy(locale)` when the current board locale is known. Screens should use `normalizeSupportedLocale(board?.locale)` and pass the locale into shared caregiver components when those components render text.

Keep low-level storage/sync exceptions short and useful, but do not treat them as the primary translation surface. Caregiver-facing screens should wrap common failures with localized fallback messages.

## Storage And Sync

Local SQLite and Supabase both mirror:

- `profile_settings.child_gender`

When adding a new profile setting, update:

- `src/shared/storage/migrations.ts`
- `src/shared/storage/repositories/settingsRepository.ts`
- `src/features/sync/remoteSyncRepository.ts`
- `src/features/sync/syncService.ts`
- `supabase/schema.sql`
- a new Supabase migration under `supabase/migrations/`

Run:

```bash
npm run migrations:test
npm run defaults:test
npm run typecheck
```
