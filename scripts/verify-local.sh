#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm verify:smoke
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
corepack pnpm pack:check
git diff --check
