#!/usr/bin/env bash
# Hermetic regression tests for the Auto-QA data-freshness heuristics.
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
fixtures=$(mktemp -d)
trap 'rm -rf "$fixtures"' EXIT
mkdir -p "$fixtures/cards" "$fixtures/nested directory"

printf '%s\n' 'const result = useCachedNodes()' > "$fixtures/Stale.tsx"
printf '%s\n' 'const result = useCachedNodes()' > "$fixtures/nested directory/AlsoStale.tsx"
printf '%s\n' 'const { lastRefresh } = useCachedNodes()' > "$fixtures/Fresh.tsx"
printf '%s\n' 'const data = useCachedNodes(); formatTimeAgo(data)' > "$fixtures/Formatted.tsx"
printf '%s\n' 'const result = useCachedNodes()' > "$fixtures/Nodes.test.tsx"
printf '%s\n' 'const result = useCachedNodes()' > "$fixtures/Nodes.spec.tsx"
printf '%s\n' "import { SCORE_THRESHOLD_HIGH } from './useCachedAttestation'" > "$fixtures/ImportOnly.tsx"
printf '%s\n' '// Clear query caches before navigating.' > "$fixtures/ErrorBoundary.tsx"
printf '%s\n' '// Pure presentation: no data fetching.' > "$fixtures/cards/CardLoadingState.tsx"
printf '%s\n' '* Each card fetches summary data.' > "$fixtures/cards/shared.tsx"
printf '%s\n' 'const result = fetchPipelineLog(repo, jobId)' > "$fixtures/cards/LogsModal.tsx"
printf '%s\n' "const result = fetch('/api/data')" > "$fixtures/cards/DirectFetch.tsx"
printf '%s\n' "useDemoMode(); fetch('/api/data')" > "$fixtures/cards/Subscribed.tsx"
printf '%s\n' 'useCachedNodes()' > "$fixtures/cards/Cached.tsx"
printf '%s\n' "useCache('nodes', fetchNodes); fetchNodes()" > "$fixtures/cards/Cache.tsx"
printf '%s\n' "fetch('/api/data')" > "$fixtures/cards/Fetch.test.tsx"

report=$(bash "$script_dir/check-data-freshness.sh" "$fixtures")
for name in Stale AlsoStale LogsModal DirectFetch; do
  grep -Fq -- "\`$name.tsx\`" <<< "$report" || { echo "Missing finding: $name"; exit 1; }
done
for name in Fresh Formatted Nodes.test Nodes.spec ImportOnly ErrorBoundary CardLoadingState shared Subscribed Fetch.test; do
  if grep -Fq -- "\`$name.tsx\`" <<< "$report"; then
    echo "False positive: $name"
    exit 1
  fi
done
# Cached hooks may need freshness metadata, but never need a second demo subscription.
demo_report=${report#*'### Cards with data fetching but no demo mode subscription'}
for name in Cached Cache; do
  if grep -Fq -- "\`$name.tsx\`" <<< "$demo_report"; then
    echo "Cached hook incorrectly needs demo subscription: $name"
    exit 1
  fi
done

mkdir -p "$fixtures/empty"
[[ -z $(bash "$script_dir/check-data-freshness.sh" "$fixtures/empty") ]]
echo 'Data freshness scanner tests passed'
