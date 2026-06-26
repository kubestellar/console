# Card & Dashboard Development Guide

> **For AI coding assistants and human contributors alike.**
> If you were linked here from an issue or PR comment, READ THIS ENTIRE FILE before writing code.
> Following this guide will prevent 90% of the review feedback we give on card PRs.

---

## Quick Reference: Common Rejection Reasons

| Trap | What goes wrong | Fix |
|------|----------------|-----|
| Demo data only | Card shows fake data, no live K8s queries | Must fetch real data AND fall back to demo |
| Missing `isDemoData` wiring | Demo badge never appears, users think data is real | Destructure `isDemoFallback` from `useCache`, pass to `useCardLoadingState` |
| Magic numbers | `setTimeout(fn, 5000)` with no explanation | Use named constants: `const WS_RECONNECT_MS = 5000` |
| Hardcoded English strings | `"No data available"` in JSX | Use `t('cardName.noData')` with locale keys |
| Scope creep beyond card files | PR modifies Go backend, netlify functions, workflows | Only touch YOUR card's files — see [Scope Rules](#scope-rules-no-scope-creep) |
| `useFormatRelativeTime` copy-paste | Same helper duplicated in every card | Import from shared utilities |
| Nil slices in Go handlers | API returns `{"nodes": null}` instead of `[]` | Use `make([]T, 0)` not `var x []T` |
| Raw error messages in API | `err.Error()` leaks cluster names to browser | `log.Printf(...)` + return generic `"internal server error"` |
| Array operations on undefined | `.map()`, `.join()`, `.reduce()` on undefined crashes | Guard ALL array ops: `(arr \|\| []).join(', ')` |
| No tests | Card ships with zero test coverage | Must include render test + pure function tests |
| Broad pod detection | `name.includes('kafka')` matches unrelated pods | Use label selectors or CRD queries, not substring matching |
| Hardcoded status labels | Status display functions use English strings | Status labels from K8s are passthrough; custom UI labels use `t()` |
| Wrong `hasAnyData` | Card flickers empty when tool not installed | `hasAnyData: !data.detected` prevents empty state for not-installed tools |
| PR title missing emoji | `Add new card` | Must be `✨ Add Foo monitoring card` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│  CardWrapper (reads CardDataContext)             │
│  ├── Shows demo badge if isDemoData === true     │
│  ├── Shows yellow border in demo mode            │
│  └── Shows skeleton / error / empty states       │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  YourCard.tsx (component)                   │ │
│  │  ├── Calls useYourCardData() hook           │ │
│  │  ├── Destructures { data, isDemoFallback }  │ │
│  │  ├── Calls useCardLoadingState()            │ │
│  │  └── Renders MetricTiles, lists, charts     │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Data Flow:
  useCache() → fetcher() → /api/mcp/... → Go backend → K8s API
       ↓
  isDemoFallback (true if live fetch empty or demo mode)
       ↓
  useCardLoadingState({ isDemoData: isDemoFallback })
       ↓
  CardWrapper reads context → renders demo badge
