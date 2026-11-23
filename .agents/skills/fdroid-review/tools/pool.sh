#!/usr/bin/env bash
# Rank the review-requested pool by note count (fewest first).
# usage: pool.sh [limit]
set -euo pipefail
limit=${1:-25}
glab api "projects/fdroid%2Ffdroiddata/merge_requests?labels=review-requested&state=opened&per_page=100" \
  | jq -r --argjson n "$limit" 'sort_by(.user_notes_count)|.[:$n][]|"\(.user_notes_count)\t!\(.iid)\t\(.title[0:64])"'
