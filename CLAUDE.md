# KubeStellar Console — Agent Guide

This file is read by Claude Code, Copilot, Codex, and other coding agents working on this repo.

## Quick Start

```bash
./start-dev.sh          # No OAuth, mock dev-user, backend :8080, frontend :5174
./startup-oauth.sh      # With GitHub OAuth (requires .env with GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)
```

Do NOT run build or lint locally — CI handles both. Commit, push, open a PR with `Fixes #NNN`, and wait for CI to pass (ignore `tide` — it stays pending without lgtm/approved labels; bypass with `--admin`).
```bash
# NEVER run these locally — CI validates on the PR
# cd web && npm run build && npm run lint
```

## Project Layout

```
cmd/console/       Server entry point
cmd/kc-agent/      Local agent (bridges browser to kubeconfig + MCP)
pkg/agent/         AI providers (Claude, OpenAI, Gemini)
pkg/api/           HTTP/WS server + handlers
pkg/mcp/           MCP bridge to Kubernetes
pkg/store/         SQLite database layer
web/src/           React + TypeScript frontend
  components/cards/  Dashboard card components
  hooks/             Data fetching hooks (useCached*)
  lib/               Utilities, card registry, demo data
deploy/helm/       Helm chart
```

---

## ⚠️ MANDATORY Testing Requirements

**ALL UI and API work MUST be tested before marking complete.** Do not just write code and assume it works. Use one or more of these tools:

### For UI/Frontend Testing
1. **Playwright** (preferred for comprehensive E2E tests)
   ```bash
   cd web && npx playwright test --grep "your-test-pattern"
   ```
2. **Chrome DevTools MCP** (for interactive testing)
   - `mcp__chrome-devtools__navigate_page` - Load pages
   - `mcp__chrome-devtools__take_snapshot` - Verify DOM elements
   - `mcp__chrome-devtools__click` / `mcp__chrome-devtools__fill` - Interact
   - `mcp__chrome-devtools__take_screenshot` - Capture visual state

### For API/WebSocket Testing
1. **curl** - Test REST API endpoints
   ```bash
   curl -s http://localhost:8080/api/health | jq
   ```
2. **websocat** - Test WebSocket connections
   ```bash
   websocat ws://localhost:8585/ws
   ```

### Testing Checklist
- [ ] New UI components render correctly
- [ ] User interactions work as expected
- [ ] No console errors
- [ ] API endpoints return expected data
- [ ] WebSocket connections establish properly

---

## Visual Verification Protocol (UI Changes)

Any PR that modifies UI (components, styles, layouts, pages) MUST follow this protocol:

### Before coding
1. Extract a **visual checklist** from the issue/request — numbered list of visible outcomes.
   Example: "1. Clusters page shows new GPU column. 2. Column header uses muted text. 3. GPU values render with ProgressRing."
   If the issue doesn't describe visual outcomes, ask for clarification before starting.

### After implementing
2. Start the app in demo mode and **screenshot every affected page** via CDP or Playwright.
3. **Verify each checklist item** is visible in the screenshot. If anything is missing, fix it. Do not proceed until all items are confirmed.

### Write the visual regression test
4. Create or update a test file in `web/e2e/visual/` named `app-{page-name}-visual.spec.ts`.
5. The test MUST:
   - Import `setupDemoMode` from `../helpers/setup.ts` (NEVER copy setup logic inline)
   - Use `app-visual.config.ts` (NOT the Storybook config)
   - Navigate to the affected route in demo mode
   - Wait for content with `getByTestId` or locators (NEVER use `waitForTimeout`)
   - Call `expect(page).toHaveScreenshot('{descriptive-name}.png')` for each visual state
6. Generate baselines: `cd web && npm run test:visual:update`
7. Verify baselines pass: `cd web && npm run test:visual`
8. **Commit the test file AND the snapshot baselines** alongside the code change.

### Definition of done
Do NOT report a UI task as complete until:
- All visual checklist items are confirmed in screenshots
- Playwright visual test passes without `--update-snapshots`
- Test + baselines are committed in the PR

---

## Port Requirements

- **Backend**: Must always run on port **8080**
- **Frontend**: Must always start on port **5174** (use `npm run dev -- --port 5174`)

## Development

### Starting the Console (Recommended)

Use `./startup-oauth.sh` to start the full development environment:
```bash
./startup-oauth.sh
```

