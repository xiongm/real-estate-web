---
description: How to release a new version of the application
---

1. Check for uncommitted changes. If there are untracked files you wish to ignore, use the `--allow-dirty` flag.
2. Run the release script with the `prepare` command:
   ```bash
   ./scripts/release.sh [--allow-dirty] prepare vX.Y.Z
   ```
3. Run the release script with the `tag` command:
   ```bash
   ./scripts/release.sh [--allow-dirty] tag vX.Y.Z
   ```
4. Run the release script with the `publish` command:
   ```bash
   ./scripts/release.sh [--allow-dirty] publish vX.Y.Z
   ```
