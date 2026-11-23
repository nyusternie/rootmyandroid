#!/usr/bin/env bash
# Vet one MR: state, pipeline, and every non-system note author classified
# MAINTAINER (project member) vs OUTSIDER (community tester => already reviewed).
# usage: vet.sh <iid>
set -euo pipefail
iid=${1:?usage: vet.sh <iid>}
mr=$(glab api "projects/fdroid%2Ffdroiddata/merge_requests/$iid")
jq -r '"MR !\(.iid) \(.title)\n  state=\(.state) sha=\(.sha[0:8]) pipeline=\(.head_pipeline.status // "none") merge=\(.detailed_merge_status)\n  source_project=\(.source_project_id) author=\(.author.username)"' <<<"$mr"
notes=$(glab api "projects/fdroid%2Ffdroiddata/merge_requests/$iid/notes?per_page=100")
author=$(jq -r '.author.username' <<<"$mr")
authors=$(jq -r '[.[]|select(.system==false)|.author.username]|unique|.[]' <<<"$notes")
outside=0
for a in $authors; do
  if [ "$a" = "$author" ]; then echo "  $a: AUTHOR"; continue; fi
  n=$(glab api "projects/36528/members/all?query=$a" | jq 'length' 2>/dev/null || echo 0)
  if [ "${n:-0}" -gt 0 ]; then echo "  $a: MAINTAINER"; else echo "  $a: OUTSIDER"; outside=1; fi
done
[ "$outside" -eq 0 ] && echo "  verdict: no outside review — eligible" || echo "  verdict: OUTSIDE review present — skip"
