# 📸 Contributing a Dashboard Card to KubeStellar Console

This guide walks you through adding a new ecosystem card to the KubeStellar Console dashboard. The console already ships **313 cards** covering the CNCF ecosystem — yours could be next.

## Before You Start

- Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for general contribution guidelines and DCO sign-off requirements
- Join [CNCF Slack](https://slack.cncf.io/) → `#kubestellar` and introduce yourself
- Browse the [console-marketplace](https://github.com/kubestellar/console-marketplace) to check if a similar card already exists

## Card Architecture Overview

Every dashboard card follows the same four-layer pattern:

```
API endpoint (Go)         →  pkg/api/handlers/<card>.go
Cache hook (TypeScript)   →  web/src/hooks/useCached<Card>.ts
Card component (React)    →  web/src/components/cards/<card-slug>/
Card registry entry       →  web/src/lib/cardRegistry.ts
```

All four layers must be present for a card to work correctly.

---

## Step-by-Step: Adding a New Card

### 1. Pick a Scope

A card should surface a single tool’s health or status from a Kubernetes cluster. Good examples:
- “Show Flux GitOps sync status”
- “Show Volcano GPU queue depth”
- “Show Trivy vulnerability scan results”

If your card needs to call an external API (not K8s), check whether a Netlify Function is needed (see [CLAUDE.md](../../CLAUDE.md) → Netlify Functions section).

### 2. Create the Go API Handler

Create `pkg/api/handlers/<card>_handler.go`:

```go
package handlers

import (
    "github.com/gofiber/fiber/v2"
    "github.com/kubestellar/console/pkg/k8s"
)

type MyToolHandler struct {
    clusters k8s.ClusterProvider
}

func NewMyToolHandler(c k8s.ClusterProvider) *MyToolHandler {
    return &MyToolHandler{clusters: c}
}

func (h *MyToolHandler) GetStatus(c *fiber.Ctx) error {
    // Always check demo mode first!
    if isDemoMode(c) {
        return demoResponse(c, "my-tool", getDemoMyToolStatus())
    }
    // ... real implementation
    return c.JSON(result)
}
```

Register the route in `pkg/api/server.go`:
```go
myTool := handlers.NewMyToolHandler(clusters)
api.Get("/my-tool/status", myTool.GetStatus)
```

### 3. Write the Cache Hook

Create `web/src/hooks/useCachedMyTool.ts`.

For simple hooks with no parameters and no post-processing, use the `createCachedHook` factory:

```typescript
import { createCachedHook } from '@/lib/cache'

export interface MyToolStatus {
  healthy: boolean
  version: string
  podCount: number
}

const INITIAL: MyToolStatus = { healthy: false, version: '', podCount: 0 }

export const DEMO_MY_TOOL_STATUS: MyToolStatus = {
  healthy: true,
  version: 'v1.2.3',
  podCount: 3,
}

async function fetchMyToolStatus(): Promise<MyToolStatus> {
  const resp = await fetch('/api/my-tool/status', {
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

export const useCachedMyToolStatus = createCachedHook<MyToolStatus>({
  key: 'my-tool-status',
  initialData: INITIAL,
  demoData: DEMO_MY_TOOL_STATUS,
  fetcher: fetchMyToolStatus,
})
```

For hooks that need parameters or post-processing, write the hook manually using `useCache` from `@/lib/cache`.

### 4. Build the Card Component

Create `web/src/components/cards/my_tool_status/`:

```
my_tool_status/
  MyToolStatus.tsx    ← main component
  demoData.ts         ← demo data constants
  index.ts            ← re-export
```

**Critical: always wire `isRefreshing` and `isDemoData`** into `useCardLoadingState`:

```tsx
// web/src/components/cards/my_tool_status/MyToolStatus.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '../CardDataContext'
import { useCachedMyToolStatus } from '../../../hooks/useCachedMyTool'

export const MyToolStatus: React.FC = () => {
  const { t } = useTranslation()
  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
  } = useCachedMyToolStatus()

  useCardLoadingState({
    isLoading,
    isRefreshing,   // ← required: drives refresh animation
    isDemoData,     // ← required: drives Demo badge + yellow outline
    hasAnyData: data.podCount > 0,
    isFailed,
    consecutiveFailures,
  })

  return (
    <div className="p-4 space-y-2">
      <div className="text-sm text-muted-foreground">
        {t('myTool.version', { version: data.version })}
      </div>
      {/* ... */}
    </div>
  )
}
```

**Styling rules:**
- Use semantic Tailwind classes (`text-foreground`, `bg-card`, `border-border`) — never raw hex colors
- Use `cn()` from `@/lib/cn` for conditional class merging
- All user-facing strings must use `t()` from `useTranslation()`

### 5. Register the Card

Add your card to `web/src/lib/cardRegistry.ts`:

```typescript
import { MyToolStatus } from '../components/cards/my_tool_status'

// In the CARD_REGISTRY array:
{
  id: 'my-tool-status',
  title: 'My Tool Status',
  component: MyToolStatus,
  category: 'ecosystem',
  tags: ['my-tool', 'monitoring'],
  defaultEnabled: false,  // false until battle-tested
},
```

### 6. Add i18n Keys

Add translation strings to `web/src/locales/en/cards.json`:

```json
{
  "myTool": {
    "title": "My Tool Status",
    "version": "Version {{version}}"
  }
}
```

### 7. Write Tests

Add a test file at `web/src/components/cards/my_tool_status/__tests__/MyToolStatus.test.tsx`. See existing card tests (e.g., `ArgoCDApplications.test.tsx`) for the pattern.

For the Go handler, add `pkg/api/handlers/my_tool_handler_test.go` using `testify/mock`.

### 8. Validate

```bash
# Backend
go build ./...
go test ./pkg/api/handlers/ -run MyTool -count=1

# Frontend (CI validates on PR — don't run locally)
# cd web && npm run build && npm run lint
```

---

## Card Development Checklist

- [ ] Go handler created and registered in `server.go`
- [ ] Demo mode check at top of handler (`if isDemoMode(c) { ... }`)
- [ ] Cache hook created using `createCachedHook` or `useCache`
- [ ] Card component wires `isRefreshing` and `isDemoData` to `useCardLoadingState`
- [ ] Card registered in `cardRegistry.ts`
- [ ] i18n keys added to `locales/en/cards.json`
- [ ] Demo data returns realistic values
- [ ] No raw hex colors, no hardcoded secrets, no magic numbers
- [ ] Array safety: `(data || []).map(...)` before any `.map`/`.filter`
- [ ] Tests written for both Go handler and React component
- [ ] PR title uses correct format: `✨ feat: add <CardName> card`

---

## Finding Your First Issue

Look for issues labeled [`good-first-issue`](https://github.com/kubestellar/console/issues?q=is%3Aopen+label%3Agood-first-issue) in the console repo.

Card-specific good-first-issue patterns:
- **Add demo data** to an existing card that shows empty state
- **Add a missing i18n key** to an existing card
- **Write a test** for an existing card that lacks coverage
- **Add a new card** for a CNCF project you use

## Getting Help

| Channel | For |
|---------|-----|
| [CNCF Slack #kubestellar](https://slack.cncf.io/) | General questions |
| [GitHub Discussions](https://github.com/kubestellar/console/discussions) | Architecture questions |
| GitHub issue comments | PR-specific questions |

---

*Card Contribution Guide · Last updated June 2026 · KubeStellar Console community*
