#!/usr/bin/env bash
# .agents/skills/build/scripts/materialize-rn-farm.sh <app-dir>
#
# Materialize <app-dir>/node_modules as a symlink farm into the hoisted
# workspace-root node_modules.
#
# Why: with `nodeLinker: hoisted` pnpm installs ONLY to the workspace root
# (apps/web has no local node_modules at all), but React Native's gradle
# plugin + codegen hardcode app-local node_modules paths (e.g.
# apps/ios/node_modules/react-native/ReactAndroid/gradle.properties).
# The farms under apps/android and apps/guardian are untracked local state
# that fresh runner checkouts do not have — this script recreates them
# deterministically. Symlink targets are ABSOLUTE (computed at runtime), so
# the script works on any host/runner checkout path.
#
# Usage: materialize-rn-farm.sh apps/ios
set -euo pipefail

app_dir="$1"
root_nm="$(cd "$app_dir/../.." && pwd)/node_modules"
app_nm="$app_dir/node_modules"

[[ -d "$root_nm" ]] || { echo "error: $root_nm missing — run pnpm install first" >&2; exit 1; }
mkdir -p "$app_nm"

shopt -s nullglob dotglob
for entry in "$root_nm"/*; do
  name="$(basename "$entry")"
  # pnpm metadata dirs are not package entries.
  [[ "$name" == ".bin" || "$name" == ".modules.yaml" || "$name" == ".pnpm-state.json" ]] && continue
  if [[ "$name" == @* && -d "$entry" && ! -L "$entry" ]]; then
    # Scoped package dir: link each package inside it.
    mkdir -p "$app_nm/$name"
    for sub in "$entry"/*; do
      ln -sfn "$root_nm/$name/$(basename "$sub")" "$app_nm/$name/$(basename "$sub")"
    done
  else
    ln -sfn "$root_nm/$name" "$app_nm/$name"
  fi
done
echo "farm: $(ls "$app_nm" | wc -l) entries in $app_nm -> $root_nm"
