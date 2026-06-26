# KubeStellar Console — Session Summary

## What this project is

KubeStellar Console is a standalone Kubernetes dashboard and AI mission platform. It is **not** related to the legacy `kubestellar/kubestellar` project (BindingPolicy, WECs, ITSs). They share an org name only.

## Architecture

- **Backend**: Go + Fiber v2, port 8080. Serves both the API and the built frontend.
- **Frontend**: React + TypeScript + Tailwind CSS + Vite, port 5174 in dev.
- **kc-agent**: Local WebSocket bridge (port 8585) connecting the browser to kubeconfig + MCP servers.
- **Production**: Netlify (console.kubestellar.io). API routes via Netlify Functions (`web/netlify/functions/*.mts`), not the Go backend.
- **Database**: SQLite WASM in a Web Worker (off-main-thread), IndexedDB fallback.

## Key directories

```
cmd/console/       Server entry point
cmd/kc-agent/      Local agent (kubeconfig + MCP bridge)
pkg/api/           HTTP/WS server + handlers
pkg/store/         SQLite database layer
web/src/           React + TypeScript frontend
  components/cards/  Dashboard card components
  hooks/             useCached* data-fetching hooks
  lib/               Cache, card registry, demo data, themes
web/netlify/functions/  Netlify serverless API (production)
deploy/helm/       Helm chart
```

## Critical rules for agents

- **Feature branches only** — never commit to main directly; always use `git worktree add /tmp/kubestellar-console-<slug> -b <branch>`
- **DCO required** — every commit must use `git commit -s` (`Signed-off-by: Andy Anderson <andy@clubanderson.com>`)
- **isDemoData wiring** — every card using `useCached*` MUST pass `isDemoData` and `isRefreshing` to `useCardLoadingState()`
- **No magic numbers** — every numeric literal must be a named constant
- **DeduplicatedClusters()** — always use when iterating clusters (multiple contexts can point to the same cluster)
- **Guard arrays** — never call `.join()`, `.map()`, `.filter()` on values that might be `undefined`
- **Netlify parity** — Go API handlers need matching Netlify Function counterparts; MSW passthrough rules required for demo mode

## Starting the console

```bash
cd /tmp/kubestellar-console && bash startup-oauth.sh
```

Frontend URL: `http://localhost:8080` (served by Go backend, not Vite).

## Active subsystems

- **ACMM dashboard** (`/acmm`) — AI Capability Maturity Model scanner. Badge via `/api/acmm/badge?repo=owner/name` (shields.io endpoint).
- **AI Missions** — guided install/solution missions defined in `kubestellar/console-kb` under `fixes/cncf-install/`.
- **Drasi dashboard** (`/drasi`) — reactive-pipeline topology view.
- **Benchmark cards** — Google Drive API backed; require `GOOGLE_DRIVE_API_KEY` in `.env`.
- **Nightly E2E** — runs at 1 AM ET via GitHub Actions; failures open rolling incident issues.
