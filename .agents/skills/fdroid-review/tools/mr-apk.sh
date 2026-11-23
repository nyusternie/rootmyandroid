#!/usr/bin/env bash
# Fetch the MR's own fdroid build artifact, identify the signed reference
# binary, and verify its certificate against the recipe's AllowedAPKSigningKeys.
# usage: mr-apk.sh <iid>
set -euo pipefail
iid=${1:?usage: mr-apk.sh <iid>}
mr=$(glab api "projects/fdroid%2Ffdroiddata/merge_requests/$iid")
pid=$(jq -r '.head_pipeline.id' <<<"$mr"); proj=$(jq -r '.head_pipeline.project_id' <<<"$mr")
jid=$(glab api "projects/$proj/pipelines/$pid/jobs?per_page=100" | jq -r '.[]|select(.name=="fdroid build")|.id')
out=/tmp/mr-apk-$iid; rm -rf "$out"; mkdir -p "$out/x"
glab api "projects/$proj/jobs/$jid/artifacts" > "$out/art.zip"
unzip -qo "$out/art.zip" -d "$out/x" || { echo "artifact unavailable (expired?) — fall back to job traces"; exit 1; }
ref=$(find "$out/x" -path '*/tmp/binaries/*.apk' | head -1)
built=$(find "$out/x" -path '*/tmp/*.apk' ! -path '*/binaries/*' | head -1)
apksigner=$(ls -d /Workspace/Android/Sdk/build-tools/*/ 2>/dev/null | sort -V | tail -1)apksigner
echo "built (unsigned, for reference): ${built:-none}"
echo "reference (install this):        ${ref:-none}"
[ -n "$ref" ] || exit 1
sha=$(sha256sum "$ref" | cut -d' ' -f1); echo "sha256: $sha"
cert=$("$apksigner" verify --print-certs "$ref" 2>/dev/null | grep -oE 'SHA-256 digest: [a-f0-9]+' | head -1 | awk '{print $3}')
echo "cert:   $cert"
key=$(glab api "projects/fdroid%2Ffdroiddata/merge_requests/$iid/changes" \
      | jq -r '.changes[]|select(.new_path|test("metadata/"))|.diff' \
      | grep -oE '^\+AllowedAPKSigningKeys: [a-f0-9]+' | awk '{print $2}' | head -1)
echo "recipe: ${key:-none}"
[ -n "$cert" ] && [ "$cert" = "$key" ] && echo "VERDICT: certificate matches AllowedAPKSigningKeys" || echo "VERDICT: MISMATCH — do not install"
