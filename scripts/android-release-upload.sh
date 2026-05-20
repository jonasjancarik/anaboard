#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_APK_PATH="${PROJECT_ROOT}/android/app/build/outputs/apk/release/app-release.apk"
ARTIFACT_DIR="${PROJECT_ROOT}/release-artifacts"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/android-release-upload.sh <tag> [apk-path]

Examples:
  scripts/android-release-upload.sh v1.0.2
  scripts/android-release-upload.sh v1.0.2 android/app/build/outputs/apk/release/app-release.apk
EOF
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

load_public_env_files() {
  local file=""
  local line=""
  local key=""
  local value=""

  for file in "${PROJECT_ROOT}/.env.local" "${PROJECT_ROOT}/.env"; do
    [[ -f "${file}" ]] || continue

    while IFS= read -r line || [[ -n "${line}" ]]; do
      line="$(trim "${line}")"
      [[ -z "${line}" || "${line}" == \#* ]] && continue
      [[ "${line}" == export\ * ]] && line="${line#export }"

      if [[ "${line}" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
        key="${BASH_REMATCH[1]}"
        value="$(trim "${BASH_REMATCH[2]}")"
        [[ "${key}" == EXPO_PUBLIC_* ]] || continue

        if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi

        if [[ -z "${!key+x}" ]]; then
          export "${key}=${value}"
        fi
      fi
    done < "${file}"
  done

  export EXPO_PUBLIC_AI_EMOJI_SUGGESTIONS="${EXPO_PUBLIC_AI_EMOJI_SUGGESTIONS:-0}"
  export EXPO_PUBLIC_AI_GENERATED_TILE_IMAGES="${EXPO_PUBLIC_AI_GENERATED_TILE_IMAGES:-0}"
}

validate_release_env() {
  if [[ -z "${EXPO_PUBLIC_SUPABASE_URL:-}" ]]; then
    echo "Missing EXPO_PUBLIC_SUPABASE_URL in the environment or .env.local." >&2
    exit 1
  fi

  if [[ -z "${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" && -z "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
    echo "Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY in the environment or .env.local." >&2
    exit 1
  fi
}

ensure_release_tree() {
  local tag="$1"
  local head_commit=""
  local tag_commit=""

  if ! git -C "${PROJECT_ROOT}" rev-parse -q --verify "refs/tags/${tag}^{commit}" >/dev/null; then
    cat >&2 <<EOF
Local tag ${tag} was not found.

Create or fetch it first, then rerun:
  git fetch --tags origin ${tag}
EOF
    exit 1
  fi

  head_commit="$(git -C "${PROJECT_ROOT}" rev-parse HEAD)"
  tag_commit="$(git -C "${PROJECT_ROOT}" rev-parse "refs/tags/${tag}^{commit}")"

  if [[ "${head_commit}" != "${tag_commit}" ]]; then
    cat >&2 <<EOF
Current HEAD does not match ${tag}.

HEAD: ${head_commit}
${tag}: ${tag_commit}

Check out the release tag or run this from the release commit before building.
EOF
    exit 1
  fi

  if [[ -n "$(git -C "${PROJECT_ROOT}" status --porcelain)" ]]; then
    cat >&2 <<'EOF'
Working tree has uncommitted changes.

Commit the release changes first, or pass an already-built APK path if you only want to upload.
EOF
    exit 1
  fi
}

ensure_remote_tag() {
  local tag="$1"

  if ! git -C "${PROJECT_ROOT}" ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
    cat >&2 <<EOF
Remote tag ${tag} was not found on origin.

Push it first, then rerun:
  git push origin ${tag}
EOF
    exit 1
  fi
}

require_tools() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "Missing GitHub CLI. Install gh and authenticate before uploading a release APK." >&2
    exit 1
  fi

  if ! gh auth status >/dev/null 2>&1; then
    echo "GitHub CLI is not authenticated. Run gh auth login before uploading a release APK." >&2
    exit 1
  fi
}

upload_release_asset() {
  local tag="$1"
  local artifact_path="$2"
  local is_draft=""

  if gh release view "${tag}" >/dev/null 2>&1; then
    is_draft="$(gh release view "${tag}" --json isDraft --jq '.isDraft')"
    gh release upload "${tag}" "${artifact_path}" --clobber

    if [[ "${is_draft}" == "true" ]]; then
      gh release edit "${tag}" --draft=false
    fi
  else
    gh release create "${tag}" "${artifact_path}" \
      --title "${tag}" \
      --notes "Android APK build for ${tag}." \
      --verify-tag
  fi
}

main() {
  local tag="${1:-}"
  local apk_source="${2:-}"
  local apk_name=""
  local artifact_path=""

  if [[ -z "${tag}" || "${tag}" == "-h" || "${tag}" == "--help" ]]; then
    print_usage
    [[ -z "${tag}" ]] && exit 1
    exit 0
  fi

  if [[ "${tag}" != v* ]]; then
    echo "Expected a release tag like v1.0.2." >&2
    exit 1
  fi

  require_tools

  if [[ -z "${apk_source}" ]]; then
    ensure_release_tree "${tag}"
    ensure_remote_tag "${tag}"
    load_public_env_files
    validate_release_env
    "${PROJECT_ROOT}/scripts/android-local-build.sh" apk
    apk_source="${DEFAULT_APK_PATH}"
  fi

  if [[ ! -f "${apk_source}" ]]; then
    echo "APK not found: ${apk_source}" >&2
    exit 1
  fi

  apk_name="anaboard-${tag}.apk"
  artifact_path="${ARTIFACT_DIR}/${apk_name}"

  mkdir -p "${ARTIFACT_DIR}"
  cp "${apk_source}" "${artifact_path}"
  ls -lh "${artifact_path}"

  upload_release_asset "${tag}" "${artifact_path}"

  printf '\nUploaded release APK:\n%s\n' "${apk_name}"
}

main "$@"
