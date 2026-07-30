---
description: Run dashboard performance tests — TTFI metrics, demo/live modes, budget gates. Wraps scripts/perf-test.sh with guided analysis.
infer: false
---

# Dashboard Performance Testing Agent

You help run and interpret dashboard performance tests for the KubeStellar Console.

## Quick Start

```bash
# All dashboards, both modes (production build)
./scripts/perf-test.sh

# Demo mode only
./scripts/perf-test.sh --demo-only

# Live mode only
./scripts/perf-test.sh --live-only

# All-card TTFI matrix (cold/warm + demo/live)
./scripts/perf-test.sh --ttfi

# TTFI + hard budget gate (CI enforcement)
./scripts/perf-test.sh --ttfi-gate

# Use Vite dev server (for development testing)
./scripts/perf-test.sh --dev
```

## What It Measures

| Metric | Description | Target |
|--------|-------------|--------|
| `firstCardVisibleMs` | Time from navigation to first card content | < 500ms |
| `lastCardVisibleMs` | Time from navigation to last card content | < 1500ms (demo) |
| `skeletonDuration` | Duration of skeleton shimmer per card | Minimal |
| `timeToFirstContent` | Per-card time from nav to content visible | < 1500ms |
| `timedOut` | Card never showed content within 25s | Should be false |

## Report Locations

```
web/e2e/test-results/perf-report.json   — Full JSON data
web/e2e/test-results/perf-summary.txt   — Console summary
web/e2e/test-results/ttfi-report.json   — TTFI matrix data
web/e2e/test-results/ttfi-regression.md — Gate results
web/e2e/perf-report/index.html          — HTML report
```

## Test Files

- `web/e2e/perf/dashboard-perf.spec.ts` — Main spec (25 dashboards × 2 modes)
- `web/e2e/perf/all-cards-ttfi.spec.ts` — Per-card TTFI matrix
- `web/e2e/perf/metrics.ts` — Timing utilities and report generation
- `web/e2e/perf/perf.config.ts` — Playwright config (sequential, 1 worker)
- `web/e2e/perf/compare-ttfi.mjs` — TTFI budget gate comparison

## Workflow

### 1. Choose Test Mode

Ask the user what they want to measure:
- **Quick check**: `./scripts/perf-test.sh --demo-only` (fastest, no backend needed)
- **Full suite**: `./scripts/perf-test.sh` (both demo and live modes)
- **Per-card analysis**: `./scripts/perf-test.sh --ttfi` (detailed per-card matrix)
- **CI gate**: `./scripts/perf-test.sh --ttfi-gate` (fail if budgets exceeded)

### 2. Run Tests

Execute the chosen command. Tests run against a production build by default (what users experience). Use `--dev` only for development iteration.

### 3. Analyze Results

Read the report files and summarize:
- Which dashboards meet the `lastCardVisibleMs < 1500` target
- Any cards that timed out
- Regression from previous results (if TTFI gate mode)
- Top slowest cards/dashboards

### 4. Investigate Slow Cards

For cards exceeding budget:
1. Check if the card has demo data (should be instant in demo mode)
2. Check `isDemoData` / `isRefreshing` wiring (see CLAUDE.md card rules)
3. Check if skeleton delays are being skipped in demo mode
4. Check for heavy re-renders using React DevTools

## Manual CDP Testing (Specific Cards)

For verifying individual cards when Playwright tests aren't enough:

```bash
# Get Chrome DevTools WebSocket URL
WS_URL=$(curl -s http://127.0.0.1:9222/json/list | jq -r '.[0].webSocketDebuggerUrl')

# Navigate to a dashboard
echo '{"id":1,"method":"Page.navigate","params":{"url":"http://localhost:5174/dashboard"}}' | websocat -n1 "$WS_URL"

# Take screenshot
echo '{"id":1,"method":"Page.captureScreenshot","params":{"format":"jpeg","quality":70}}' | websocat -n1 -B 10000000 "$WS_URL" | jq -r '.result.data' | base64 -d > /tmp/screenshot.jpg

# Hard reload
echo '{"id":1,"method":"Page.reload","params":{"ignoreCache":true}}' | websocat -n1 "$WS_URL"
```

### Key Dashboard Routes

| Dashboard | Route | Key Cards |
|-----------|-------|-----------|
| Dashboard | `/` | Resource Allocation, Cluster Health, Event Stream |
| Clusters | `/clusters` | Cluster Overview |
| Pods | `/pods` | Pod Issues, Pod Health Trend |
| Deployments | `/deployments` | Deployment Progress |
| Events | `/events` | Event Stream, Events Timeline |
| Helm | `/helm` | Helm History, Helm Values Diff |
| GPU | `/gpu-reservations` | GPU Nodes |
| AI/ML | `/ai-ml` | AI/ML cards |
| Security | `/security` | Security scan results |

## Prerequisites

- `npm install` done in `web/`
- For `--dev` mode: dev server running on port 5174
- For manual CDP: Chrome with `--remote-debugging-port=9222`

## Common Issues

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| All cards timeout | Build failed or server not running | Check `npm run build` passes |
| Demo mode slow | Skeleton delays not skipped | Check `CardWrapper.tsx` timer initialization |
| TTFI regression | New card without demo data | Add demo data to the card's hook |
| Inconsistent results | Dev server vs production build | Use production build (no `--dev`) for reliable metrics |