This script automatically:
- Kills existing processes on ports 8080, 5174, 8585
- Loads `.env` credentials (GitHub OAuth)
- Starts kc-agent, backend (OAuth mode), and frontend
- Handles Ctrl+C cleanup

**Requirements**: Create a `.env` file with GitHub OAuth credentials:
```
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>
```

### Manual Startup

If you need to start components individually:
```bash
npm run dev -- --port 5174  # Frontend
```

The backend (KC API server) runs on port 8080. The KC agent WebSocket runs on port 8585.

---

## Card Development Rules (ALWAYS FOLLOW)

Every dashboard card component MUST follow these patterns for loading, caching, and demo data to work correctly.

### 1. Always wire `isDemoData` and `isRefreshing`

Every card using a `useCached*` hook MUST destructure `isDemoData` (or `isDemoFallback`) and `isRefreshing`, then pass both to `useCardLoadingState()` or `useReportCardDataState()`:

```tsx
const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedXxx()

useCardLoadingState({
  isLoading,
  isRefreshing,          // ← Required for refresh icon animation
  isDemoData,            // ← Required for Demo badge + yellow outline
  hasAnyData: data.length > 0,
  isFailed,
  consecutiveFailures,
})
```

Without `isDemoData`: cards show demo data without the Demo badge/yellow outline.
Without `isRefreshing`: no refresh icon animation when data is being updated in background.

### 2. Never use demo data during loading

The hook's `isDemoFallback` must be `false` while `isLoading` is `true`. This ensures CardWrapper shows a loading skeleton instead of immediately rendering demo data.

**Correct pattern in hooks:**
```tsx
const effectiveIsDemoFallback = cacheResult.isDemoFallback && !cacheResult.isLoading
```

**Wrong pattern:**
```tsx
const effectiveIsDemoFallback = cacheResult.isDemoFallback  // BUG: true during loading
```

### 3. Expected loading behavior

| Scenario | Behavior |
|----------|----------|
| First visit, API keys present | Loading skeleton → live data |
| Revisit, API keys present | Cached data instantly → refresh icon spins → updated data |
| No API keys / demo mode | Demo data immediately (with Demo badge + yellow outline) |
| API keys present, fetch fails | Loading skeleton → demo data fallback after timeout |

### 4. Always use `useCache`/`useCached*` hooks

All data fetching in cards MUST go through the cache layer (`useCache` or a `useCached*` hook from `hooks/useCachedData.ts`). This provides:
- Persistent cache (IndexedDB/SQLite) for instant data on revisit
- SWR (stale-while-revalidate) pattern
- Automatic demo fallback
- Loading/refreshing state management

### 5. Hook ordering matters

`useCardLoadingState` / `useReportCardDataState` must be called AFTER the hooks that provide `isDemoData`. React hooks run in order — if the loading state hook runs before data hooks, it won't have the correct values.

---

## Critical Rules (ALWAYS FOLLOW)

### Array Safety
NEVER call `.join()`, `.map()`, `.filter()`, `.forEach()`, or `for...of` on values that might be `undefined`. Hooks and API responses can return `undefined` when endpoints fail.
```tsx
// WRONG
data.join(', ')
for (const x of data) { ... }

// CORRECT
(data || []).join(', ')
for (const x of (data || [])) { ... }
```

### Cluster Deduplication
ALWAYS use `DeduplicatedClusters()` when iterating clusters. Multiple kubeconfig contexts can point to the same physical cluster — without dedup, resources get listed/counted twice.

### No Magic Numbers
EVERY numeric literal must be a named constant:
```tsx
// WRONG
setTimeout(fn, 5000)

// CORRECT
const WS_RECONNECT_MS = 5000
setTimeout(fn, WS_RECONNECT_MS)
```
This applies to timeouts, intervals, percentages, retries, pixel values — everything.

### No Secrets in Code
NEVER hardcode API keys, tokens, or credentials. Use environment variables only (`os.Getenv()` in Go, `import.meta.env.VITE_*` in frontend). Secrets come from `.env` (gitignored) or runtime env vars.

### AI / LLM Surfaces
Before adding a new workflow or handler that calls an LLM, read [`docs/security/SECURITY-AI.md`](docs/security/SECURITY-AI.md) — it covers prompt injection, supply chain, agent drift, and the audit checklist for LLM-calling code. The six threat categories and exotic-attack notes (Unicode steganography, temporal split-payload, zero-trust between agents) apply to every new LLM surface.

