#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD"

# Run preflight checks for workspace links
pnpm run preflight:workspace-links

# Build TypeScript packages in dependency order
# tsc is available via pnpm's bin resolution
cd "$ROOT/packages/shared" && tsc && cd "$ROOT"
cd "$ROOT/packages/db" && tsc && cd "$ROOT"
cd "$ROOT/packages/adapter-utils" && tsc && cd "$ROOT"
cd "$ROOT/server" && tsc && cd "$ROOT"

# Build UI with Vite
cd "$ROOT/ui" && pnpm run build && cd "$ROOT"
