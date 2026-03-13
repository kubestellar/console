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
| Scope creep in registry | PR registers 5 unrelated cards in `cardRegistry.ts` | Only register YOUR card — one card per PR |
| `useFormatRelativeTime` copy-paste | Same helper duplicated in every card | Import from shared utilities |
| Nil slices in Go handlers | API returns `{"nodes": null}` instead of `[]` | Use `make([]T, 0)` not `var x []T` |
| Raw error messages in API | `err.Error()` leaks cluster names to browser | `log.Printf(...)` + return generic `"internal server error"` |
| Array operations on undefined | `.join()` or `for...of` on undefined crashes | Always guard: `(arr \|\| []).join(', ')` |
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
- [ ] **Preset JSON** (optional): `presets/your-card.json`

### Do NOT touch these files for other cards

Your PR should only modify `cardRegistry.ts` to add YOUR card. Do not:
- Register other people's cards
- Add unrelated cards to `DEMO_DATA_CARDS`
- Add unrelated cards to `CARD_CHUNK_PRELOADERS`
- Modify `CardDataContext.tsx` (if you think you need to, ask first)

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

This applies to demo data too — `30 * 1000` in a `lastSeen` field needs a constant.

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

---

## Array Safety

Hook data and API responses can be `undefined`. Always guard.

### Bad (will crash)

```typescript
const labels = data.items.join(', ')
for (const item of data.results) { ... }
data.clusters.map(c => c.name)
```

### Good

```typescript
const labels = (data.items || []).join(', ')
for (const item of (data.results || [])) { ... }
(data.clusters || []).map(c => c.name)
```

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
- [ ] Rebase onto latest `main`
- [ ] Only YOUR card's files are changed (no scope creep)
- [ ] Live data works (not just demo data)
- [ ] `isDemoFallback` → `isDemoData` wiring is present
- [ ] All strings use `t()` i18n calls
- [ ] No magic numbers — all constants are named
- [ ] Array operations guard against `undefined`
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
3. **Never use hardcoded strings in JSX — use `t()` calls**
4. **Never use magic numbers — define named constants**
5. **Guard all array operations against undefined**
6. **Follow the exact file structure listed in the checklist above**
7. **Run `npm run build && npm run lint` before committing**
8. **Sign commits with `-s` for DCO**

---

## Questions?

Open an issue with the `question` label, or comment on your PR and a maintainer will help.