### Netlify Functions
The production site (console.kubestellar.io) uses Netlify Functions, NOT the Go backend. API routes are proxied to `web/netlify/functions/*.mts`. When adding Go API handlers, update Netlify Functions separately. See `netlify.toml` for redirect mapping.

#### Route Parity Categories

Not every Go API route needs a Netlify Function. Routes fall into two categories:

**Routes WITH Netlify parity** (public/stateless data served on console.kubestellar.io):
| Go route | Netlify function | Purpose |
|----------|-----------------|---------|
| `/api/youtube/playlist` | `youtube-playlist` | YouTube content feed |
| `/api/youtube/thumbnail/*` | `youtube-thumbnail` | Thumbnail proxy |
| `/api/medium/blog` | `medium-blog` | Blog feed |
| `/api/rewards/github` | `github-rewards` | GitHub contributor rewards |
| `/api/rewards/badge/*` | `rewards-badge` | Reward badge images |
| `/api/rewards/bonus` | `bonus-points` | Bonus point claims |
| `/api/missions/browse` | `missions-browse` | Mission catalog |
| `/api/missions/file` | `missions-file` | Mission YAML files |
| `/api/missions/scores` | `missions-scores` | Mission leaderboard |
| `/api/issue-stats` | `issue-stats` | GitHub issue statistics |
| `/api/github-pipelines` | `github-pipelines` | CI/CD pipeline status |
| `/api/nightly-e2e/runs` | `nightly-e2e` | E2E test run history |
| `/api/acmm/scan` | `acmm-scan` | ACMM compliance scan |
| `/api/acmm/badge/*` | `acmm-badge` | ACMM badge images |
| `/api/nps` | `nps` | Net Promoter Score |
| `/api/feedback-app` | `feedback-app` | Feedback submissions |
| `/api/active-users` | `presence` | Online user count |
| `/api/analytics-dashboard` | `analytics-dashboard` | Analytics overview |
| `/api/analytics-accm` | `analytics-accm` | ACCM analytics |
| `/api/identity/oidc/*` | `identity-oidc-*` | OIDC identity summary |
| `/api/identity/rbac/*` | `identity-rbac-*` | RBAC findings/summary |
| `/api/identity/sessions/*` | `identity-sessions-*` | Session analytics |
| `/api/affiliate/clicks` | `affiliate-clicks` | Affiliate link tracking |
| `/api/gtag`, `/api/m`, `/api/send`, `/api/ksc` | `gtag-proxy`, `analytics-collect`, `umami-collect`, `umami-script` | Analytics collection proxies |

**Routes WITHOUT Netlify parity** (backend-only, require K8s/DB/agent access):
- **Settings & Persistence**: `/api/settings`, `/api/persistence/*` — SQLite database
- **Dashboards & Cards**: `/api/dashboards/*`, `/api/cards/*` — SQLite CRUD
- **K8s Proxying**: `/api/namespaces`, `/api/rbac/*`, `/api/openshift/*` — live cluster access
- **Agent Integration**: `/api/agent/*`, `/api/kagent/*`, `/api/kagenti-provider/*` — local agent bridge
- **GPU Management**: `/api/gpu/*` — GPU reservation system
- **Observability Tools**: `/api/gadget/*` — Inspektor Gadget traces
- **User Management**: `/api/users/*`, `/api/admin/*` — console RBAC
- **Onboarding**: `/api/onboarding/*` — setup wizard state
- **Notifications**: `/api/notifications/*` — alert delivery
- **Card Proxy**: `/api/card-proxy` — arbitrary URL proxy for card data
- **Token Usage**: `/api/token-usage/*` — LLM token accounting
- **Kubara Catalog**: `/api/kubara/*` — plugin catalog
- **Benchmarks**: `/api/benchmarks/*` — benchmark reports
- **Swaps**: `/api/swaps/*` — card swap suggestions
- **Feedback Queue**: `/api/feedback/requests/*` — feature request management
- **Events & Timeline**: `/api/events`, `/api/timeline` — activity log
- **GitHub Token**: `/api/github/token/*` — OAuth token management

**Rule of thumb**: If a route only reads from external public APIs (GitHub, YouTube, Medium) or writes to stateless services (analytics), it needs Netlify parity. If it touches K8s clusters, SQLite, the local agent, or user sessions, it's backend-only.

### MSW Passthrough
New Netlify Functions MUST have MSW (Mock Service Worker) passthrough rules so demo mode works correctly.

