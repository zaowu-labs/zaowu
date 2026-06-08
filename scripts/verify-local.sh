#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

corepack pnpm install --frozen-lockfile
corepack pnpm verify
git diff --check
