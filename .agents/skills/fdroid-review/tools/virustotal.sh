#!/usr/bin/env bash
# VirusTotal scan for the report's Security Scan row.
# The API key never leaves the two credential stores (AGENTS rule 11):
# the curl calls run ON the store host, only the sha256 travels for lookups.
# Policy (owner ruling 2026-11-24): ALWAYS obtain a real scan — when the
# hash is unknown, the sample is uploaded and the analysis is polled, so the
# row carries engine counters instead of "unknown".
# usage: virustotal.sh <sha256|apk> [--analysis <id>]
set -euo pipefail
target=${1:?usage: virustotal.sh <sha256|apk> [--analysis <id>]}
mode=${2:-}
isfile=
if [ -f "$target" ]; then
  sha=$(sha256sum "$target" | cut -d' ' -f1); src=$target; isfile=1
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

vt_get() { # $1 = api path
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" bash -s -- "$keypath" "$1" <<'EOS'
keypath=$1; path=$2
K=$(cat "$keypath") || { echo '{"error":"key-unreadable"}'; exit 0; }
curl -s -w '\n%{http_code}' --config <(printf 'header = "x-apikey: %s"\n' "$K") \
  "https://www.virustotal.com/api/v3/$path"
EOS
}

print_stats() { # $1 = json body
  jq -r '.data.attributes.stats as $s
    | "malicious=\($s.malicious) suspicious=\($s.suspicious) harmless=\($s.harmless) undetected=\($s.undetected) timeout=\($s.timeout)"
    | ., ("verdict: " + ((($s.malicious + $s.suspicious) | tostring)) + " detection(s) of " + ((($s.malicious + $s.suspicious + $s.harmless + $s.undetected + $s.timeout) | tostring)))' <<<"$1" 2>/dev/null || echo "unparsable response"
}

poll_analysis() { # $1 = analysis id
  for i in $(seq 1 10); do
    sleep 5
    r=$(vt_get "analyses/$1"); c=$(printf '%s\n' "$r" | tail -1); b=$(printf '%s\n' "$r" | sed '$d')
    st=$(printf '%s' "$b" | jq -r '.data.attributes.status // empty' 2>/dev/null || true)
    if [ "$st" = "completed" ]; then
      echo "analysis: $1"
      print_stats "$b"
      return 0
    fi
    [ "$i" = 10 ] && { echo "analysis: $1 status=$st — poll again: virustotal.sh $sha --analysis $1"; return 0; }
  done
}

if [ "$mode" = "--analysis" ] && [ -n "${3:-}" ]; then
  echo "sha256: $sha"; echo "source: $src   store: $host"
  poll_analysis "$3"; exit 0
fi

resp=$(vt_get "files/$sha")
code=$(printf '%s\n' "$resp" | tail -1)
body=$(printf '%s\n' "$resp" | sed '$d')

echo "sha256: $sha"
echo "source: $src   store: $host"
case "$code" in
  200) print_stats "$body" ;;
  401) echo "verdict: KEY REJECTED (401) — check the store copy" ;;
  429) echo "verdict: RATE LIMITED (429) — free tier allows few lookups per minute" ;;
  404)
    if [ -n "$isfile" ]; then
      echo "verdict: UNKNOWN to VirusTotal — uploading the sample for analysis"
      ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "cat > /tmp/vt-upload-$sha.apk" < "$target"
      up=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$host" bash -s -- "$keypath" "$sha" <<'EOS'
keypath=$1; sha=$2
K=$(cat "$keypath") || { echo '{"error":"key-unreadable"}'; exit 0; }
curl -s --config <(printf 'header = "x-apikey: %s"\n' "$K") \
  -F "file=@/tmp/vt-upload-$sha.apk" https://www.virustotal.com/api/v3/files
rm -f "/tmp/vt-upload-$sha.apk"
EOS
)
      aid=$(printf '%s' "$up" | jq -r '.data.id // empty' 2>/dev/null || true)
      if [ -z "$aid" ]; then echo "upload failed: $(printf '%s' "$up" | head -c 300)"; exit 0; fi
      echo "uploaded — analysis $aid"
      poll_analysis "$aid"
    else
      echo "verdict: UNKNOWN to VirusTotal — no report for this hash (no sample to upload)"
    fi
    ;;
  *)   echo "verdict: HTTP $code"; printf '%s\n' "$body" | head -c 200 ;;
esac
