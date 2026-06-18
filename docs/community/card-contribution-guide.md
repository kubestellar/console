# Contributing a Dashboard Card to KubeStellar Console

This guide walks you through adding a new ecosystem card to the KubeStellar Console dashboard.

## Before You Start

- Read [CONTRIBUTING.md](../../CONTRIBUTING.md) for general contribution guidelines and DCO sign-off requirements
- Join [CNCF Slack](https://slack.cncf.io/) → `#kubestellar` and introduce yourself
- **New CNCF project cards** belong in [console-marketplace](https://github.com/kubestellar/console-marketplace). This guide covers the card authoring pattern — the same architecture applies to both repos.

## Card Architecture Overview

Every dashboard card follows the same four-layer pattern:

```
API endpoint (Go)         →  pkg/api/handlers/<card>_handler.go
Cache hook (TypeScript)   →  web/src/hooks/useCached<Card>.ts
Card component (React)    →  web/src/components/cards/<card_slug>/
Card registry entry       →  web/src/components/cards/cardRegistry.<domain>.ts
```

All four layers must be present for a card to work correctly.

---

## Step-by-Step: Adding a New Card

### 1. Pick a Scope

A card should surface a single tool's health or status from a Kubernetes cluster. Good examples:
- "Show Flux GitOps sync status"
- "Show Volcano GPU queue depth"
- "Show Trivy vulnerability scan results"

If your card needs to call an external API (not K8s), check whether a Netlify Function is needed (see [CLAUDE.md](../../CLAUDE.md) → Netlify Functions section).

### 2. Create the Go API Handler

Create `pkg/api/handlers/<card>_handler.go`:

```go
package handlers

import (
    "github.com/gofiber/fiber/v2"
)

func HandleMyToolStatus(c *fiber.Ctx) error {
    if IsDemoMode(c) {
        return DemoResponse(c, "my-tool", getDemoMyToolStatus())
    }
    // ... real implementation using c.Locals("kubeconfig") etc.
    return c.JSON(result)
}
```

Register the route in `pkg/api/server.go`:
```go
api.Get("/my-tool/status", handlers.HandleMyToolStatus)
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

const DEMO_MY_TOOL_STATUS: MyToolStatus = {
  healthy: true,
  version: 'v1.2.3',
  podCount: 3,
}

const FETCH_TIMEOUT_MS = 10_000

async function fetchMyToolStatus(): Promise<MyToolStatus> {
  const resp = await fetch('/api/my-tool/status', {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

The hook returns `isDemoFallback` (not `isDemoData`). The card layer aliases it — see step 4.

For hooks that need parameters or post-processing, write the hook manually using `useCache` from `@/lib/cache`.

### 4. Build the Card Component

Create `web/src/components/cards/my_tool_status/`:

```
my_tool_status/
  MyToolStatus.tsx    ← main component
  demoData.ts         ← demo data constants
  index.ts            ← re-export
```

**Critical: always wire `isRefreshing` and `isDemoFallback`** into `useCardLoadingState`:

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
    isDemoFallback,
    isFailed,
    consecutiveFailures,
  } = useCachedMyToolStatus()

  useCardLoadingState({
    isLoading,
    isRefreshing,      // drives refresh animation
    isDemoData: isDemoFallback,  // drives Demo badge + yellow outline
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

Cards are registered in domain-specific registry files under `web/src/components/cards/`. Pick the file matching your card's domain:

- `cardRegistry.core.ts` — cluster health, resources, compute
- `cardRegistry.ai.ts` — AI/LLM cards
- `cardRegistry.security.ts` — security and compliance
- `cardRegistry.misc.ts` — ecosystem tools, misc

Add your component to the `components` record in the appropriate registry:

```typescript
// In the `components` record of the matching cardRegistry.<domain>.ts:
import { MyToolStatus } from './my_tool_status'

const components: Record<string, CardComponent> = {
  // ... existing entries
  my_tool_status: MyToolStatus,
}
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

Add a test file at `web/src/components/cards/my_tool_status/__tests__/MyToolStatus.test.tsx`. See existing card tests for the pattern.

For the Go handler, add `pkg/api/handlers/my_tool_handler_test.go` using `testify/mock`.

### 8. Validate

```bash
# Backend
go build ./...
go test ./pkg/api/handlers/ -run MyTool -count=1

# Frontend — CI validates on PR, don't run locally
```

---

## Card Development Checklist

- [ ] Go handler created and registered in `server.go`
- [ ] Demo mode check at top of handler (`if IsDemoMode(c) { ... }`)
- [ ] Cache hook created using `createCachedHook` or `useCache`
- [ ] Card component wires `isRefreshing` and `isDemoFallback` to `useCardLoadingState`
- [ ] Card registered in the appropriate `cardRegistry.<domain>.ts`
- [ ] i18n keys added to `locales/en/cards.json`
- [ ] Demo data returns realistic values
- [ ] No raw hex colors, no hardcoded secrets, no magic numbers
- [ ] Array safety: `(data || []).map(...)` before any `.map`/`.filter`
- [ ] Tests written for both Go handler and React component
- [ ] PR title uses correct format: `feat: add <CardName> card`

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

*Card Contribution Guide · KubeStellar Console community*