---

## Non-Card Component Patterns

### Modals / Drill-Downs
Use the `DrillDownProvider` context. Open drill-downs via `useDrillDown()` hook:
```tsx
const { openDrillDown } = useDrillDown()
openDrillDown({ view: 'logs', props: { podName, cluster } })
```
Drill-down views live in `web/src/components/drilldown/views/`. Each is a standalone component receiving props from the drill-down stack.

### UI Primitives
Reuse existing primitives from `web/src/components/ui/` before creating new ones:
- `Button.tsx` — variant/size maps (`primary | secondary | danger | ghost | accent`, `sm | md | lg`)
- `ClusterStatusBadge.tsx` — state config objects mapping status → color/icon/label
- `Tooltip.tsx`, `Modal.tsx`, `Badge.tsx`, `Tabs.tsx`

**Pattern:** Use variant/size config objects (not inline conditionals):
```tsx
const VARIANT_MAP: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  ghost: 'hover:bg-secondary/50 text-muted-foreground',
}
```

### Forms
No form library — use controlled components with `useState`. Validate at submit time.

### Tables / Lists
Use existing table components in `components/ui/`. For sortable/filterable lists, follow the pattern in drill-down views.

---

## Hook Naming & Conventions

### Naming Taxonomy
| Prefix | Purpose | Example |
|--------|---------|---------|
| `useCached*` | Data fetching with unified cache (SQLite + SWR) | `useCachedPods`, `useCachedProw` |
| `useCard*` | Card-specific behavior (navigation, history) | `useCardLoadingState`, `useCardHistory` |
| `useCluster*` | Cluster data and filtering | `useClusterData`, `useClusterGroups` |
| `useDashboard*` | Dashboard state and management | `useDashboards`, `useDashboardHealth` |
| `useSnoozed*` | Snooze/dismiss state for alerts, cards, missions | `useSnoozedAlerts`, `useSnoozedCards` |
| `use{Entity}` | Domain-specific logic | `useArgoCD`, `useKyverno`, `useTrestle` |
| `use{Utility}` | UI utilities | `useHoverState`, `useMobile`, `useFlashOnChange` |

### Caching Contract
All card data hooks MUST use `useCache()` from `lib/cache/index.ts`. This provides:
- SQLite WASM storage (off-main-thread) with IndexedDB fallback
- Stale-while-revalidate pattern
- Automatic demo fallback
- Failure tracking with exponential backoff

**Required return shape from cached hooks:**
```tsx
{
  data: T,
  isLoading: boolean,
  isRefreshing: boolean,
  isDemoData: boolean,       // MUST be passed to useCardLoadingState
  isFailed: boolean,
  consecutiveFailures: number,
  lastRefresh: number | null,
  refetch: () => Promise<void>,
}
```

### When to Create a New Hook vs Extend
- **New hook:** New data source, new API endpoint, or new domain concept
- **Extend existing:** Adding a field to an existing API response or a filter to existing data
- **Never:** Don't create a hook that wraps a single `useState` — just use `useState` directly

### createCachedHook Factory (Preferred for Simple Hooks)

For hooks that are pure passthroughs to `useCache()` — no parameters, no post-processing, no extra return fields — use the `createCachedHook` factory instead of writing the hook by hand. It eliminates ~200 lines of boilerplate per hook.

**Location:** `lib/cache/createCachedHook.ts` (re-exported from `lib/cache/index.ts`)

**Usage:**
```tsx
import { createCachedHook } from '@/lib/cache'

// 1. Define your types and demo data
interface FooStatus { healthy: boolean; count: number }
const INITIAL: FooStatus = { healthy: false, count: 0 }
const DEMO: FooStatus = { healthy: true, count: 42 }

// 2. Define your fetcher
async function fetchFoo(): Promise<FooStatus> {
  const resp = await fetch('/api/foo/status', { signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

// 3. Export the hook (one line!)
export const useCachedFoo = createCachedHook<FooStatus>({
  key: 'foo-status',
  initialData: INITIAL,
  demoData: DEMO,
  fetcher: fetchFoo,
})
```

**Config options:**
| Option | Required | Default | Purpose |
|--------|----------|---------|---------|
| `key` | ✅ | — | Unique cache key |
| `initialData` | ✅ | — | Data before first fetch |
| `fetcher` | ✅ | — | Async function returning `T` |
| `demoData` | — | — | Static demo fallback |
| `getDemoData` | — | — | Dynamic demo data factory (e.g., fresh timestamps) |
| `category` | — | `'default'` | Refresh interval category |
| `persist` | — | `true` | Whether to persist to SQLite/IndexedDB |