```

---

## Files Required for a New Card

Every card needs ALL of these. Missing any one will cause issues.

### Checklist

- [ ] **Component**: `web/src/components/cards/your_card/YourCard.tsx`
- [ ] **Data hook**: `web/src/components/cards/your_card/useYourCardStatus.ts`
- [ ] **Demo data**: `web/src/components/cards/your_card/demoData.ts`
- [ ] **Barrel export**: `web/src/components/cards/your_card/index.ts`
- [ ] **Card registry**: Add lazy import + entry in `cardRegistry.ts`
- [ ] **Card metadata**: Add title + description in `cardMetadata.ts`
- [ ] **Add Card Modal**: Add catalog entry in `AddCardModal.tsx`
- [ ] **Locale strings**: Add keys in `web/src/locales/en/cards.json`
- [ ] **Tests**: `web/src/components/cards/your_card/__tests__/YourCard.test.tsx`
- [ ] **Preset JSON** (optional): `presets/your-card.json`

### Scope Rules (No Scope Creep)

Your PR should ONLY contain files for YOUR card. This is the #1 reason PRs get sent back.

**Files you MAY modify:**
- `web/src/components/cards/your_card/*` (your card directory)
- `web/src/components/cards/cardRegistry.ts` (add YOUR card only)
- `web/src/components/cards/cardMetadata.ts` (add YOUR card only)
- `web/src/components/cards/AddCardModal.tsx` (add YOUR catalog entry only)
- `web/src/locales/en/cards.json` (add YOUR keys only)
- `presets/your-card.json` (your preset only)

**Files you MUST NOT modify:**
- `go.mod`, `go.sum` (Go dependencies)
- `pkg/api/handlers/*` (Go backend handlers)
- `web/netlify/functions/*` (Netlify serverless functions)
- `.github/workflows/*` (CI/CD workflows)
- `web/src/components/cards/CardDataContext.tsx`
- `web/src/lib/cache.ts`
- Other cards' directories
- `cardRegistry.ts` entries for other people's cards
- `DEMO_DATA_CARDS` or `CARD_CHUNK_PRELOADERS` entries for other cards

If your card needs a new backend endpoint, submit it as a **separate PR** or coordinate with a maintainer.

---

## The #1 Mistake: Demo-Only Data

**Every card MUST support both live AND demo data.**

### Bad (demo only — will be rejected)

```typescript
// This only detects pods, returns empty arrays for everything else
async function fetchMyToolStatus(): Promise<MyToolStatus> {
  const resp = await fetch('/api/mcp/pods')
  const pods = resp.json().pods.filter(p => p.name.includes('mytool'))
  return {
    detected: pods.length > 0,
    pods: pods.length,
    // These are ALWAYS empty — no real data!
    customResources: [],
    metrics: { total: 0, active: 0, failed: 0 },
  }
}
```

### Good (live + demo data)

```typescript
async function fetchMyToolStatus(): Promise<MyToolStatus> {
  const resp = await fetch('/api/mcp/mytool/status', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const body = await resp.json()
  return {
    detected: true,
    pods: body.pods ?? 0,
    customResources: body.resources ?? [],
    metrics: body.metrics ?? { total: 0, active: 0, failed: 0 },
  }
}
```

If your tool requires custom Kubernetes resources (CRDs), you need a **backend endpoint** in the Go API that queries them. Frontend-only detection via pod labels is not sufficient.

---

## The isDemoData Wiring Pattern (MANDATORY)

This is the most common source of bugs. Without this, cards show demo data with no visual indicator.

```typescript
// useYourCardStatus.ts
import { useCache } from '../../../lib/cache'
import { useCardLoadingState } from '../CardDataContext'
import { YOUR_DEMO_DATA } from './demoData'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

const CACHE_KEY = 'your-card-status'

export function useYourCardStatus() {
  // Step 1: useCache returns isDemoFallback
  const {
    data,
    isLoading,
    isDemoFallback,  // <-- MUST destructure this
    isFailed,
    consecutiveFailures,
    error,
  } = useCache<YourCardData>({
    key: CACHE_KEY,
    fetcher: fetchYourCardStatus,
    initialData: INITIAL_DATA,
    demoData: YOUR_DEMO_DATA,
    category: 'pods',
  })

  // Step 2: Pass isDemoFallback to useCardLoadingState as isDemoData
  const { showSkeleton, showEmptyState } = useCardLoadingState({
    isLoading,
    hasAnyData: data.items.length > 0,
    isFailed,
    consecutiveFailures,
    errorMessage: error ?? undefined,
    isDemoData: isDemoFallback,  // <-- CRITICAL: connects demo state to CardWrapper
  })

  return { data, isLoading, showSkeleton, showEmptyState, isDemoFallback }
}
```

### What happens if you skip this?

1. User has no live clusters connected
2. `useCache` returns demo data, sets `isDemoFallback = true`
3. BUT `useCardLoadingState` never receives `isDemoData`
4. CardWrapper thinks data is real — no demo badge, no yellow border
5. User makes decisions based on fake data thinking it's real
6. **This is a regression we actively reject PRs for.**

### Getting `hasAnyData` Right (Not-Installed vs Empty)

The `hasAnyData` parameter controls whether the card shows an empty state. Getting it wrong causes flicker or misleading UI.

```typescript
// BAD — flickers empty when tool is simply not installed
const { showSkeleton, showEmptyState } = useCardLoadingState({
  // ...
  hasAnyData: data.items.length > 0,  // false when tool not installed!
})

// GOOD — treat "not detected" as valid data (show the "not installed" message)
const { showSkeleton, showEmptyState } = useCardLoadingState({
  // ...
  hasAnyData: !data.detected ? true : data.items.length > 0,
})
```

**Rule:** If your data type has a `detected` field, set `hasAnyData: true` when `detected === false`. This prevents the empty state from showing — instead, your card renders its own "not detected / not installed" message.

---

## Pod Detection: Be Specific

Pod name substring matching is unreliable. Broad patterns match unrelated workloads.

### Bad (too broad — will be rejected)

```typescript
// "kafka" matches kafka-ui, kafka-exporter, my-kafka-consumer, etc.
const kafkaPods = pods.filter(p => p.name.includes('kafka'))

// "feature" could match anything
const ofPods = pods.filter(p => p.name.includes('feature'))
```

### Good (use labels or CRD queries)

```typescript
// Prefer label selectors in the backend query
const kafkaPods = pods.filter(p =>
  p.labels?.['strimzi.io/kind'] === 'Kafka' ||
  p.labels?.['app.kubernetes.io/managed-by'] === 'strimzi-cluster-operator'
)

// Or query CRDs directly (best approach for tools with custom resources)
const resp = await fetch('/api/mcp/strimzi/status')  // Backend queries CRDs
```

**Best practice:** If your tool installs CRDs (most CNCF tools do), query those CRDs in the backend rather than guessing from pod names. See the [Go Backend Endpoint Pattern](#go-backend-endpoint-pattern) section.

Recent examples of cards with proper CRD-based detection:
- **KEDA**: queries `keda.sh/v1alpha1` ScaledObjects and ScaledJobs
- **Strimzi**: queries `kafka.strimzi.io/v1beta2` Kafkas and KafkaTopics
- **OpenFeature**: queries `core.openfeature.dev/v1beta1` FeatureFlagConfigurations
- **KubeVela**: queries `core.oam.dev/v1beta1` Applications

---

## Go Backend Endpoint Pattern

If your card needs data beyond pod detection, add a backend endpoint.

### Handler Pattern

```go
// pkg/api/handlers/mcp.go

func (h *MCPHandlers) GetYourToolStatus(c *fiber.Ctx) error {
    // Demo mode: return representative demo data
    if isDemoMode(c) {
        return demoResponse(c, "items", getDemoYourToolItems())
    }

    cluster := c.Query("cluster")

    if h.k8sClient != nil {
        if cluster == "" {
            // Multi-cluster: query all healthy clusters in parallel
            clusters, _, err := h.k8sClient.HealthyClusters(c.Context())
            if err != nil {
                log.Printf("internal error: %v", err)  // Log the real error
                return c.Status(500).JSON(fiber.Map{
                    "error": "internal server error",   // Generic message to client
                })
            }

            var wg sync.WaitGroup
            var mu sync.Mutex
            allItems := make([]k8s.YourToolItem, 0)  // NOT var allItems []T (nil = JSON null)

            for _, cl := range clusters {
                wg.Add(1)
                go func(clusterName string) {
                    defer wg.Done()
                    ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
                    defer cancel()

                    items, err := h.k8sClient.GetYourToolItems(ctx, clusterName)
                    if err == nil && len(items) > 0 {
                        mu.Lock()
                        allItems = append(allItems, items...)
                        mu.Unlock()
                    }
                }(cl.Name)
            }

            waitWithDeadline(&wg, maxResponseDeadline)
            return c.JSON(fiber.Map{"items": allItems, "source": "k8s"})
        }

        // Single-cluster query
        ctx, cancel := context.WithTimeout(c.Context(), mcpDefaultTimeout)
        defer cancel()
        items, err := h.k8sClient.GetYourToolItems(ctx, cluster)
        if err != nil {
            log.Printf("internal error: %v", err)
            return c.Status(500).JSON(fiber.Map{"error": "internal server error"})
        }
        return c.JSON(fiber.Map{"items": items, "source": "k8s"})
    }

    return c.Status(503).JSON(fiber.Map{"error": "No cluster access available"})
}
```

### Critical Rules

| Rule | Why |
|------|-----|
| `make([]T, 0)` not `var x []T` | Nil slice serializes as JSON `null`, empty slice as `[]` |
| `log.Printf` + generic error message | Raw `err.Error()` leaks cluster names, paths, API URLs |
| `context.WithTimeout` on single-cluster paths | Without timeout, hung backend blocks the request forever |
| `HealthyClusters()` for multi-cluster | Internally calls `DeduplicatedClusters()` — prevents duplicate results |
| `waitWithDeadline(&wg, maxResponseDeadline)` | Prevents goroutine leaks if a cluster is unresponsive |

---

## Named Constants (No Magic Numbers)

Every numeric literal must be a named constant with a comment.

### Bad

```typescript
setTimeout(fn, 5000)
if (retries > 3) return
const items = data.slice(0, 10)
```

### Good

```typescript
/** Delay before reconnecting WebSocket after disconnect */
const WS_RECONNECT_MS = 5000
/** Maximum fetch retry attempts before giving up */
const MAX_FETCH_RETRIES = 3
/** Default number of items shown before "Show more" */
const DEFAULT_VISIBLE_ITEMS = 10

