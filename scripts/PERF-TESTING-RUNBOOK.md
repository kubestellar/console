# Performance Testing Runbook

Instructions for Claude CLI instances to test dashboard card loading performance.

## Automated Playwright Tests (Recommended)

```bash
# Run all dashboards in demo mode
./scripts/perf-test.sh --demo-only

# Run all dashboards in both demo and live mode
./scripts/perf-test.sh

# Results are written to:
# - web/e2e/test-results/perf-report.json  (full data)
# - web/e2e/test-results/perf-summary.txt  (human-readable summary)
# - web/e2e/perf-report/index.html         (HTML report)
```

**Target:** All dashboards should have `lastCardVisibleMs < 1500` in demo mode.

### What the Playwright tests measure
- `firstCardVisibleMs`: Time from navigation to first card showing content
- `lastCardVisibleMs`: Time from navigation to last card showing content
- `skeletonDuration`: How long skeleton shimmer was visible per card
- `timeToFirstContent`: Per-card time from nav start to content visible
- `timedOut`: Whether card never showed content within 25s

### Files
- `web/e2e/perf/dashboard-perf.spec.ts` — test spec (25 dashboards x 2 modes)
- `web/e2e/perf/metrics.ts` — timing utilities and report generation
- `web/e2e/perf/perf.config.ts` — Playwright config (sequential, 1 worker)

---

## Manual CDP Testing (for verifying specific cards)

Use these commands when you need to visually verify a specific card or dashboard.

### Prerequisites
- Dev server running on port 5174: `cd /tmp/kubestellar-console/web && npm run dev`
- Chrome open with CDP on port 9222 (or use `--remote-debugging-port=9222`)
- Demo mode enabled in the browser

### CDP Commands

```bash
# Get WebSocket URL
WS_URL=$(curl -s http://127.0.0.1:9222/json/list | jq -r '.[0].webSocketDebuggerUrl')

# Hard reload
echo '{"id":1,"method":"Page.reload","params":{"ignoreCache":true}}' | websocat -n1 "$WS_URL"

# Navigate to a specific page
echo '{"id":1,"method":"Page.navigate","params":{"url":"http://localhost:5174/dashboard"}}' | websocat -n1 "$WS_URL"

# Take screenshot
echo '{"id":1,"method":"Page.captureScreenshot","params":{"format":"jpeg","quality":70}}' | websocat -n1 -B 10000000 "$WS_URL" | jq -r '.result.data' | base64 -d > /tmp/screenshot.jpg

# Click a nav link by text
echo '{"id":1,"method":"Runtime.evaluate","params":{"expression":"const links = [...document.querySelectorAll(\"a\")]; const link = links.find(l => l.textContent.trim() === \"Dashboard\"); if (link) { link.click(); \"clicked\" } else { \"not found\" }"}}' | websocat -n1 "$WS_URL"

# Press Escape (close modals)
echo '{"id":1,"method":"Input.dispatchKeyEvent","params":{"type":"keyDown","key":"Escape","code":"Escape","windowsVirtualKeyCode":27}}' | websocat -n1 "$WS_URL"
```

### Dashboards to Test (routes)

| Dashboard | Route | Key Cards |
|-----------|-------|-----------|
| Dashboard | `/` | Resource Allocation, Cluster Health, Event Stream |
| Clusters | `/clusters` | Cluster Overview |
| Compute | `/compute` | Resource Usage |
| Pods | `/pods` | Pod Issues, Pod Health Trend |
| Deployments | `/deployments` | Deployment Progress |
| Events | `/events` | Event Stream, Events Timeline, Recent Events |
| Helm | `/helm` | Helm History, Helm Values Diff |
| Deploy | `/deploy` | Cluster Upgrade Status |
| Data Compliance | `/data-compliance` | Namespace RBAC, Namespace Overview |
| GPU | `/gpu-reservations` | GPU Nodes |
| AI/ML | `/ai-ml` | AI/ML cards |
| AI Agents | `/ai-agents` | Kagenti agent cards |
| Compliance | `/compliance` | OPA Policies |
| Security | `/security` | Security scan results |

### What to Verify per Card

1. **Card shows data** — not stuck on skeleton or empty state
2. **Correct cluster names** — should be canonical demo names:
   - `kind-local`, `minikube`, `k3s-edge`
   - `eks-prod-us-east-1`, `gke-staging`, `aks-dev-westeu`
   - `openshift-prod`, `oci-oke-phoenix`, `alibaba-ack-shanghai`
   - `do-nyc1-prod`, `rancher-mgmt`, `vllm-gpu-cluster`
3. **Dropdowns pre-selected** — cards with cluster/namespace selectors should auto-select in demo mode
4. **Time-series have multiple data points** — not just a single dot
5. **Accelerators** — Resource Allocation card should show GPU, TPU, AIU, XPU when data exists
6. **Drill-down modals** — clicking cards should open modals with matching data

### Cards That Need Special Attention

These cards have been problematic in the past:

| Card | Issue | Fix Location |
|------|-------|-------------|
| Resource Allocation | 0% CPU/Memory | `hooks/mcp/shared.ts` — needs `cpuRequestsCores`/`memoryRequestsGB` on demo clusters |
| Namespace Overview | Empty dropdowns | `components/cards/NamespaceOverview.tsx` — needs `useDemoMode()` auto-select |
| Namespace RBAC | Empty | `hooks/mcp/rbac.ts` — cluster names must match demo clusters |
| Pod Health Trend | Single dot | `components/cards/PodHealthTrend.tsx` — needs historical data seeding |
| Helm History | Empty | `hooks/mcp/helm.ts` — cluster names must match |
| Events Timeline | Empty | `hooks/mcp/events.ts` — cluster names must match |
| OPA Policies | 15s timeout | `components/cards/OPAPolicies.tsx` — needs demo mode bypass |
| Kagenti cards | 15s timeout | `hooks/mcp/kagenti.ts` — needs demo mode bypass |

### Demo Mode Architecture

- **Single source of truth:** `isDemoMode()` from `web/src/lib/demoMode.ts`
- **React hook:** `useDemoMode()` from `web/src/hooks/useDemoMode.ts`
- **Cache system:** `web/src/lib/cache/index.ts` line 714 — `effectiveEnabled = enabled && !demoMode`
  - When demo mode is on, cache is disabled and `demoDisplayData` is returned directly
  - Live data cache is preserved but ignored
- **Demo clusters:** `getDemoClusters()` in `web/src/hooks/mcp/shared.ts`
- **Demo GPU nodes:** `getDemoGPUNodes()` in `web/src/hooks/mcp/compute.ts`
- **Accelerator types:** `'GPU' | 'TPU' | 'AIU' | 'XPU'` — `GPUNode.acceleratorType`

### Common Pitfalls

1. **Wrong cluster names** — Demo data functions (getDemoEvents, getDemoHelmReleases, etc.) must use names from `getDemoClusters()`, not arbitrary names like `prod-east`
2. **Missing demo mode check** — Cards that call agents/kubectl need to check `isDemoMode()` first and return demo data immediately
3. **HMR not picking up hook changes** — After editing hooks, you may need to kill and restart the dev server
4. **Stacked timeouts in CardWrapper** — In demo mode, skeleton delay timers (100ms + 150ms + 300ms = 550ms) should be skipped. Check `CardWrapper.tsx` initialization of `skeletonDelayPassed`, `initialRenderTimedOut`, `collapseDelayPassed`
