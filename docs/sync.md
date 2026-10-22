# Cloud Sync

Last updated: 2026-10-22

Read when: changing sync queue processing, background pull skipping, cloud restore, initial bind conflict handling, Supabase sync schema, or multi-device merge behavior.

## Product Jobs

Cloud sync has two primary jobs:

- backup and restore when a caregiver changes devices
- multi-device sync when the same board is used on more than one device

The child board must remain usable offline. Local writes enqueue sync events and should never be discarded by a background pull before those events have either uploaded successfully or been explicitly discarded by the caregiver.

## Queue Before Pull

Normal sync drains all pending local events before applying a remote snapshot. This prevents a large queue from uploading only the first batch and then being overwritten by an authoritative cloud pull.

If any event fails, successful events from that batch are marked synced, failed events are marked error, and the service stops before pulling remote data.

Failed events are retried automatically. After each failed upload the next automatic retry waits longer (20 s, 40 s, 80 s, … up to 15 minutes). "Synchronizovat teď" retries them immediately. There is no separate "retry failed" button.

## Pull Never Overwrites Queued Edits

`applyRemoteSnapshot` refuses to apply while any local change is still queued (`pending` or `error`). This covers edits made while a pull was downloading. The check runs once before media downloads and again inside the write transaction. A skipped pull returns `local_changes_pending` and the next run uploads the edit first.

Explicit restores ("Použít data z cloudu" and the automatic first bind of an untouched device) pass `discardUnsyncedEventsThrough`, which drops only the changes that existed when the restore started, inside the same transaction. Changes queued after that still block the restore.

## Skipping Unchanged Pulls

Background sync runs every 20 s and always fetches the cloud snapshot, but it does not rewrite local rows or refresh the board when nothing changed. After each applied pull the service stores a SHA-256 fingerprint of the fetched snapshot (plus the profile id) in `app_meta` (`sync_last_applied_snapshot_fingerprint`). A later background run skips `applyRemoteSnapshot` and `onDataChanged` only when:

- the fetched snapshot has the same fingerprint, and
- the same run uploaded no queued changes.

The first background pull after the app starts always applies, so cached pictures or recordings that disappeared locally are downloaded again.

Any upload means apply, because the conflict policy can skip an upload and leave a newer cloud row that still has to reach the device. The fingerprint is cleared before "Použít data z cloudu" and "Použít data z tohoto telefonu", and whenever the bound profile changes, so those paths always apply. The pure rules live in `syncRunPolicy.ts` (`buildSnapshotFingerprintSource`, `canSkipRemoteApply`).

Uploaded (`synced`) queue rows are pruned after 7 days, at most once an hour after a successful run. Only `pending` and `error` rows matter for sync, diagnostics and migrations.

## Large Tables

Supabase returns at most 1000 rows per request. Tiles, saved phrases and phrase events are read page by page (`fetchAllPages`), so a long phrase history is not cut to the newest 1000 rows on every pull.

## Media

Storage paths are stable per tile or clip (`family/profile/<id>.<ext>`), so a replaced picture or recording keeps its path. A pull reuses the cached local file only when the path matches and the row's `updated_at` is the same instant. Otherwise it downloads the file again. After a tile image upload, the remote path is written back to the local row so later pushes skip the upload.

## Conflict Policy

Normal multi-device conflicts are timestamp based:

- local newer or equal: upload local row
- remote newer: skip the local upload/delete and let the next pull apply the cloud row
- explicit caregiver choice: force the selected side

This policy is intentionally simple. It avoids older offline edits overwriting newer cloud rows, but it is not a full per-field merge system.

Phrase events are append-only and do not have `updated_at`, so they are uploaded without timestamp conflict checks.

## Initial Bind Choices

When a device with customized local data connects to a cloud profile that already has data, sync pauses for caregiver review.

- Keep this device: uploads a full local snapshot, deletes cloud rows missing locally, then clears the initial-bind issue.
- Use cloud data: applies the cloud snapshot locally and clears the pre-existing unsynced queue after the cloud restore succeeds.

Neither action should show success until its write path completes.

The same two choices are offered when the device was previously linked to a different cloud profile (`profile_switch_requires_review`). Both choices ask for confirmation because both overwrite one side. "Keep this device" uploads only the settings row of the active board's profile, so leftover rows from an earlier profile (with the default PIN) never reach the cloud.

## Settings Screen Feedback

`syncService.syncNow()` waits for any background run, then returns a `SyncRunResult`. The settings screen shows success only for `synced`/`deferred`; offline, failure and "needs a choice" each get their own message. Explicit actions throw `SyncActionError` with a code that maps to localized copy instead of raw English errors.

## Known Limits

The current conflict policy depends on device timestamps. A future stronger sync model should use server-side revision checks or tombstones for deletes.
