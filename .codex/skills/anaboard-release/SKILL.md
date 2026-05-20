---
name: anaboard-release
description: Run AnaBoard repository releases. Use when asked to create, prepare, publish, tag, upload, or verify a new AnaBoard release, GitHub Release, changelog/release notes, Android APK release asset, or release merge to main.
---

# AnaBoard Release

## Core Rule

Treat a release as incomplete until `main` contains the release commit, the tag points at `main`, the GitHub Release has a real changelog, and the Android APK asset is present.

Do not tag a feature/dev branch. Do not leave generic auto-generated release notes.

## Release Workflow

1. Inspect state:
   - `git status --short`
   - `git branch --show-current`
   - `git tag --sort=-version:refname | head`
   - Run docs discovery first if available: `bin/docs-list` or `npm run docs:list` if present.
   - Read `docs/RELEASING.md` if it exists; otherwise use this skill plus `README.md`.

2. Resolve release version:
   - Use the user-provided tag if present.
   - If missing, infer the next patch version from the latest `v*` tag, then ask once for confirmation before changing files, merging, tagging, or pushing.
   - Tags must look like `v1.0.2`.

3. Prepare release changes:
   - Update app/package version files only when needed.
   - Run the full gate before handoff or before merge: `npm run check`.
   - Commit release-version or release-note file changes separately if they exist.

4. Merge to `main` before tagging:
   - Fetch and update `main`.
   - Merge the release branch/commit into `main` using the repo’s normal path. If the user did not explicitly authorize merge/push, ask before doing it.
   - Rerun `npm run check` on `main`.
   - Push `main`.

5. Create and push the tag from `main`:
   - Ensure `git rev-parse HEAD` is the intended release commit on `main`.
   - Create the tag only after the merge: `git tag vX.Y.Z`.
   - Push the tag: `git push origin vX.Y.Z`.

6. Write the GitHub Release changelog:
   - Compare previous tag to new tag, for example:
     `git log --first-parent --oneline <previous-tag>..vX.Y.Z`
     `git --no-pager diff --stat <previous-tag>..vX.Y.Z`
   - Write concise notes with user-facing sections:
     `Highlights`, `Fixes`, `Release asset`.
   - Mention the APK filename, for example `anaboard-vX.Y.Z.apk`.
   - Create or update notes with `gh release create` or `gh release edit`. Use a temp notes file under `/tmp/`, not a tracked scratch file.

7. Build and upload the Android APK:
   - Preferred local path:
     `npm run android:release:upload -- vX.Y.Z`
   - The upload script requires a clean tree, local tag at `HEAD`, remote tag on `origin`, GitHub CLI auth, and release env values from shell or `.env.local`.
   - If a release already exists, the script uploads/clobbers the APK. If it creates generic notes, immediately replace them with the real changelog from step 6.
   - The `Release Android APK` workflow is manual fallback only. Publishing a release should not trigger a second hosted APK build.

8. Verify:
   - `gh release view vX.Y.Z --json tagName,name,isDraft,assets,body`
   - Confirm the body is not generic and the APK asset exists.
   - If CI is involved, use `gh run list/view`; rerun/fix until green if the user asked for a complete release.
   - If you used the manual `Release Android APK` fallback, wait for that run to finish, then re-run the release view check because the workflow may clobber the APK asset.
   - Confirm the working tree is clean and the tag still points at `main`.

9. Restore working branch:
   - At the end, check out `dev` again if it exists: `git checkout dev`.
   - Do not push `dev` unless the user explicitly asked for it.

## Fallbacks

- If local APK upload is blocked, use the manual `Release Android APK` workflow as fallback only after explaining the blocker.
- If a release exists without notes or without the APK, update the existing release instead of creating a duplicate.
- If the working tree has unrelated changes, do not stash or discard them. Commit only release-related files or ask if the merge/release cannot proceed safely.
