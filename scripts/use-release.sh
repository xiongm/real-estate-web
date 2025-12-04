#!/usr/bin/env bash
set -euo pipefail

# Switch to a release branch or tag on a server.
# Usage: ./scripts/use-release.sh [--allow-dirty] <version-or-branch>
# Examples:
#   ./scripts/use-release.sh v2.5.0
#   ./scripts/use-release.sh release/v2.5.0

ALLOW_DIRTY=0
ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"

log() { echo "[use-release] $*"; }
die() { echo "[use-release][error] $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $0 [--allow-dirty] <version-or-branch>
  Tries origin/<ref>, origin/release/<ref>, then tag <ref>.
Flags:
  --allow-dirty   allow switching with uncommitted changes
EOF
}

require_clean_worktree() {
  if git status --porcelain | grep -q .; then
    if [[ "$ALLOW_DIRTY" == "1" ]]; then
      log "Working tree dirty; continuing because --allow-dirty is set."
    else
      git status --short >&2
      die "Working tree not clean. Commit/stash or pass --allow-dirty."
    fi
  fi
}

resolve_target() {
  local ref="$1"
  if git rev-parse --verify --quiet "refs/remotes/origin/$ref" >/dev/null; then
    TARGET="$ref"; TARGET_KIND="branch"; return
  fi
  if git rev-parse --verify --quiet "refs/remotes/origin/release/$ref" >/dev/null; then
    TARGET="release/$ref"; TARGET_KIND="branch"; return
  fi
  if git rev-parse --verify --quiet "refs/tags/$ref" >/dev/null; then
    TARGET="$ref"; TARGET_KIND="tag"; return
  fi
  die "Remote branch/tag not found for '$ref'. Tried origin/$ref, origin/release/$ref, and tag $ref."
}

sync_app_version() {
  local script="${ROOT_DIR}/release-version.sh"
  if [[ ! -f "$script" ]]; then
    log "release-version.sh not found; skipping APP_VERSION update."
    return
  fi
  log "Updating APP_VERSION in .env via release-version.sh"
  if (cd "$ROOT_DIR" && bash "$script"); then
    log "APP_VERSION updated from latest tag."
  else
    log "Warning: release-version.sh failed; APP_VERSION may be stale."
  fi
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --allow-dirty)
        ALLOW_DIRTY=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        break
        ;;
    esac
  done

  local ref="${1:-}"
  [[ -n "$ref" ]] || die "Release ref required (e.g., v2.5.0 or release/v2.5.0)."

  require_clean_worktree

  log "Fetching origin branches/tags..."
  git fetch origin --tags

  TARGET=""
  TARGET_KIND=""
  resolve_target "$ref"

  if [[ "$TARGET_KIND" == "tag" ]]; then
    log "Checking out tag $TARGET"
    git checkout "$TARGET"
    sync_app_version
    log "Now on tag $TARGET"
    exit 0
  fi

  log "Checking out branch $TARGET"
  if git rev-parse --verify --quiet "refs/heads/$TARGET" >/dev/null; then
    git checkout "$TARGET"
    git pull --ff-only origin "$TARGET"
  else
    git checkout -b "$TARGET" "origin/$TARGET"
  fi
  sync_app_version
  log "Now on branch $TARGET"

  # Optional: remind about APP_VERSION drift
  if [[ -f ".env" ]]; then
    current_app_version="$(grep '^APP_VERSION=' .env | head -n1 | cut -d'=' -f2- || true)"
    if [[ -n "$current_app_version" ]]; then
      if [[ "$current_app_version" != "$ref" && "$current_app_version" != "${ref#release/}" ]]; then
        log "Notice: .env APP_VERSION=$current_app_version does not match target $ref. Run ./release-version.sh if you want to sync to the latest tag."
      fi
    fi
  fi
}

main "$@"