setTimeout(fn, WS_RECONNECT_MS)
if (retries > MAX_FETCH_RETRIES) return
const items = data.slice(0, DEFAULT_VISIBLE_ITEMS)
```

This applies to demo data too:

```typescript
// Bad — what do these numbers mean?
const DEMO_DATA = {
  lastSeen: Date.now() - 30000,
  uptime: 86400000,
  items: Array.from({ length: 5 }, ...),
}

// Good
/** Demo: last seen 30 seconds ago */
const DEMO_LAST_SEEN_AGO_MS = 30_000
/** Demo: 24 hours uptime */
const DEMO_UPTIME_MS = 24 * 60 * 60 * 1000
/** Demo: number of sample items to generate */
const DEMO_ITEM_COUNT = 5

const DEMO_DATA = {
  lastSeen: Date.now() - DEMO_LAST_SEEN_AGO_MS,
  uptime: DEMO_UPTIME_MS,
  items: Array.from({ length: DEMO_ITEM_COUNT }, ...),
}
```

---

## Internationalization (i18n)

All user-visible strings must use `t()` from `react-i18next`.

### Bad

```tsx
<span>No data available</span>
<MetricTile label="Total Pods" value={count} />
```

### Good

```tsx
<span>{t('yourCard.noData')}</span>
<MetricTile label={t('yourCard.totalPods')} value={count} />
```

### Locale File Format

Add keys to `web/src/locales/en/cards.json`:

```json
{
  "yourCard": {
    "totalPods": "Total Pods",
    "noData": "No data available",
    "healthStatus": "Health Status",
    "clusterCount": "{{count}} clusters",
    "clusterCount_one": "{{count}} cluster",
    "clusterCount_other": "{{count}} clusters"
  }
}
```

**Note:** We currently only have English translations. You only need to add keys to `en/cards.json`. Do NOT add keys to other language files unless you have verified translations.

### What about Kubernetes status strings?

Status strings from Kubernetes (e.g., `Running`, `CrashLoopBackOff`, `Pending`) are **passthrough** — display them as-is. Do NOT translate these.

But **custom UI labels** you create (column headers, tooltips, descriptions) MUST use `t()`:

```tsx
// OK — Kubernetes status is passthrough
<span>{issue.status}</span>

