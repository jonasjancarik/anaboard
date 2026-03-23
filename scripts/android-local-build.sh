#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

print_usage() {
  cat <<'EOF'
Usage:
  scripts/android-local-build.sh doctor
  scripts/android-local-build.sh prebuild
  scripts/android-local-build.sh apk
EOF
}

find_android_sdk() {
  local candidates=()

  [[ -n "${ANDROID_SDK_ROOT:-}" ]] && candidates+=("${ANDROID_SDK_ROOT}")
  [[ -n "${ANDROID_HOME:-}" ]] && candidates+=("${ANDROID_HOME}")
  candidates+=("$HOME/Library/Android/sdk" "$HOME/Android/Sdk")

  local candidate
  for candidate in "${candidates[@]}"; do
    [[ -z "${candidate}" ]] && continue
    if [[ -d "${candidate}/platform-tools" || -d "${candidate}/build-tools" || -d "${candidate}/platforms" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  return 1
}

find_java_home() {
  local candidates=()
  local resolved=""

  [[ -n "${JAVA_HOME:-}" ]] && candidates+=("${JAVA_HOME}")
  candidates+=("/Applications/Android Studio.app/Contents/jbr/Contents/Home")

  if [[ -x "/usr/libexec/java_home" ]]; then
    resolved="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
    [[ -n "${resolved}" ]] && candidates+=("${resolved}")

    resolved="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    [[ -n "${resolved}" ]] && candidates+=("${resolved}")
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    [[ -x "${candidate}/bin/java" ]] || continue
    printf '%s\n' "${candidate}"
    return 0
  done

  return 1
}

setup_env() {
  local sdk_root=""
  local java_home=""

  sdk_root="$(find_android_sdk || true)"
  if [[ -z "${sdk_root}" ]]; then
    cat >&2 <<'EOF'
Android SDK not found.

Expected one of:
  - $ANDROID_SDK_ROOT
  - $ANDROID_HOME
  - ~/Library/Android/sdk

Install Android SDK components from Android Studio -> Settings -> SDK Manager.
Required at minimum:
  - Android SDK Platform
  - Android SDK Build-Tools
  - Android SDK Platform-Tools
  - Android SDK Command-line Tools
EOF
    exit 1
  fi

  java_home="$(find_java_home || true)"
  if [[ -z "${java_home}" ]]; then
    cat >&2 <<'EOF'
Compatible JDK not found.

Expected one of:
  - $JAVA_HOME
  - Android Studio bundled JBR
  - macOS java_home entry for Java 17 or 21
EOF
    exit 1
  fi

  export ANDROID_SDK_ROOT="${sdk_root}"
  export ANDROID_HOME="${sdk_root}"
  export JAVA_HOME="${java_home}"
  export PATH="${JAVA_HOME}/bin:${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/tools/bin:${PATH}"
}

doctor() {
  local sdk_root=""
  local java_home=""

  sdk_root="$(find_android_sdk || true)"
  java_home="$(find_java_home || true)"

  printf 'project_root=%s\n' "${PROJECT_ROOT}"
  printf 'android_sdk=%s\n' "${sdk_root:-missing}"
  printf 'java_home=%s\n' "${java_home:-missing}"
  printf 'android_dir=%s\n' "$([[ -d "${PROJECT_ROOT}/android" ]] && echo present || echo missing)"
  printf 'adb=%s\n' "$(command -v adb || echo missing)"

  if [[ -n "${java_home}" ]]; then
    "${java_home}/bin/java" -version
  fi

  if [[ -z "${sdk_root}" || -z "${java_home}" ]]; then
    exit 1
  fi
}

prebuild() {
  cd "${PROJECT_ROOT}"
  npx expo prebuild --platform android --no-install
}

build_apk() {
  setup_env
  cd "${PROJECT_ROOT}"
  local apk_path="${PROJECT_ROOT}/android/app/build/outputs/apk/release/app-release.apk"
  local build_started_at
  local apk_mtime=0
  local gradle_status=0

  if [[ ! -d "${PROJECT_ROOT}/android" ]]; then
    npx expo prebuild --platform android --no-install
  fi

  build_started_at="$(date +%s)"

  (
    cd android
    ./gradlew --stop >/dev/null 2>&1 || true
    ./gradlew --no-daemon -Dorg.gradle.jvmargs="-Xmx4096m -XX:MaxMetaspaceSize=1024m" assembleRelease
  ) || gradle_status=$?

  if [[ ${gradle_status} -ne 0 ]]; then
    if [[ -f "${apk_path}" ]]; then
      apk_mtime="$(stat -f '%m' "${apk_path}")"
      if [[ "${apk_mtime}" -ge "${build_started_at}" ]]; then
        cat >&2 <<'EOF'
Gradle reported a failure after the APK was written.
Likely cause: daemon teardown crash after a successful build.
Treating this run as success because a fresh APK exists.
EOF
        printf '\nAPK path:\n%s\n' "${apk_path}"
        return 0
      fi
    fi

    return "${gradle_status}"
  fi

  printf '\nAPK path:\n%s\n' "${apk_path}"
}

main() {
  local command="${1:-}"

  case "${command}" in
    doctor)
      doctor
      ;;
    prebuild)
      prebuild
      ;;
    apk)
      build_apk
      ;;
    *)
      print_usage >&2
      exit 1
      ;;
  esac
}

main "$@"