**When NOT to use the factory:**
- Hook needs parameters (e.g., cluster name, namespace)
- Hook post-processes data after fetch (aggregation, filtering)
- Hook returns extra fields beyond the standard `CachedHookResult<T>`
- Hook composes multiple `useCache` calls

**Existing hooks using the factory:** `useCachedThanosStatus`, `useCachedVitess`, `useCachedLonghorn`, `useCachedOtel`.

---

## Styling System

### Stack
- **Tailwind CSS** with PostCSS — all styles via utility classes
- **`cn()` utility** (`lib/cn.ts`) — always use for merging classNames (wraps clsx + tailwind-merge)
- **CSS Variables** in `web/src/index.css` — HSL-based semantic tokens
- **15+ themes** defined in `lib/themes.ts` — switchable at runtime

### Color Rules
**NEVER use raw hex colors in components.** Use semantic Tailwind classes:

| Use This | Not This |
|----------|----------|
| `text-foreground` | `text-white` or `text-[#ffffff]` |
| `bg-primary` | `bg-[#9333ea]` |
| `text-destructive` | `text-red-500` or `text-[#ef4444]` |
| `bg-card` | `bg-[#1a1a2e]` |
| `border-border` | `border-gray-700` |

**Status colors** (these are OK as Tailwind classes):
- Success: `text-green-400`, `bg-green-500/10`
- Warning: `text-yellow-400`, `bg-yellow-500/10`
- Error: `text-red-400`, `bg-red-500/10`
- Info: `text-cyan-400`, `bg-cyan-500/10`

### Dark/Light Mode
- Class-based: `darkMode: 'class'` in tailwind config
- The `:root` CSS vars default to dark theme; `.light` class overrides them
- Components should NOT use `dark:` prefix utilities — the CSS variable system handles theming automatically

### Glass Effect
Use the `.glass` CSS class for frosted-glass card backgrounds. Don't recreate with inline styles.

### Responsive Design
Mobile-first with Tailwind breakpoints: `sm:` (640px), `md:` (768px), `lg:` (1024px), `xl:` (1280px).
Common grid pattern:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
```

### Animations
- Respect `prefers-reduced-motion` — use `.reduce-motion` guard class
- GPU-accelerated animations use `translate3d(0,0,0)` for compositing
- Custom animations defined in `tailwind.config.js` (`roll-up`, `spin-slow`, `pulse-once`, etc.)

---

## Go Backend Patterns

### Framework
**Fiber v2** (Express-like). All handlers follow `func(c *fiber.Ctx) error`.

### Adding a New API Endpoint

1. **Create handler struct** in `pkg/api/`:
```go
type MyHandler struct {
    store store.Store
}
func NewMyHandler(s store.Store) *MyHandler {
    return &MyHandler{store: s}
}
```

2. **Implement handler methods:**
```go
func (h *MyHandler) GetThing(c *fiber.Ctx) error {
    userID := middleware.GetUserID(c)

    thing, err := h.store.GetThing(userID)
    if err != nil {
        return fiber.NewError(fiber.StatusInternalServerError, "Failed to get thing")
    }
    if thing == nil {
        return fiber.NewError(fiber.StatusNotFound, "Thing not found")
    }
    return c.JSON(thing)
}
```

3. **Register route** in `pkg/api/server.go` → `setupRoutes()`:
```go
api.Get("/things", myHandler.GetThing)
```

### Error Handling
Use `fiber.NewError(statusCode, message)` — the global error handler formats the JSON response:
```json
{ "error": "message here" }
```

### Response Format
- Success: `c.JSON(data)` or `c.Status(fiber.StatusCreated).JSON(data)`
- Map responses: `c.JSON(fiber.Map{"items": items, "source": "k8s"})`
- No content: `c.SendStatus(fiber.StatusNoContent)`

### Multi-Cluster Queries
Use goroutines + `sync.WaitGroup` for parallel cluster requests:
```go
var wg sync.WaitGroup
var mu sync.Mutex
results := make([]T, 0)

