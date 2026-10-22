#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${PROJECT_ROOT}/release-artifacts/ios"
ARCHIVE_PATH="${OUTPUT_DIR}/AnaBoard.xcarchive"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/ios-testflight.sh doctor
  scripts/ios-testflight.sh archive
  scripts/ios-testflight.sh export
  scripts/ios-testflight.sh upload

Commands:
  doctor   check Xcode, CocoaPods, release env, and App Store Connect key
  archive  regenerate /ios from app.json and build a signed Release archive
  export   archive, then export an App Store .ipa locally without uploading
  upload   archive, then upload the build to App Store Connect / TestFlight

Environment (shell, .env.local, or .env):
  ASC_KEY_ID        App Store Connect API key id
  ASC_ISSUER_ID     App Store Connect API issuer id
  ASC_KEY_PATH      optional; defaults to ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8
  IOS_BUILD_NUMBER  optional; defaults to a timestamp like 261022.2305
EOF
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

load_env_files() {
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
        [[ "${key}" == EXPO_PUBLIC_* || "${key}" == ASC_* || "${key}" == IOS_* ]] || continue

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
  export SENTRY_DISABLE_AUTO_UPLOAD="${SENTRY_DISABLE_AUTO_UPLOAD:-true}"
  # CocoaPods fails on the accented app name unless the shell uses UTF-8.
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8

  if [[ -n "${ASC_KEY_ID:-}" && -z "${ASC_KEY_PATH:-}" ]]; then
    export ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
  fi
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

validate_asc_key() {
  if [[ -z "${ASC_KEY_ID:-}" || -z "${ASC_ISSUER_ID:-}" ]]; then
    cat >&2 <<'EOF'
Missing ASC_KEY_ID or ASC_ISSUER_ID.

Create a Team key in App Store Connect -> Users and Access -> Integrations ->
App Store Connect API (role Admin), save the .p8 file to
~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8, and add ASC_KEY_ID and
ASC_ISSUER_ID to .env.local.
EOF
    exit 1
  fi

  if [[ ! -f "${ASC_KEY_PATH}" ]]; then
    echo "App Store Connect key not found at ${ASC_KEY_PATH}." >&2
    exit 1
  fi
}

asc_auth_args() {
  printf '%s\n' \
    -allowProvisioningUpdates \
    -authenticationKeyPath "${ASC_KEY_PATH}" \
    -authenticationKeyID "${ASC_KEY_ID}" \
    -authenticationKeyIssuerID "${ASC_ISSUER_ID}"
}

app_config_value() {
  local expression="$1"
  node -e "const c=require('${PROJECT_ROOT}/app.json').expo; process.stdout.write(String(${expression} ?? ''))"
}

find_workspace() {
  local workspace=""

  for workspace in "${PROJECT_ROOT}"/ios/*.xcworkspace; do
    [[ -d "${workspace}" ]] || continue
    printf '%s\n' "${workspace}"
    return 0
  done

  return 1
}

doctor() {
  load_env_files

  printf 'project_root=%s\n' "${PROJECT_ROOT}"
  printf 'xcode=%s\n' "$(xcodebuild -version 2>/dev/null | sed -n 1p || echo missing)"
  printf 'pod=%s\n' "$(command -v pod || echo missing)"
  printf 'bundle_id=%s\n' "$(app_config_value 'c.ios.bundleIdentifier')"
  printf 'team_id=%s\n' "$(app_config_value 'c.ios.appleTeamId')"
  printf 'version=%s\n' "$(app_config_value 'c.version')"
  printf 'supabase_url=%s\n' "$([[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" ]] && echo set || echo missing)"
  printf 'asc_key_id=%s\n' "${ASC_KEY_ID:-missing}"
  printf 'asc_issuer_id=%s\n' "$([[ -n "${ASC_ISSUER_ID:-}" ]] && echo set || echo missing)"
  printf 'asc_key_file=%s\n' "$([[ -n "${ASC_KEY_PATH:-}" && -f "${ASC_KEY_PATH}" ]] && echo present || echo missing)"
}

build_archive() {
  load_env_files
  validate_release_env
  validate_asc_key
  cd "${PROJECT_ROOT}"

  local build_number="${IOS_BUILD_NUMBER:-$(date +%y%m%d.%H%M)}"
  local workspace=""
  local scheme=""
  local auth_args=()

  EXPO_NO_GIT_STATUS=1 npx expo prebuild --platform ios --clean

  workspace="$(find_workspace || true)"
  if [[ -z "${workspace}" ]]; then
    echo "No Xcode workspace found in ios/ after prebuild." >&2
    exit 1
  fi
  scheme="$(basename "${workspace}" .xcworkspace)"

  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${build_number}" "${PROJECT_ROOT}/ios/${scheme}/Info.plist"

  while IFS= read -r arg; do
    auth_args+=("${arg}")
  done < <(asc_auth_args)

  mkdir -p "${OUTPUT_DIR}"
  rm -rf "${ARCHIVE_PATH}"

  xcodebuild \
    -workspace "${workspace}" \
    -scheme "${scheme}" \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "${ARCHIVE_PATH}" \
    "${auth_args[@]}" \
    archive

  printf '\nArchive: %s\nVersion: %s (%s)\n' "${ARCHIVE_PATH}" "$(app_config_value 'c.version')" "${build_number}"
}

export_archive() {
  local destination="$1"
  local export_dir="${OUTPUT_DIR}/export"
  local options_plist="${OUTPUT_DIR}/ExportOptions.plist"
  local team_id=""
  local auth_args=()

  team_id="$(app_config_value 'c.ios.appleTeamId')"

  cat > "${options_plist}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>${destination}</string>
  <key>teamID</key>
  <string>${team_id}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
EOF

  while IFS= read -r arg; do
    auth_args+=("${arg}")
  done < <(asc_auth_args)

  rm -rf "${export_dir}"

  xcodebuild \
    -exportArchive \
    -archivePath "${ARCHIVE_PATH}" \
    -exportOptionsPlist "${options_plist}" \
    -exportPath "${export_dir}" \
    "${auth_args[@]}"

  if [[ "${destination}" == "upload" ]]; then
    printf '\nUploaded to App Store Connect. The build shows up in TestFlight after Apple finishes processing it (usually 5-30 minutes).\n'
  else
    printf '\nExported to %s\n' "${export_dir}"
  fi
}

main() {
  local command="${1:-}"

  case "${command}" in
    doctor)
      doctor
      ;;
    archive)
      build_archive
      ;;
    export)
      build_archive
      export_archive export
      ;;
    upload)
      build_archive
      export_archive upload
      ;;
    *)
      print_usage >&2
      exit 1
      ;;
  esac
}

main "$@"
