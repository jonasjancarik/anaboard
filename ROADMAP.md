# AnaBoard Roadmap

Last updated: 2026-02-21

## Product Goal
Reliable AAC app for pilot families.

Priorities:
1. Reliability first.
2. Czech-first UX.
3. Caregiver safety controls.
4. Cloud sync early (Supabase).
5. Store-ready quality.

## Current Status Snapshot

### M0 Foundation (Weeks 1-2)
Status: DONE

Implemented:
- Modular architecture (`src/core`, `src/features/*`, `src/shared/*`).
- Zustand app state with board/speech/session/sync slices.
- Local SQLite schema + repositories.
- App bootstrap with loading/auth/sync wiring.
- Telemetry abstraction + optional Sentry init.

### M1 Speech Engine + Recording (Weeks 3-6)
Status: PARTIAL (core shipped)

Implemented:
- Queue-based speech engine with cancel semantics.
- Per-tile modes:
  - `tts`
  - `recording_with_tts_fallback`
  - `recording_only`
- Sentence playback queue with 120ms inter-segment pause.
- Clip missing detection and speech telemetry events.
- Recording capture and per-tile clip save/delete.

Remaining:
- Add clip checksum validation and stale-file repair flow.
- Add forced-error test harness for deterministic fallback tests.
- Add explicit audio interruption handling (calls/headset route changes).

### M2 Caregiver Safety + Editor (Weeks 7-10)
Status: PARTIAL (main flows shipped)

Implemented:
- Caregiver PIN gate.
- Lockout rule: 3 failed attempts -> 30s cooldown.
- Editor: tile text/emoji/category/speech mode, reorder, clip record/delete.
- Board actions: reset to defaults, duplicate board.
- Settings: TTS rate/pitch, high contrast, PIN change.

Remaining:
- Add better child-safe runtime lock UX (single switch + confirmations).
- Add clip replace UX polish (preview/playback in editor).
- Add editor undo/redo for tile mutations.

### M3 Cloud Sync Early (Weeks 11-14)
Status: PARTIAL (auth+sync scaffold shipped)

Implemented:
- Supabase client integration.
- Session persistence via AsyncStorage.
- Auth screens: sign in/up.
- First-run bootstrap: create/link family + caregiver + child profile.
- Sync queue processor (pending/synced/error), periodic + foreground triggers.
- Remote context enrichment (`family_id`, `profile_id`) on outbound payloads.
- Baseline Supabase schema + RLS template (`supabase/schema.sql`).

Remaining:
- Full pull/merge reconciliation from server to local DB.
- Retry/backoff with jitter + dead-letter handling.
- Conflict resolution hardening and history replay tooling.
- Membership/RLS production hardening (auth identity mapping validation).

### M4 Tablet + Accessibility (Weeks 15-18)
Status: PARTIAL

Implemented:
- Responsive board sizing across phone/tablet.
- High contrast toggle.
- Screen-reader labels on core controls/tiles.

Remaining:
- Landscape tablet-specific layout and spacing rules.
- Accessibility audit pass (TalkBack/VoiceOver full flow).
- Guided Access/screen pinning onboarding screen.

### M5 Pilot Hardening (Weeks 19-22)
Status: NOT STARTED

Planned:
- In-app diagnostics export + non-PII bug report flow.
- Reliability dashboards (crash-free sessions, speech failure rate, sync failure rate).
- Offline/low-battery/interruption test matrix.
- Pilot feedback loop and weekly defect triage cadence.

### M6 Store Release (Weeks 23-24)
Status: NOT STARTED

Planned:
- Privacy/parental disclosures.
- Store metadata/screenshots/localized copy.
- Release channel strategy (internal -> beta -> production).
- Rollback + hotfix runbook.

## Immediate Next Execution Plan

### Sprint A (next)
1. Sync reliability hardening:
   - Pull/merge pipeline.
   - Retry/backoff policy.
   - Conflict tests.
2. Audio reliability:
   - Clip checksum verification.
   - Interruption handling.
3. Editor safety polish:
   - Confirm dialogs on destructive actions.
   - Better clip management UX.

### Sprint B
1. Tablet landscape layout pass.
2. Accessibility pass with device matrix.
3. Guided Access / screen pinning onboarding.

### Sprint C
1. Pilot ops instrumentation + dashboard setup.
2. Diagnostics export and bug report flow.
3. Beta readiness gates.

## Release Gates (must pass)
1. Core speech tests pass on at least one physical iOS device + one physical Android device.
2. Crash-free sessions >= 99.5% in beta.
3. Sync error rate < 1% active sessions.
4. No open P1 defects for 2 consecutive pilot weeks.

## Repo Pointers
1. App root and lifecycle: `/Users/janca/projects/anaboard/src/core`
2. Features: `/Users/janca/projects/anaboard/src/features`
3. Shared services/storage/types: `/Users/janca/projects/anaboard/src/shared`
4. Store: `/Users/janca/projects/anaboard/src/store/useAppStore.ts`
5. Supabase schema: `/Users/janca/projects/anaboard/supabase/schema.sql`