for _, cl := range clusters {
    wg.Add(1)
    go func(name string) {
        defer wg.Done()
        ctx, cancel := context.WithTimeout(parentCtx, timeout)
        defer cancel()
        // fetch and append under mu.Lock()
    }(cl.Name)
}
wg.Wait()
```

### SSE Streaming
For streaming endpoints, use `c.Context().SetBodyStreamWriter()` with SSE events.

### Demo Mode
Every endpoint that returns data MUST check demo mode first:
```go
if isDemoMode(c) {
    return demoResponse(c, "things", getDemoThings())
}
```

### Go Slice Initialization
Always use `make([]T, 0)` not `var x []T` — nil slices serialize to `null` in JSON, empty slices to `[]`.

### Logging
Use `log/slog` (structured logging). JSON format in production, text in dev.

---

## State Management

**No external state libraries** (no Redux, Zustand, Jotai). Pure React.

### When to Use What

| Mechanism | When to Use | Example |
|-----------|-------------|---------|
| `useState` | Component-local state | Form inputs, toggles |
| React Context | Shared state across component tree | Auth, theme, global filters |
| `useCache` / `useCached*` | Server data with persistence | Pod lists, cluster health |
| `localStorage` | User preferences that persist across sessions | Theme choice, demo mode, snoozed items |
| URL params | Deep-linkable state (rare) | `?mission=:id`, `?browse=missions` |
| Event bus | Cross-component notifications (fire-and-forget) | Deploy progress, demo mode changes |

### Context Providers
Providers are wrapped in `App.tsx`. Key providers:
- `AuthProvider` — JWT tokens, user session
- `ThemeProvider` — theme selection
- `GlobalFiltersProvider` — cluster/severity filtering
- `DashboardProvider` — modal states, card history
- `DrillDownProvider` — drill-down navigation stack
- `AlertsProvider` — system alerts and rules
- `StackProvider` — LLM-d stack selection (AI/ML cards)
- `MissionProvider` — agent mission state

### Demo Mode
Global singleton with pub/sub (`lib/demoMode.ts`), not Context. Cross-tab sync via `storage` event.

---

## Internationalization (i18n)

### Library
`i18next` + `react-i18next`. Configured in `lib/i18n.ts`.

### Using Translations
```tsx
import { useTranslation } from 'react-i18next'

function MyComponent() {
  const { t } = useTranslation()
  return <h1>{t('mySection.title')}</h1>
}
```

### Key Naming
Dot-separated hierarchy: `section.subsection.key`
- `navigation.dashboard` → "Dashboard"
- `actions.save` → "Save"
- `clusterHealth.healthyTooltip` → tooltip text

### Namespaces
| Namespace | File | Purpose |
|-----------|------|---------|
| `common` | `locales/en/common.json` | Navigation, actions, labels, general UI |
| `cards` | `locales/en/cards.json` | Card titles and content |
| `errors` | `locales/en/errors.json` | Error messages |
| `status` | `locales/en/status.json` | Status values |

Default namespace is `common`. For others: `const { t } = useTranslation('cards')`.

### Plurals
Use `{{count}}` with `_one` / `_other` suffixed keys:
```json
{
  "items_one": "{{count}} item",
  "items_other": "{{count}} items"
}
```
```tsx
t('items', { count: 5 })  // "5 items"
```

### Interpolation
```json
{ "greeting": "Hello {{name}}" }
```
```tsx
t('greeting', { name: 'Alice' })
```

### Adding a New Key
1. Add to `web/src/locales/en/<namespace>.json`
2. Use `t('your.key')` in the component
3. NEVER use raw strings for user-facing text

---

## Architecture Decisions

### Why Netlify Functions AND a Go Backend?
The Go backend serves the console when self-hosted (local, container, Kubernetes). Netlify Functions serve the hosted version at console.kubestellar.io. Both must implement the same API contract.

### Why SQLite WASM in a Web Worker?
Persistent cache (IndexedDB is slower for structured queries). Web Worker keeps I/O off the main thread to prevent UI jank. SessionStorage provides fast sync hydration on page reload.

### Why No State Management Library?
React Context + hooks covers all use cases. The app has 12 focused contexts rather than one global store. This avoids unnecessary dependencies and keeps bundle size small.

### Why Demo Mode Everywhere?
The console must work without any cluster connection for demos, docs, and the hosted site. Every data hook has a demo fallback path. The `isDemoData` flag drives visual indicators (yellow badge/outline) so users know what's live vs simulated.

### Why i18next?
10 locales supported. English is the only complete translation set — others fall back to English. All user-facing strings must use `t()` from `useTranslation()`.

