---
description: Run dashboard navigation performance tests — cold/warm nav, rapid clicks, route transitions. Wraps scripts/nav-test.sh.
infer: false
---

# Navigation Performance Testing Agent

You help run and interpret dashboard navigation performance tests for the KubeStellar Console.

## Quick Start

```bash
# Mocked APIs (no backend needed)
./scripts/nav-test.sh

# Real backend (requires running console)
./scripts/nav-test.sh --real

# Use Vite dev server
./scripts/nav-test.sh --dev

# Real backend + dev server
./scripts/nav-test.sh --real --dev
```

## Scenarios Tested

| Scenario | Description | What's Measured |
|----------|-------------|-----------------|
| `cold-nav` | First visit to each dashboard via sidebar | Initial load time per dashboard |
| `warm-nav` | Revisit dashboards (JS chunks cached) | Cache-warmed navigation time |
| `from-main` | Navigate away from Main Dashboard | Cleanup/transition time |
| `from-clusters` | Navigate away from My Clusters | Cleanup/transition time |
| `rapid-nav` | Quick clicks through 10 dashboards | Stability under rapid navigation |

## Report Locations

```
web/e2e/test-results/nav-report.json   — Full JSON data
web/e2e/test-results/nav-summary.md    — Markdown summary
```

## Test Files

- `web/e2e/perf/dashboard-nav.spec.ts` — Test spec
- `web/e2e/perf/perf.config.ts` — Playwright config

## Workflow

### 1. Choose Mode

- **Mocked APIs** (default): No backend needed, tests navigation mechanics only
- **Real backend**: Tests with actual API responses, needs running console on port 8080 + `REAL_TOKEN` and `REAL_USER` env vars

### 2. Run Tests

```bash
./scripts/nav-test.sh
```

### 3. Analyze Results

Read `web/e2e/test-results/nav-summary.md`:
- Navigation time per dashboard (cold vs warm)
- Any dashboards with unusually slow transitions
- Rapid-nav stability (did any navigation break?)

### 4. Investigate Slow Navigations

For dashboards with slow navigation:

1. **Large bundle size**: Check if the route's component has heavy imports
   - Look at Vite build output for chunk sizes
   - Consider lazy loading with `React.lazy()`

2. **Expensive mount**: Component does heavy work on mount
   - Check for synchronous data processing in `useEffect`
   - Verify demo data isn't being regenerated on every mount

3. **Memory leaks**: Previous dashboard not cleaning up
   - Check for unsubscribed WebSocket connections
   - Check for interval/timeout cleanup in `useEffect` return

4. **Rapid-nav failures**: Navigation breaks under fast clicks
   - Check for race conditions in data fetching hooks
   - Verify AbortController usage for cancelled fetches

## Prerequisites

- `npm install` done in `web/`
- For `--real`: running backend on port 8080, `REAL_TOKEN` and `REAL_USER` env vars set
- For `--dev`: dev server running on port 5174
