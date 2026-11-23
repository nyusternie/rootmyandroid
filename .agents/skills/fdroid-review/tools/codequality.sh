#!/usr/bin/env bash
# Print a pipeline's codequality entries as CATEGORY :: description and flag
# anything that is not known-informational. Classifies by CATEGORY, never by
# description substring (see pitfalls P5/P6).
# usage: codequality.sh <project_id> <pipeline_id>
set -euo pipefail
proj=${1:?usage: codequality.sh <project_id> <pipeline_id>}
pid=${2:?usage: codequality.sh <project_id> <pipeline_id>}
jid=$(glab api "projects/$proj/pipelines/$pid/jobs?per_page=100" | jq -r '.[]|select(.name=="check apk")|.id')
[ -n "${jid:-}" ] || { echo "no 'check apk' job in pipeline $pid"; exit 1; }
tmp=$(mktemp)
glab api "projects/$proj/jobs/$jid/trace" | sed -E 's/\x1b\[[0-9;]*m//g' > "$tmp"
grep -oE "generate_report [a-zA-Z0-9_.]+ [0-9]+ '[^']*' [a-z0-9_]+ '[^']*' [a-z]+" "$tmp" \
 | sed -E "s/generate_report [a-zA-Z0-9_.]+ [0-9]+ '([^']*)' ([a-z0-9_]+).*/\2\t\1/" \
 | sort -u | while IFS=$'\t' read -r cat desc; do
     case "$cat" in
       abi_size|application_attribution|permission|signing_key) tag=info ;;
       r8_marker) case "$desc" in *"has no R8 Marker"*) tag=WARN ;; *) tag=info ;; esac ;;
       *) tag=CHECK ;;
     esac
     printf '%-5s %-24s %s\n' "$tag" "$cat" "$desc"
   done
rm -f "$tmp"
