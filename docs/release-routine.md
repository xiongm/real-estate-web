# Release Routine (Codex)

Use `scripts/release.sh` to standardize releases. Steps stay manual/opt-in; the script avoids committing or pushing for you until you call `publish`.

## Prereqs
- Docker running for API tests; Playwright browsers installed for web e2e.
- Clean working tree and on the main branch (defaults to `main`, override via `DEFAULT_BRANCH`).
- Tagged versions follow `vX.Y.Z`.

## Commands
- Prepare: `./scripts/release.sh prepare vX.Y.Z`
  - Pulls latest main, runs tests (unless `RUN_TESTS=0`), updates `.env` `APP_VERSION` via latest tag, and scaffolds `releases/vX.Y.Z.md` if missing.
  - Success: tests pass (or explicitly skipped), release note stub exists, working tree still clean.
- Tag: `./scripts/release.sh tag vX.Y.Z`
  - Creates an annotated tag after verifying clean tree and correct branch.
  - Success: `git show vX.Y.Z` shows the tag.
- Publish: `./scripts/release.sh publish vX.Y.Z`
  - Pushes main and the tag.
  - Success: branch + tag pushed to origin.

## Environment Overrides
- `DEFAULT_BRANCH=main` (change if needed)
- `RUN_TESTS=1` (set to `0` to skip automated test commands)
- `API_TEST_CMD="docker compose run --rm api-tests"`
- `WEB_TEST_CMD="cd web && npm run test:e2e"`
- `ALLOW_DOWNGRADE=0` (set to `1` to tag below the latest existing tag)

## Flags
- `--allow-dirty` to run with uncommitted changes (use sparingly)
- `--allow-downgrade` to tag below the latest existing tag

## Typical Flow
1) `./scripts/release.sh prepare vX.Y.Z`
2) Manually review diffs and edit `releases/vX.Y.Z.md`.
3) `./scripts/release.sh tag vX.Y.Z`
4) `./scripts/release.sh publish vX.Y.Z`

If any step fails, fix the issue, keep the working tree clean, and rerun that step. Tests are encouraged; set `RUN_TESTS=0` only if you accept the risk.

## Server: switch to a release
- Use `./scripts/use-release.sh [--allow-dirty] <ref>` to fetch origin and checkout a release branch/tag.
- Accepts either the full branch (`release/vX.Y.Z`) or the tag (`vX.Y.Z`); tries origin branch first, then tag.
