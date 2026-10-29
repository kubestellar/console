#!/usr/bin/env bash
# Run from web/, or pass a component directory for fixture-based tests.
set -euo pipefail
components=${1:-src/components}

# Match hook invocations, not imports, type names, comments about caching,
# or local UI preferences. Test fixtures are not user-facing data displays.
cache_hook='\b(useCached[A-Za-z0-9_]*|useCache|useQuery)[[:space:]]*\('
freshness='lastRefresh|lastUpdated|lastFetched|updatedAt|refreshedAt|timestamp|timeAgo|dataAge'
missing_freshness=''
while IFS= read -r -d '' file; do
  if grep -Eq "$cache_hook" "$file" && ! grep -Eiq "$freshness" "$file"; then
    missing_freshness+="  - \`$(basename "$file")\`"$'\n'
  fi
done < <(find "$components" -type f -name '*.tsx' ! -name '*.test.*' ! -name '*.spec.*' -print0 | sort -z)
if [[ -n "$missing_freshness" ]]; then
  printf '### Components with caching but no freshness indicator\nUsers should know when data was last updated:\n%s\n' "$missing_freshness"
fi

missing_demo=''
if [[ -d "$components/cards" ]]; then
  while IFS= read -r -d '' file; do
    # Cached hooks subscribe internally. Require an actual fetch invocation,
    # not prose like "data fetching" in a presentation component's comments.
    if ! grep -Eq 'useDemoMode|useCardDemoState|isDemoMode|subscribeDemoMode|isDemoFallback|isDemoData|useCached|useCache\(' "$file" &&
       grep -Eq '\b(fetch|fetch[A-Z][A-Za-z0-9_]*|useQuery)[[:space:]]*\(' "$file"; then
      missing_demo+="  - \`$(basename "$file")\`"$'\n'
    fi
  done < <(find "$components/cards" -type f -name '*.tsx' ! -name '*.test.*' ! -name '*.spec.*' ! -name 'index.tsx' -print0 | sort -z)
fi
if [[ -n "$missing_demo" ]]; then
  printf '### Cards with data fetching but no demo mode subscription\nMay not respond to demo mode toggle:\n%s\n' "$missing_demo"
fi