// BAD — custom label is hardcoded English
<span>Unhealthy</span>
<MetricTile label="Active Replicas" ... />

// GOOD — custom labels use t()
<span>{t('yourCard.unhealthy')}</span>
<MetricTile label={t('yourCard.activeReplicas')} ... />
```

---

## Array Safety

Hook data and API responses can be `undefined`. Always guard **every** array operation.

### Bad (will crash)

```typescript
const labels = data.items.join(', ')
for (const item of data.results) { ... }
data.clusters.map(c => c.name)
const total = data.metrics.reduce((sum, m) => sum + m.value, 0)
const healthy = data.pods.filter(p => p.status === 'Running')
if (data.issues.length > 0) { ... }
```

### Good

```typescript
const labels = (data.items || []).join(', ')
for (const item of (data.results || [])) { ... }
(data.clusters || []).map(c => c.name)
const total = (data.metrics || []).reduce((sum, m) => sum + m.value, 0)
const healthy = (data.pods || []).filter(p => p.status === 'Running')
if ((data.issues || []).length > 0) { ... }
```

**This applies to ALL array methods**: `.map()`, `.filter()`, `.reduce()`, `.join()`, `.some()`, `.every()`, `.find()`, `.forEach()`, `.length`, and `for...of` loops. A production crash was caused by an unguarded `.join()` — this is not theoretical.

---

## Card Registry Entry

Add your card to `cardRegistry.ts`:

```typescript
// Your Card
const YourCard = lazy(() => import('./your_card').then(m => ({ default: m.YourCard })))

