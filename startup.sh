#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.host-services.yml"
DETACH_MODE=0
LOG_DIR="${ROOT_DIR}/.startup-logs"

for arg in "$@"; do
  case "${arg}" in
    -d|--detach)
      DETACH_MODE=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./startup.sh [--detach]

Starts LibreChat dependencies, builds shared packages, then starts the backend
and frontend dev servers.

Options:
  -d, --detach   Exit after services are ready instead of staying attached to logs
  -h, --help     Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

LOCAL_UID="$(id -u)"
LOCAL_GID="$(id -g)"
export RAG_PORT="${RAG_PORT:-8000}"

wait_for_tcp() {
  local host="$1"
  local port="$2"
  local name="$3"
  local retries="${4:-60}"

  python - "$host" "$port" "$name" "$retries" <<'PY'
import socket
import sys
import time

host, port, name, retries = sys.argv[1], int(sys.argv[2]), sys.argv[3], int(sys.argv[4])

for _ in range(retries):
    try:
        with socket.create_connection((host, port), timeout=1):
            print(f"{name} is ready on {host}:{port}")
            sys.exit(0)
    except OSError:
        time.sleep(1)

print(f"Timed out waiting for {name} on {host}:{port}", file=sys.stderr)
sys.exit(1)
PY
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local retries="${3:-60}"

  for _ in $(seq 1 "${retries}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      echo "${name} is ready at ${url}"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for ${name} at ${url}" >&2
  return 1
}

is_http_ready() {
  local url="$1"
  curl -fsS "${url}" >/dev/null 2>&1
}

find_ready_http_url() {
  for url in "$@"; do
    if is_http_ready "${url}"; then
      echo "${url}"
      return 0
    fi
  done

  return 1
}

needs_build() {
  local dir="$1"
  local dist_dir="${dir}/dist"

  if [[ ! -d "${dist_dir}" ]]; then
    return 0
  fi

  python - "$dir" "$dist_dir" <<'PY'
import os
import sys

root = sys.argv[1]
dist = sys.argv[2]

exclude_dirs = {
    'dist',
    'node_modules',
    '.turbo',
    'coverage',
    'logs',
}
source_exts = {
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
}
source_names = {
    'package.json',
    'rollup.config.js',
    'babel.config.cjs',
    'tsconfig.json',
    'tsconfig.build.json',
    'tsconfig.spec.json',
}

latest_source = 0.0
for current_root, dirs, files in os.walk(root):
    dirs[:] = [d for d in dirs if d not in exclude_dirs]
    for name in files:
        if name in source_names or os.path.splitext(name)[1] in source_exts:
            latest_source = max(latest_source, os.path.getmtime(os.path.join(current_root, name)))

latest_dist = 0.0
for current_root, _, files in os.walk(dist):
    for name in files:
        latest_dist = max(latest_dist, os.path.getmtime(os.path.join(current_root, name)))

sys.exit(0 if latest_source > latest_dist else 1)
PY
}

build_if_needed() {
  local label="$1"
  local dir="$2"
  local command="$3"

  if needs_build "${dir}"; then
    echo "Building ${label}..."
    (cd "${dir}" && eval "${command}")
  else
    echo "Skipping ${label}; dist is current."
  fi
}

normalize_loopback_url() {
  local url="$1"

  if [[ "${url}" == *"0.0.0.0"* ]]; then
    echo "${url//0.0.0.0/127.0.0.1}"
  else
    echo "${url}"
  fi
}

resolve_mongo_uri() {
  local candidate="${MONGO_URI:-mongodb://127.0.0.1:27017/LibreChat}"

  if MONGO_URI_CANDIDATE="${candidate}" python - <<'PY'
import os
import socket
from urllib.parse import urlparse

uri = os.environ["MONGO_URI_CANDIDATE"]
parsed = urlparse(uri)
host = parsed.hostname or "127.0.0.1"
port = parsed.port or 27017

try:
    with socket.create_connection((host, port), timeout=1):
        pass
except OSError:
    raise SystemExit(1)
PY
  then
    echo "${candidate}"
  else
    echo "mongodb://127.0.0.1:27018/LibreChat"
  fi
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${BACKEND_PID:-}" && "${DETACH_MODE}" != "1" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${FRONTEND_PID:-}" && "${DETACH_MODE}" != "1" ]]; then
    kill "${FRONTEND_PID}" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

echo "Starting local service dependencies..."
env UID="${LOCAL_UID}" GID="${LOCAL_GID}" docker compose \
  -f "${ROOT_DIR}/docker-compose.yml" \
  -f "${COMPOSE_FILE}" \
  up -d mongodb meilisearch vectordb rag_api

wait_for_tcp "127.0.0.1" "7700" "Meilisearch"
wait_for_http "http://127.0.0.1:${RAG_PORT}/health" "RAG API"

