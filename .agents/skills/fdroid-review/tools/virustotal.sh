#!/usr/bin/env bash
# VirusTotal hash lookup for the report's Security Scan row.
# The API key never leaves the two credential stores (AGENTS rule 11):
# the curl call runs ON the store host, only the sha256 travels.
# Hash lookups only — nothing is uploaded unless you pass --upload.
# usage: virustotal.sh <sha256|apk> [--upload]
set -euo pipefail
target=${1:?usage: virustotal.sh <sha256|apk> [--upload]}
upload=${2:-}
if [ -f "$target" ]; then
  sha=$(sha256sum "$target" | cut -d' ' -f1); src=$target
else
  sha=$(printf '%s' "$target" | tr 'A-Z' 'a-z'); src="hash"
fi
case "$sha" in *[!0-9a-f]*|"") echo "not a sha256: $sha"; exit 1 ;; esac
[ ${#sha} -eq 64 ] || { echo "not a sha256 (length ${#sha})"; exit 1; }

host=${VT_HOST:-}
if [ -z "$host" ]; then
  if ssh -o BatchMode=yes -o ConnectTimeout=8 blackhost true 2>/dev/null; then host=blackhost; else host=apecsdev; fi
fi
if [ "$host" = blackhost ]; then keypath=/root/.virustotal/api-key; else keypath='$HOME/.config/virustotal/api_key'; fi

resp=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" bash -s -- "$keypath" "$sha" <<'EOS'
keypath=$1; sha=$2
K=$(cat "$keypath") || { echo '{"error":"key-unreadable"}'; exit 0; }
curl -s -w '\n%{http_code}' --config <(printf 'header = "x-apikey: %s"\n' "$K") \
  "https://www.virustotal.com/api/v3/files/$sha"
EOS
)
code=$(printf '%s\n' "$resp" | tail -1)
body=$(printf '%s\n' "$resp" | sed '$d')

echo "sha256: $sha"
echo "source: $src   store: $host"
case "$code" in
  200)
    jq -r '.data.attributes.last_analysis_stats as $s
      | "malicious=\($s.malicious) suspicious=\($s.suspicious) harmless=\($s.harmless) undetected=\($s.undetected) timeout=\($s.timeout)"
      | ., ("verdict: " + ((($s.malicious + $s.suspicious) | tostring)) + " detection(s) of " + ((($s.malicious + $s.suspicious + $s.harmless + $s.undetected + $s.timeout) | tostring)))' <<<"$body" 2>/dev/null || echo "unparsable response"
    ;;
  404) echo "verdict: UNKNOWN to VirusTotal — no report for this hash" ;;
  401) echo "verdict: KEY REJECTED (401) — check the store copy" ;;
  429) echo "verdict: RATE LIMITED (429) — free tier allows few lookups per minute" ;;
  *)   echo "verdict: HTTP $code"; printf '%s\n' "$body" | head -c 200 ;;
esac
if [ "$upload" = "--upload" ] && [ -f "$target" ]; then
  echo "upload: not implemented on purpose (privacy); submit manually if required"
fi
