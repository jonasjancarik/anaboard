# Cloud Sync

Last updated: 2026-05-21

Read when: changing sync queue processing, cloud restore, initial bind conflict handling, Supabase sync schema, or multi-device merge behavior.

## Product Jobs

Cloud sync has two primary jobs:

- backup and restore when a caregiver changes devices
- multi-device sync when the same board is used on more than one device

The child board must remain usable offline. Local writes enqueue sync events and should never be discarded by a background pull before those events have either uploaded successfully or been explicitly discarded by the caregiver.

## Queue Before Pull

Normal sync drains all pending local events before applying a remote snapshot. This prevents a large queue from uploading only the first batch and then being overwritten by an authoritative cloud pull.

If any event fails, successful events from that batch are marked synced, failed events are marked error, and the service stops before pulling remote data.

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

## Known Limits

The current conflict policy depends on device timestamps. A future stronger sync model should use server-side revision checks or tombstones for deletes.
