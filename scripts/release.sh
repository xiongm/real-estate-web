#!/usr/bin/env bash
set -euo pipefail

# Release helper: ./scripts/release.sh {prepare|tag|publish} vX.Y.Z
# Defaults can be overridden via env:
#   DEFAULT_BRANCH=main RUN_TESTS=1 API_TEST_CMD="docker compose run --rm api-tests" WEB_TEST_CMD="cd web && npm run test:e2e"

DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
RUN_TESTS="${RUN_TESTS:-1}"
API_TEST_CMD="${API_TEST_CMD:-docker compose run --rm api-tests}"
WEB_TEST_CMD="${WEB_TEST_CMD:-cd web && npm run test:e2e}"
ALLOW_DOWNGRADE="${ALLOW_DOWNGRADE:-0}"
# Flags (set via CLI options, not env)
ALLOW_DIRTY=0

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"

log() { echo "[release] $*"; }
die() { echo "[release][error] $*" >&2; exit 1; }

require_clean_worktree() {
  if git status --porcelain | grep -q .; then
    if [[ "$ALLOW_DIRTY" == "1" ]]; then
      log "Working tree dirty; continuing because --allow-dirty is set."
    else
      git status --short >&2
      die "Working tree not clean. Commit/stash or pass --allow-dirty to override."
    fi
  fi
}

ensure_branch() {
  local expected="$1"
  local current
  current="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current" != "$expected" ]]; then
    die "On branch '$current'. Switch to '$expected' first."
  fi
}

ensure_version_arg() {
  [[ -n "${1:-}" ]] || die "Version is required (e.g., v2.5.0)."
}

assert_semver() {
  local version="$1"
  [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must be semver like v1.2.3 (got '$version')."
}

latest_semver_tag() {
  git tag -l "v*.*.*" | sort -V | tail -n1
}

version_lt() {
  local a="$1" b="$2"
  [[ "$a" != "$b" && "$(printf '%s\n%s\n' "$a" "$b" | sort -V | head -n1)" == "$a" ]]
}

validate_version() {
  local version="$1"
  assert_semver "$version"
  if git rev-parse "$version" >/dev/null 2>&1; then
    die "Tag $version already exists."
  fi
  local latest
  latest="$(latest_semver_tag || true)"
  if [[ -n "$latest" ]] && version_lt "$version" "$latest" && [[ "$ALLOW_DOWNGRADE" != "1" ]]; then
    die "Version $version is behind latest tag $latest. Set ALLOW_DOWNGRADE=1 to override."
  fi
}

prepare() {
  local version="$1"
  validate_version "$version"
  require_clean_worktree
  ensure_branch "$DEFAULT_BRANCH"
  log "Pulling latest $DEFAULT_BRANCH..."
  git pull --ff-only origin "$DEFAULT_BRANCH"

  if [[ "$RUN_TESTS" == "1" ]]; then
    log "Running API tests: $API_TEST_CMD"
    (cd "$ROOT_DIR" && eval "$API_TEST_CMD")
    log "Running web e2e: $WEB_TEST_CMD"
    (cd "$ROOT_DIR" && eval "$WEB_TEST_CMD")
  else
    log "Skipping tests (RUN_TESTS=$RUN_TESTS)."
  fi

  log "Updating APP_VERSION from latest tag (if any)..."
  (cd "$ROOT_DIR" && ./release-version.sh || true)

  local release_note="$ROOT_DIR/releases/${version}.md"
  if [[ -e "$release_note" ]]; then
    log "Release note already exists: releases/${version}.md"
  else
    log "Creating release note stub at releases/${version}.md"
    cat > "$release_note" <<EOF
# Release ${version}

## Summary
- TODO: key changes

## Checks
- [ ] API tests
- [ ] Web e2e tests
- [ ] Manual smoke

## Notes
- TODO: deployment notes
EOF
  fi

  log "Prepare complete. Review diffs, update release notes, then run 'tag' step."
}

tag_release() {
  local version="$1"
  validate_version "$version"
  require_clean_worktree
  ensure_branch "$DEFAULT_BRANCH"
  log "Creating annotated tag $version"
  git tag -a "$version" -m "Release $version"
  log "Tag created. Inspect with: git show $version"
}

publish() {
  local version="$1"
  require_clean_worktree
  ensure_branch "$DEFAULT_BRANCH"
  git rev-parse "$version" >/dev/null 2>&1 || die "Tag $version not found. Run tag step first."
  log "Pushing branch $DEFAULT_BRANCH and tag $version"
  git push origin "$DEFAULT_BRANCH"
  git push origin "$version"
  log "Publish complete."
}

usage() {
  cat <<EOF
Usage: $0 [--allow-dirty] [--allow-downgrade] {prepare|tag|publish} vX.Y.Z
  prepare  - pull, (optionally) run tests, update APP_VERSION, create release note stub
  tag      - create annotated git tag
  publish  - push branch and tag

Flags:
  --allow-dirty      allow running with uncommitted changes
  --allow-downgrade  allow tagging below the latest existing tag

Environment:
  DEFAULT_BRANCH   (default: main)
  RUN_TESTS        (default: 1) set 0 to skip test commands
  API_TEST_CMD     (default: "$API_TEST_CMD")
  WEB_TEST_CMD     (default: "$WEB_TEST_CMD")
  ALLOW_DOWNGRADE  (default: 0) set to 1 to allow tagging below latest existing tag
EOF
}

main() {
  # Parse optional flags before the command
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --allow-dirty)
        ALLOW_DIRTY=1
        shift
        ;;
      --allow-downgrade)
        ALLOW_DOWNGRADE=1
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

  local cmd="${1:-}"; shift || true
  case "$cmd" in
    prepare)
      ensure_version_arg "${1:-}"
      prepare "$1"
      ;;
    tag)
      ensure_version_arg "${1:-}"
      tag_release "$1"
      ;;
    publish)
      ensure_version_arg "${1:-}"
      publish "$1"
      ;;
    -h|--help|"")
      usage
      ;;
    *)
      die "Unknown command: $cmd"
      ;;
  esac
}

main "$@"