MONGO_URI_RUNTIME="$(resolve_mongo_uri)"
MEILI_HOST_RUNTIME="$(normalize_loopback_url "${MEILI_HOST:-http://127.0.0.1:7700}")"
RAG_API_URL_RUNTIME="$(normalize_loopback_url "${RAG_API_URL:-http://127.0.0.1:${RAG_PORT}}")"
BACKEND_PORT_RUNTIME="${PORT:-3080}"
FRONTEND_PORT_RUNTIME="${FRONTEND_PORT:-3090}"
BACKEND_HEALTH_URL="http://localhost:${BACKEND_PORT_RUNTIME}/health"
FRONTEND_URL="http://127.0.0.1:${FRONTEND_PORT_RUNTIME}"
FRONTEND_FALLBACK_URL="http://localhost:${FRONTEND_PORT_RUNTIME}"

echo "Using Mongo URI: ${MONGO_URI_RUNTIME}"
echo "Using Meilisearch URL: ${MEILI_HOST_RUNTIME}"
echo "Using RAG API URL: ${RAG_API_URL_RUNTIME}"

echo "Checking shared packages..."
build_if_needed "data-provider" "${ROOT_DIR}/packages/data-provider" "npm run build"
build_if_needed "data-schemas" "${ROOT_DIR}/packages/data-schemas" "npm run build"
build_if_needed "api" "${ROOT_DIR}/packages/api" "npm run build"
build_if_needed "client-package" "${ROOT_DIR}/packages/client" "npm run build"

if is_http_ready "${BACKEND_HEALTH_URL}"; then
  echo "Backend already running at ${BACKEND_HEALTH_URL}; reusing existing process."
else
  echo "Starting backend..."
  if [[ "${DETACH_MODE}" == "1" ]]; then
    mkdir -p "${LOG_DIR}"
    nohup env \
      NODE_ENV=production \
      BAN_VIOLATIONS="${BAN_VIOLATIONS:-false}" \
      MONGO_URI="${MONGO_URI_RUNTIME}" \
      MEILI_HOST="${MEILI_HOST_RUNTIME}" \
      RAG_API_URL="${RAG_API_URL_RUNTIME}" \
      node api/server/index.js < /dev/null > "${LOG_DIR}/backend.log" 2>&1 &
  else
    env \
      NODE_ENV=production \
      BAN_VIOLATIONS="${BAN_VIOLATIONS:-false}" \
      MONGO_URI="${MONGO_URI_RUNTIME}" \
      MEILI_HOST="${MEILI_HOST_RUNTIME}" \
      RAG_API_URL="${RAG_API_URL_RUNTIME}" \
      node api/server/index.js &
  fi
  BACKEND_PID=$!
  if [[ "${DETACH_MODE}" == "1" ]]; then
    disown "${BACKEND_PID}"
  fi

  wait_for_http "${BACKEND_HEALTH_URL}" "LibreChat backend"
fi

if READY_FRONTEND_URL="$(find_ready_http_url "${FRONTEND_URL}" "${FRONTEND_FALLBACK_URL}")"; then
  FRONTEND_URL="${READY_FRONTEND_URL}"
  echo "Frontend already running at ${FRONTEND_URL}; reusing existing process."
else
  echo "Starting frontend..."
  if [[ "${DETACH_MODE}" == "1" ]]; then
    mkdir -p "${LOG_DIR}"
    nohup bash -lc \
      "cd \"${ROOT_DIR}/client\" && env HOST=\"127.0.0.1\" PORT=\"${FRONTEND_PORT_RUNTIME}\" BACKEND_PORT=\"${BACKEND_PORT_RUNTIME}\" npm run dev" \
      < /dev/null > "${LOG_DIR}/frontend.log" 2>&1 &
  else
    (
      cd "${ROOT_DIR}/client"
      env HOST="127.0.0.1" PORT="${FRONTEND_PORT_RUNTIME}" BACKEND_PORT="${BACKEND_PORT_RUNTIME}" npm run dev
    ) &
  fi
  FRONTEND_PID=$!
  if [[ "${DETACH_MODE}" == "1" ]]; then
    disown "${FRONTEND_PID}"
  fi

  wait_for_http "${FRONTEND_URL}" "LibreChat frontend"
fi

echo "Backend:  http://localhost:${BACKEND_PORT_RUNTIME}"
echo "Frontend: ${FRONTEND_URL}"

if [[ "${DETACH_MODE}" == "1" ]]; then
  echo "Services are ready. Exiting because --detach was provided."
  echo "Backend log:  ${LOG_DIR}/backend.log"
  echo "Frontend log: ${LOG_DIR}/frontend.log"
  exit 0
fi

echo "Startup is complete. Streaming backend/frontend logs below."
echo "Press Ctrl+C to stop processes started by this script, or run ./startup.sh --detach to start and exit."

wait
