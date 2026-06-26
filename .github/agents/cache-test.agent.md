---
description: Run card cache compliance tests — verify all cards store and retrieve cached data from IndexedDB across navigation. Wraps scripts/cache-test.sh.
infer: false
---

# Card Cache Compliance Testing Agent

You help run and interpret card cache compliance tests for the KubeStellar Console. These tests verify that all 150+ cards properly cache data and display it on warm return without network access.

## Quick Start

```bash
# Full cache test (production build)
./scripts/cache-test.sh

# Use Vite dev server instead
./scripts/cache-test.sh --dev
```

## What It Tests (5 Phases)

| Phase | Description | What's Verified |
|-------|-------------|-----------------|
| 1. Cold Load | Load all card batches with mocked APIs | Cards receive and render data |
| 2. Verify Cache | Check IndexedDB/localStorage entries | Data was persisted to cache |
| 3. Navigate Away | Leave dashboard, block ALL network APIs | Simulates offline return |
| 4. Warm Return | Return to dashboard with no network | Cards display from cache only |
| 5. Evaluate | Per-card scoring | Cache hit, content match, time-to-content |

## Report Locations

```
web/e2e/test-results/cache-compliance-report.json   — Full per-card data
web/e2e/test-results/cache-compliance-summary.md     — Human-readable summary
web/e2e/compliance-report/index.html                 — HTML report
```

## Test File

- `web/e2e/compliance/card-cache-compliance.spec.ts` — Test spec
- `web/e2e/compliance/compliance.config.ts` — Playwright config

## Workflow

### 1. Run the Tests

```bash
./scripts/cache-test.sh
```

### 2. Analyze Results

Read `web/e2e/test-results/cache-compliance-summary.md` for a quick overview:
- Total cards tested
- Cards with cache hits on warm return
- Cards that failed to display cached data
- Time-to-content for cached vs uncached loads

### 3. Investigate Failures

For cards that fail cache compliance:

1. **No cache entry**: The card's `useCached*` hook isn't writing to IndexedDB
   - Check if the hook calls `useCache` from `web/src/lib/cache/index.ts`
   - Verify `effectiveEnabled` is true when not in demo mode

2. **Cache hit but no content**: Data is cached but card doesn't render it
   - Check if the card properly reads from cache on mount
   - Verify the SWR (stale-while-revalidate) pattern is working

3. **Content mismatch**: Cached content doesn't match original
   - Check if cache keys are stable across navigations
   - Verify data serialization/deserialization

### 4. Common Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| Card not using cache | Component file | Wire up `useCached*` hook instead of direct fetch |
| Demo mode bypasses cache | Hook file | Check `effectiveEnabled = enabled && !demoMode` |
| Cache key collision | Hook file | Make cache key unique per card + cluster + namespace |
| Stale cache never updates | Hook file | Ensure `isRefreshing` triggers background fetch |

## Card Caching Architecture

- **Cache system**: `web/src/lib/cache/index.ts` (line ~714)
- **Storage**: IndexedDB via the cache layer
- **SWR pattern**: Show stale data immediately, refresh in background
- **Demo mode**: Cache disabled, `demoDisplayData` returned directly
- **Live mode**: Cache enabled, data persisted across navigations

### Required Hook Wiring (from CLAUDE.md)

```tsx
const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedXxx()

useCardLoadingState({
  isLoading,
  isRefreshing,          // Required for refresh icon animation
  isDemoData,            // Required for Demo badge + yellow outline
  hasAnyData: data.length > 0,
  isFailed,
  consecutiveFailures,
})
```

## Prerequisites

- `npm install` done in `web/`
- For `--dev` mode: dev server running on port 5174
