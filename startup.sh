#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.host-services.yml"

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

  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${FRONTEND_PID:-}" ]]; then
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

echo "Using Mongo URI: ${MONGO_URI_RUNTIME}"
echo "Using Meilisearch URL: ${MEILI_HOST_RUNTIME}"
echo "Using RAG API URL: ${RAG_API_URL_RUNTIME}"

echo "Building shared packages..."
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package

if is_http_ready "${BACKEND_HEALTH_URL}"; then
  echo "Backend already running at ${BACKEND_HEALTH_URL}; reusing existing process."
else
  echo "Starting backend..."
  npx cross-env \
    NODE_ENV=production \
    MONGO_URI="${MONGO_URI_RUNTIME}" \
    MEILI_HOST="${MEILI_HOST_RUNTIME}" \
    RAG_API_URL="${RAG_API_URL_RUNTIME}" \
    node api/server/index.js &
  BACKEND_PID=$!

  wait_for_http "${BACKEND_HEALTH_URL}" "LibreChat backend"
fi

if is_http_ready "${FRONTEND_URL}"; then
  echo "Frontend already running at ${FRONTEND_URL}; reusing existing process."
else
  echo "Starting frontend..."
  (
    cd "${ROOT_DIR}/client"
    HOST="127.0.0.1" PORT="${FRONTEND_PORT_RUNTIME}" BACKEND_PORT="${BACKEND_PORT_RUNTIME}" npm run dev
  ) &
  FRONTEND_PID=$!

  wait_for_http "${FRONTEND_URL}" "LibreChat frontend"
fi

echo "Backend:  http://localhost:${BACKEND_PORT_RUNTIME}"
echo "Frontend: ${FRONTEND_URL}"

wait
