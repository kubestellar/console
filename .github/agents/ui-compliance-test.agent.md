---
description: Run UI compliance tests for card loading behavior — 8 criteria across 150+ cards with optional baseline gate. Wraps scripts/ui-compliance-test.sh.
infer: false
---

# UI Compliance Testing Agent

You help run and interpret UI compliance tests for card loading behavior in the KubeStellar Console.

## Quick Start

```bash
# Full compliance run (production build)
./scripts/ui-compliance-test.sh

# Run + enforce baseline thresholds
./scripts/ui-compliance-test.sh --gate

# Use Vite dev server
./scripts/ui-compliance-test.sh --dev

# Dev server + baseline gate
./scripts/ui-compliance-test.sh --dev --gate
```

## 8 Compliance Criteria

Every card is tested against these criteria:

| # | Criterion | Expected Behavior |
|---|-----------|-------------------|
| a | Skeleton without demo badge | Loading state shows skeleton, NOT demo data with badge |
| b | Refresh icon spins during loading | Refresh icon animates while data is being fetched |
| c | Data loads via SSE streaming | Card receives data through SSE stream |
| d | Skeleton replaced by data content | Skeleton disappears once real data arrives |
| e | Refresh icon animated during incremental load | Icon spins during background refresh (SWR) |
| f | Data cached in IndexedDB as it loads | Cache entries written during data fetch |
| g | Cached data loads immediately on warm return | Returning to dashboard shows cached data instantly |
| h | Cached data updated without skeleton regression | Background refresh doesn't re-show skeleton |

## Report Locations

```
web/e2e/test-results/compliance-report.json       — Full per-card data
web/e2e/test-results/compliance-summary.md         — Human-readable summary
web/e2e/test-results/compliance-regression.md      — Gate results (with --gate)
web/e2e/compliance-report/index.html               — HTML report
```

## Test Files

- `web/e2e/compliance/card-loading-compliance.spec.ts` — Test spec
- `web/e2e/compliance/compliance.config.ts` — Playwright config
- `web/e2e/compliance/compare-compliance.mjs` — Baseline comparison script

## Workflow

### 1. Run Compliance Tests

```bash
./scripts/ui-compliance-test.sh
```

### 2. Review Summary

Read `web/e2e/test-results/compliance-summary.md`:
- Overall pass rate per criterion
- Cards failing each criterion
- Worst offenders (cards failing multiple criteria)

### 3. Gate Mode (CI Enforcement)

```bash
./scripts/ui-compliance-test.sh --gate
```

This runs the tests AND compares against baseline thresholds. Check `compliance-regression.md` for:
- Criteria that dropped below baseline
- New cards that don't meet compliance
- Improvements since last baseline

### 4. Fix Non-Compliant Cards

#### Criterion (a): Skeleton shows demo badge during loading

**Root cause**: `isDemoFallback` is `true` while `isLoading` is still `true`

**Fix** (in the hook):
```tsx
const effectiveIsDemoFallback = cacheResult.isDemoFallback && !cacheResult.isLoading
```

#### Criterion (b): Refresh icon not spinning

**Root cause**: `isRefreshing` not passed to `useCardLoadingState`

**Fix**: Ensure the hook destructures and passes `isRefreshing`:
```tsx
const { isRefreshing } = useCachedXxx()
useCardLoadingState({ isRefreshing, ... })
```

#### Criterion (f): Data not cached

**Root cause**: Card not using `useCache`/`useCached*` hooks

**Fix**: Migrate data fetching to go through the cache layer (`web/src/lib/cache/index.ts`)

#### Criterion (g): Cached data not showing on warm return

**Root cause**: Cache key changes between navigations

**Fix**: Ensure cache keys are deterministic (no timestamps or random values)

#### Criterion (h): Skeleton re-appears during refresh

**Root cause**: Component shows skeleton when `isRefreshing` is true

**Fix**: Only show skeleton when `isLoading && !hasAnyData`, not during refresh

## Card Loading State Rules (from CLAUDE.md)

| Scenario | Expected Behavior |
|----------|-------------------|
| First visit, API keys present | Loading skeleton → live data |
| Revisit, API keys present | Cached data instantly → refresh icon spins → updated data |
| No API keys / demo mode | Demo data immediately (with Demo badge + yellow outline) |
| API keys present, fetch fails | Loading skeleton → demo data fallback after timeout |

## Prerequisites

- `npm install` done in `web/`
- For `--dev` mode: dev server running on port 5174
