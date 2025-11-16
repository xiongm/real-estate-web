#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICES=(api worker db redis minio)

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status>

start   Start backend services (api, worker, db, redis, minio) via docker compose
stop    Stop those services
status  Show docker compose status for those services
EOF
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  usage
  exit 1
fi

cd "$PROJECT_ROOT"

case "$cmd" in
  start)
    docker compose up -d "${SERVICES[@]}"
    ;;
  stop)
    docker compose stop "${SERVICES[@]}"
    ;;
  status)
    docker compose ps "${SERVICES[@]}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