// In RAW_CARD_COMPONENTS:
const RAW_CARD_COMPONENTS: Record<string, CardComponent> = {
  // ... existing cards ...
  your_card: YourCard,
}
```

### When to add to DEMO_DATA_CARDS

Only add your card type to `DEMO_DATA_CARDS` if it **always** shows demo data and **never** fetches live data. Most cards should NOT be in this set — they should dynamically report `isDemoData` through the hook wiring pattern above.

---

## Component Pattern

```tsx
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../../ui/Skeleton'
import { MetricTile } from '../../../lib/cards/CardComponents'
import { useYourCardStatus } from './useYourCardStatus'

export function YourCard() {
  const { t } = useTranslation('cards')
  const { data, showSkeleton, showEmptyState } = useYourCardStatus()

  if (showSkeleton) {
    return (
      <div className="space-y-3 p-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    )
  }

  if (showEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <p className="text-sm">{t('yourCard.notDetected')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile
          label={t('yourCard.total')}
          value={data.total}
          colorClass="text-blue-400"
          icon={<Server className="w-4 h-4 text-blue-400" />}
        />
        {/* ... more tiles ... */}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {(data.items || []).map(item => (
          <div key={item.id} className="...">
            {/* ... */}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Test Requirements

Every card PR must include tests. Cards without tests will be rejected.

### Required Tests

Create `web/src/components/cards/your_card/__tests__/YourCard.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { YourCard } from '../YourCard'

// Mock the data hook
vi.mock('../useYourCardStatus', () => ({
  useYourCardStatus: vi.fn(),
}))

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

import { useYourCardStatus } from '../useYourCardStatus'

describe('YourCard', () => {
  it('renders skeleton when loading', () => {
    vi.mocked(useYourCardStatus).mockReturnValue({
      data: INITIAL_DATA,
      showSkeleton: true,
      showEmptyState: false,
      isDemoFallback: false,
    })
    render(<YourCard />)
    // Skeleton should be visible
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('renders empty state when not detected', () => {
    vi.mocked(useYourCardStatus).mockReturnValue({
      data: { ...INITIAL_DATA, detected: false },
      showSkeleton: false,
      showEmptyState: true,
      isDemoFallback: false,
    })
    render(<YourCard />)
    expect(screen.getByText('yourCard.notDetected')).toBeTruthy()
  })

  it('renders data when loaded', () => {
    vi.mocked(useYourCardStatus).mockReturnValue({
      data: YOUR_DEMO_DATA,  // Reuse your demo data
      showSkeleton: false,
      showEmptyState: false,
      isDemoFallback: false,
    })
    render(<YourCard />)
    // Verify key data elements render
    expect(screen.getByText('yourCard.total')).toBeTruthy()
  })
})
```

### Test Pure Functions Separately

If your card has helper functions (status mappers, formatters, etc.), test them in isolation:

```typescript
// __tests__/helpers.test.ts
import { getYourToolSeverity } from '../helpers'

describe('getYourToolSeverity', () => {
  it('maps Running to success', () => {
    expect(getYourToolSeverity('Running')).toBe('success')
  })
  it('maps unknown status to neutral', () => {
    expect(getYourToolSeverity('SomeUnknownThing')).toBe('neutral')
  })
  it('handles undefined', () => {
    expect(getYourToolSeverity(undefined)).toBe('neutral')
  })
})
```

### Running Tests

```bash
cd web && npx vitest run --reporter=verbose src/components/cards/your_card
```

---

## PR Requirements

### Title Format

```
✨ Add FooBar monitoring card
```

Emoji prefixes: `✨` feature | `🐛` bug fix | `📖` docs | `🌱` other

### DCO Sign-off

Every commit must include DCO sign-off:

```bash
git commit -s -m "✨ Add FooBar monitoring card"
```

### Before Submitting

- [ ] `cd web && npm run build` passes
- [ ] `cd web && npm run lint` passes
- [ ] `cd web && npx vitest run src/components/cards/your_card` passes
- [ ] Rebase onto latest `main`
- [ ] Only YOUR card's files are changed (see [Scope Rules](#scope-rules-no-scope-creep))
- [ ] Live data works (not just demo data)
- [ ] `isDemoFallback` → `isDemoData` wiring is present
- [ ] `hasAnyData` handles both "not installed" and "installed but empty"
- [ ] All custom UI strings use `t()` i18n calls
- [ ] No magic numbers — all constants are named (including demo data)
- [ ] All array operations guard against `undefined` (`.map`, `.filter`, `.reduce`, `.join`, `.length`)
- [ ] Pod detection uses labels or CRDs, not broad name substrings
- [ ] Go API uses `make([]T, 0)`, `log.Printf`, `context.WithTimeout`

### One Card Per PR

Each PR should add exactly one card. Do not:
- Bundle multiple unrelated cards in one PR
- Register other contributors' cards in your `cardRegistry.ts` changes
- Modify shared infrastructure (CardDataContext, useCache, etc.) without discussion

---

## Preset JSON (Optional)

If your card monitors a CNCF project, add a preset:

```json
{
  "format": "kc-card-preset-v1",
  "card_type": "your_card",
  "title": "Your Tool",
  "description": "Monitor Your Tool status, metrics, and health",
  "category": "Monitoring",
  "project": "your-tool",
  "cncf_status": "incubating",
  "config": {}
}
```

---

## Using This Guide with AI Assistants

If you're using an AI coding assistant (GitHub Copilot, ChatGPT, Claude, etc.) to help build your card, paste this entire guide into the conversation context. Key instructions for AI:

1. **Always implement both live data fetching AND demo data fallback**
2. **Always wire `isDemoFallback` through to `useCardLoadingState`**
3. **Set `hasAnyData` correctly** — `true` when tool is not installed (show "not detected" message, not empty state)
4. **Never use hardcoded strings in JSX — use `t()` calls** (except K8s status strings which are passthrough)
5. **Never use magic numbers — define named constants** (including demo data time offsets)
6. **Guard ALL array operations against undefined** — `.map()`, `.filter()`, `.reduce()`, `.join()`, `.length`, `for...of`
7. **Use label selectors or CRD queries for pod detection** — never broad `name.includes()` matching
8. **Include tests** — render tests for skeleton/empty/data states, plus pure function unit tests
9. **Follow the exact file structure listed in the checklist above**
10. **Do NOT modify files outside your card directory** — see [Scope Rules](#scope-rules-no-scope-creep)
11. **Run `npm run build && npm run lint && npx vitest run` before committing**
12. **Sign commits with `-s` for DCO**

---

## Questions?

Open an issue with the `question` label, or comment on your PR and a maintainer will help.
