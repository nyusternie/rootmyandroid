#!/usr/bin/env bash
# scripts/build-rootzd-remote.sh — build apps/rootzd on the build runner.
#
# Builds NEVER run on the local host (owner rule). This script rsyncs the
# crate to the runner, builds there, and pulls the artifacts back.
#
# Configuration comes from .env.local (gitignored) or the environment:
#   RMA_BUILD_HOST  — runner hostname/address   (repo stays generic on purpose)
#   RMA_BUILD_USER  — ssh user on the runner
#   RMA_BUILD_PATH  — checkout/scratch dir on the runner
# The runner provides the Android NDK on PATH via its own profile.

set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$here/.env.local" ] && . "$here/.env.local"

: "${RMA_BUILD_HOST:?set RMA_BUILD_HOST in .env.local (see .env.local.example)}"
: "${RMA_BUILD_USER:?set RMA_BUILD_USER in .env.local}"
: "${RMA_BUILD_PATH:?set RMA_BUILD_PATH in .env.local}"

target="${1:-aarch64-linux-android}"

rsync -a --delete --exclude target --exclude dist \
  "$here/apps/rootzd/" "$RMA_BUILD_USER@$RMA_BUILD_HOST:$RMA_BUILD_PATH/rootzd/"

ssh "$RMA_BUILD_USER@$RMA_BUILD_HOST" \
  "cd '$RMA_BUILD_PATH/rootzd' && cargo build --release --target '$target'"

mkdir -p "$here/apps/rootzd/dist"
rsync -a \
  "$RMA_BUILD_USER@$RMA_BUILD_HOST:$RMA_BUILD_PATH/rootzd/target/$target/release/rootzd" \
  "$here/apps/rootzd/dist/rootzd-$target"

echo "built: apps/rootzd/dist/rootzd-$target"
