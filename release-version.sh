#!/usr/bin/env bash
set -euo pipefail

# Updates (or adds) APP_VERSION in the repo-level .env using the latest tag.

# Work from the directory containing this script (repo root).
ROOT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

latest_tag="$(git describe --tags --abbrev=0 2>/dev/null || true)"
if [ -z "${latest_tag}" ]; then
  echo "No git tags found; cannot update APP_VERSION." >&2
  exit 1
fi

touch "${ENV_FILE}"

tmp_file="$(mktemp)"
cleanup() { rm -f "${tmp_file}"; }
trap cleanup EXIT

if grep -q '^APP_VERSION=' "${ENV_FILE}"; then
  awk -v tag="${latest_tag}" '
    BEGIN { updated = 0 }
    /^APP_VERSION=/ { print "APP_VERSION=" tag; updated = 1; next }
    { print }
    END {
      if (!updated) {
        print "APP_VERSION=" tag;
      }
    }
  ' "${ENV_FILE}" > "${tmp_file}"
else
  # Preserve existing content (without trailing blank lines) and append the version.
  if [ -s "${ENV_FILE}" ]; then
    awk '
      { lines[NR] = $0 }
      END {
        last = NR
        while (last > 0 && lines[last] ~ /^[[:space:]]*$/) { last-- }
        for (i = 1; i <= last; i++) print lines[i]
      }
    ' "${ENV_FILE}" > "${tmp_file}"
  else
    : > "${tmp_file}"
  fi

  if [ -s "${tmp_file}" ]; then
    printf "\n" >> "${tmp_file}"
  fi
  printf "APP_VERSION=%s\n" "${latest_tag}" >> "${tmp_file}"
fi

mv "${tmp_file}" "${ENV_FILE}"
echo "APP_VERSION set to ${latest_tag} in ${ENV_FILE}"
