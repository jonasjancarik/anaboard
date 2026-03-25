#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/supabase/functions/.env.local"
FUNCTIONS=(
  "ai-emoji-suggest"
  "ai-autocomplete-rerank"
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

check_env() {
  require_env_file

  local required_local=(
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "OPENAI_API_KEY"
  )

  local missing=()
  local key=""
  local value=""

  for key in "${required_local[@]}"; do
    value="$(get_env_value "${key}" || true)"
    if [[ -z "${value}" ]]; then
      missing+=("${key}")
    fi
  done

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

  openai_api_key="$(get_env_value "OPENAI_API_KEY" || true)"
  openai_text_model="$(get_env_value "OPENAI_TEXT_MODEL" || true)"
  openai_image_model="$(get_env_value "OPENAI_IMAGE_MODEL" || true)"

  if [[ -z "${openai_api_key}" ]]; then
    echo "OPENAI_API_KEY missing from ${ENV_FILE}" >&2
    exit 1
  fi

  cd "${PROJECT_ROOT}"
  supabase secrets set OPENAI_API_KEY="${openai_api_key}"

  if [[ -n "${openai_text_model}" ]]; then
    supabase secrets set OPENAI_TEXT_MODEL="${openai_text_model}"
  fi

  if [[ -n "${openai_image_model}" ]]; then
    supabase secrets set OPENAI_IMAGE_MODEL="${openai_image_model}"
  fi
}

deploy_functions() {
  require_cli
  set_hosted_secrets
  cd "${PROJECT_ROOT}"

  local function_name=""
  for function_name in "${FUNCTIONS[@]}"; do
    supabase functions deploy "${function_name}"
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
