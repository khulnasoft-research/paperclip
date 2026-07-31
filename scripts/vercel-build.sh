#!/usr/bin/env bash
set -euo pipefail

TSC="node node_modules/typescript/bin/tsc"
ROOT="$PWD"

# Build TypeScript packages in dependency order
"$TSC" -p "$ROOT/packages/shared/tsconfig.json"
"$TSC" -p "$ROOT/packages/db/tsconfig.json"
"$TSC" -p "$ROOT/packages/adapter-utils/tsconfig.json"
"$TSC" -p "$ROOT/server/tsconfig.json"

# Build UI with Vite
pnpm --filter @paperclipai/ui build
