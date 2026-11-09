#!/usr/bin/env bash
# scripts/package-rootzd-module.sh — package the already-BUILT rootzd binary
# as a standard Magisk module zip (Option B customer install path; owner
# ruling 2026-11-09). Host-side packaging only (zip, no compiling) — the
# no-host-builds rule still applies; produce the binary first via
# scripts/build-rootzd-remote.sh on the build runner.
set -euo pipefail
cd "$(dirname "$0")/.."

BIN=apps/rootzd/dist/rootzd-aarch64-linux-android
OUT="$PWD/apps/rootzd/dist/rootzd-magisk-module-v26.11.8.zip"

[ -f "$BIN" ] || {
  echo "missing $BIN — build it first: scripts/build-rootzd-remote.sh" >&2
  exit 1
}
command -v zip >/dev/null || { echo "'zip' not found on host" >&2; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp "$BIN" "$STAGE/rootzd"
cp apps/rootzd/module/module.prop \
   apps/rootzd/module/service.sh \
   apps/rootzd/module/customize.sh \
   "$STAGE/"

rm -f "$OUT"
(cd "$STAGE" && zip -q -r "$OUT" .)
echo "wrote $OUT ($(stat -c%s "$OUT") bytes)"
