#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/supabase/functions/.env.local"
FUNCTIONS=(
  "ai-emoji-suggest"
  "ai-image-draft-generate"
  "ai-image-draft-promote"
)

print_usage() {
  cat <<'EOF'
Usage:
  scripts/supabase-functions.sh check-env
  scripts/supabase-functions.sh serve
  scripts/supabase-functions.sh set-secrets
  scripts/supabase-functions.sh deploy
EOF
}

require_cli() {
  if ! command -v supabase >/dev/null 2>&1; then
    cat >&2 <<'EOF'
Supabase CLI not found.

Install:
  brew install supabase/tap/supabase
EOF
    exit 1
  fi
}

require_env_file() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    cat >&2 <<EOF
Missing env file:
  ${ENV_FILE}
EOF
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  local line=""

  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi

  printf '%s\n' "${line#*=}"
}

resolve_project_ref() {
  local explicit_ref=""
  local url=""

  explicit_ref="$(get_env_value "SUPABASE_PROJECT_REF" || true)"
  if [[ -n "${explicit_ref}" ]]; then
    printf '%s\n' "${explicit_ref}"
    return 0
  fi

  url="$(get_env_value "SUPABASE_URL" || true)"
  if [[ "${url}" =~ ^https://([^.]+)\.supabase\.co/?$ ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi

  echo "Could not determine project ref from SUPABASE_URL. Set SUPABASE_PROJECT_REF in ${ENV_FILE}." >&2
  exit 1
}

check_env() {
  require_env_file

  local always_required=(
    "SUPABASE_URL"
    "OPENAI_API_KEY"
  )

  local missing=()
  local key=""
  local value=""

  for key in "${always_required[@]}"; do
    value="$(get_env_value "${key}" || true)"
    if [[ -z "${value}" ]]; then
      missing+=("${key}")
    fi
  done

  local user_key=""
  local admin_key=""
  user_key="$(get_env_value "SB_PUBLISHABLE_KEY" || true)"
  [[ -z "${user_key}" ]] && user_key="$(get_env_value "SUPABASE_ANON_KEY" || true)"
  admin_key="$(get_env_value "SB_SECRET_KEY" || true)"
  [[ -z "${admin_key}" ]] && admin_key="$(get_env_value "SUPABASE_SERVICE_ROLE_KEY" || true)"

  if [[ -z "${user_key}" ]]; then
    missing+=("SB_PUBLISHABLE_KEY|SUPABASE_ANON_KEY")
  fi

  if [[ -z "${admin_key}" ]]; then
    missing+=("SB_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    printf 'Missing env keys: %s\n' "${missing[*]}" >&2
    exit 1
  fi

  cat <<'EOF'
Local function env looks complete.
EOF
}

serve_functions() {
  require_cli
  check_env
  cd "${PROJECT_ROOT}"
  supabase functions serve --env-file "${ENV_FILE}"
}

set_hosted_secrets() {
  require_cli
  require_env_file

  local openai_api_key=""
  local openai_text_model=""
  local openai_image_model=""
  local sb_publishable_key=""
  local sb_secret_key=""
  local project_ref=""

  openai_api_key="$(get_env_value "OPENAI_API_KEY" || true)"
  openai_text_model="$(get_env_value "OPENAI_TEXT_MODEL" || true)"
  openai_image_model="$(get_env_value "OPENAI_IMAGE_MODEL" || true)"
  sb_publishable_key="$(get_env_value "SB_PUBLISHABLE_KEY" || true)"
  sb_secret_key="$(get_env_value "SB_SECRET_KEY" || true)"
  project_ref="$(resolve_project_ref)"

  if [[ -z "${openai_api_key}" ]]; then
    echo "OPENAI_API_KEY missing from ${ENV_FILE}" >&2
    exit 1
  fi

  cd "${PROJECT_ROOT}"
  supabase secrets set --project-ref "${project_ref}" OPENAI_API_KEY="${openai_api_key}"

  if [[ -n "${openai_text_model}" ]]; then
    supabase secrets set --project-ref "${project_ref}" OPENAI_TEXT_MODEL="${openai_text_model}"
  fi

  if [[ -n "${openai_image_model}" ]]; then
    supabase secrets set --project-ref "${project_ref}" OPENAI_IMAGE_MODEL="${openai_image_model}"
  fi

  if [[ -n "${sb_publishable_key}" ]]; then
    supabase secrets set --project-ref "${project_ref}" SB_PUBLISHABLE_KEY="${sb_publishable_key}"
  else
    echo "SB_PUBLISHABLE_KEY not set locally; hosted functions will fall back to legacy SUPABASE_ANON_KEY." >&2
  fi

  if [[ -n "${sb_secret_key}" ]]; then
    supabase secrets set --project-ref "${project_ref}" SB_SECRET_KEY="${sb_secret_key}"
  else
    echo "SB_SECRET_KEY not set locally; hosted functions will fall back to legacy SUPABASE_SERVICE_ROLE_KEY." >&2
  fi
}

deploy_functions() {
  require_cli
  set_hosted_secrets
  cd "${PROJECT_ROOT}"
  local project_ref=""
  project_ref="$(resolve_project_ref)"

  rm -f "${PROJECT_ROOT}/supabase/functions/deno.lock"

  local function_name=""
  for function_name in "${FUNCTIONS[@]}"; do
    supabase functions deploy --project-ref "${project_ref}" "${function_name}"
  done
}

main() {
  local command="${1:-}"

  case "${command}" in
    check-env)
      check_env
      ;;
    serve)
      serve_functions
      ;;
    set-secrets)
      set_hosted_secrets
      ;;
    deploy)
      deploy_functions
      ;;
    *)
      print_usage >&2
      exit 1
      ;;
  esac
}

main "$@"
