# Contributing a Dashboard Card

This guide is for **CNCF project maintainers and cloud-native developers** who want to add a monitoring card for their project to the [KubeStellar Console Marketplace](https://github.com/kubestellar/console-marketplace).

Cards in the marketplace are loaded on-demand, so they don't bloat the core bundle for users who don't need them. Adding a card for your project is a lightweight, high-visibility way to surface your project's health metrics inside KubeStellar Console.

> **New card components belong in [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace), not in this repo.**  
> PRs that add card components to `web/src/components/cards/` in this repo will be redirected to the marketplace.

---

## Prerequisites

- Node.js 20+ and Go 1.26.4+ installed
- A running KubeStellar Console (see [README.md](../README.md) — `./start-dev.sh` is the fastest path)
- Basic familiarity with React and TypeScript

---

## Step 1 — Fork and clone console-marketplace

```bash
git clone https://github.com/<your-fork>/console-marketplace.git
cd console-marketplace
```

Create a branch for your card:

```bash
git checkout -b feat/add-<your-project>-card
```

---

## Step 2 — Scaffold your card directory

Each card lives in its own directory under `cards/`:

```
cards/
  my-project/
    index.tsx          ← main card component
    useCachedMyProject.ts  ← data hook
    demo.ts            ← demo data
    MyProject.test.tsx ← unit tests (optional but encouraged)
```

Copy the `_template/` directory to get started:

```bash
cp -r _template/ cards/my-project
```

---

## Step 3 — Write the data hook with `createCachedHook`

All card data fetching must go through the cache layer. Use the `createCachedHook` factory for simple hooks — it eliminates ~200 lines of boilerplate.

```typescript
// cards/my-project/useCachedMyProject.ts
import { createCachedHook } from '@kubestellar/console/lib/cache'

const FETCH_DEFAULT_TIMEOUT_MS = 10_000

export interface MyProjectStatus {
  healthy: boolean
  version: string
  componentsReady: number
  componentsTotal: number
}

const INITIAL: MyProjectStatus = {
  healthy: false,
  version: '',
  componentsReady: 0,
  componentsTotal: 0,
}

const DEMO: MyProjectStatus = {
  healthy: true,
  version: 'v1.2.3',
  componentsReady: 5,
  componentsTotal: 5,
}

async function fetchMyProject(): Promise<MyProjectStatus> {
  const resp = await fetch('/api/my-project/status', {
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

export const useCachedMyProject = createCachedHook<MyProjectStatus>({
  key: 'my-project-status',
  initialData: INITIAL,
  demoData: DEMO,
  fetcher: fetchMyProject,
})
```

### When NOT to use `createCachedHook`

Write the hook by hand if:
- The hook needs parameters (e.g., cluster name, namespace)
- The hook post-processes data after fetch (aggregation, filtering)
- The hook returns extra fields beyond the standard result shape
- The hook composes multiple `useCache` calls

See `web/src/hooks/useCachedData.ts` in the main console repo for the full manual hook pattern.

---

## Step 4 — Write the card component

The card component receives no props — it fetches its own data via the hook.

```tsx
// cards/my-project/index.tsx
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useCardLoadingState } from '@kubestellar/console/hooks/useCardLoadingState'
import { useCachedMyProject } from './useCachedMyProject'

export function MyProjectCard() {
  const { t } = useTranslation()

  const {
    data,
    isLoading,
    isRefreshing,
    isDemoData,
    isFailed,
    consecutiveFailures,
  } = useCachedMyProject()

  // Required: report loading/demo/failure state to the card wrapper
  useCardLoadingState({
    isLoading,
    isRefreshing,   // drives the refresh icon animation
    isDemoData,     // drives the Demo badge + yellow outline
    hasAnyData: data.componentsTotal > 0,
    isFailed,
    consecutiveFailures,
  })

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className={data.healthy ? 'text-green-400' : 'text-red-400'}>
          {data.healthy ? '✓' : '✗'}
        </span>
        <span className="text-foreground font-medium">
          {t('myProject.status')}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        {data.componentsReady}/{data.componentsTotal} components ready
      </p>
    </div>
  )
}
```

### Critical rules

| Rule | Why |
|------|-----|
| Always pass `isDemoData` to `useCardLoadingState` | Without it, cards show demo data without the Demo badge/yellow outline |
| Always pass `isRefreshing` | Without it, there is no refresh icon animation |
| Never use raw hex colors — use Tailwind semantic classes (`text-foreground`, `bg-card`, etc.) | The console supports 15+ themes; raw colors break in light mode |
| Guard arrays with `(data.items \|\| []).map(...)` | API responses can be `undefined` when endpoints fail |
| Use `t()` for all user-facing strings | The console supports 10 locales |

---

## Step 5 — Add demo data

Every card must work without a live cluster — the console is demoed at [console.kubestellar.io](https://console.kubestellar.io) with no backend.

If your demo data needs dynamic values (e.g., fresh timestamps), use `getDemoData` instead of `demoData` in the hook factory:

```typescript
export const useCachedMyProject = createCachedHook<MyProjectStatus>({
  key: 'my-project-status',
  initialData: INITIAL,
  getDemoData: () => ({
    healthy: true,
    version: 'v1.2.3',
    componentsReady: 5,
    componentsTotal: 5,
    lastUpdated: Date.now(),  // fresh on each demo render
  }),
  fetcher: fetchMyProject,
})
```

---

## Step 6 — Write a Playwright visual test

Visual tests live in `e2e/visual/` and use demo mode so no cluster is required.

```typescript
// e2e/visual/app-my-project-visual.spec.ts
import { test, expect } from '@playwright/test'
import { setupDemoMode } from '../helpers/setup'

test('MyProject card renders in demo mode', async ({ page }) => {
  await setupDemoMode(page)
  await page.goto('/dashboard')

  // Wait for the card to appear — use getByTestId or a stable locator
  await expect(page.getByTestId('my-project-card')).toBeVisible({ timeout: 10_000 })

  await expect(page).toHaveScreenshot('my-project-card.png')
})
```

Generate baselines:

```bash
cd web && npm run test:visual:update
```

Verify they pass:

```bash
cd web && npm run test:visual
```

Commit **both** the test file and the generated snapshot baselines.

---

## Step 7 — Open your PR

1. Commit your changes with a DCO sign-off:

   ```bash
   git commit -s -m "✨ feat: add MyProject dashboard card"
   ```

2. Push and open a PR against `kubestellar/console-marketplace:main`

3. PR title format: `✨ feat: add <YourProject> card`

4. PR checklist:
   - [ ] Card renders in demo mode (no cluster required)
   - [ ] `isDemoData` and `isRefreshing` passed to `useCardLoadingState`
   - [ ] All arrays guarded with `(data.x || []).map(...)`
   - [ ] No raw hex colors — Tailwind semantic classes only
   - [ ] All user-facing strings use `t()` from `useTranslation()`
   - [ ] Playwright visual test + snapshot baselines committed
   - [ ] Demo data returns plausible values (not all zeros)

---

## Getting help

- Join [CNCF Slack](https://slack.cncf.io/) → **#kubestellar** channel
- Open a [GitHub Discussion](https://github.com/kubestellar/console/discussions) with your question
- Tag your issue or PR with `console-marketplace` and `good first issue` for maintainer attention

---

## Example cards to learn from

| Card | Hook | What it demonstrates |
|------|------|----------------------|
| `ArgoCDHealth.tsx` | `useCachedArgoCD` | Status badge, multi-cluster aggregation |
| `KyvernoCompliance.tsx` | `useCachedKyverno` | Policy compliance table, severity colors |
| `FalcoAlerts.tsx` | `useCachedFalco` | Real-time alert feed, pagination |
| `ThanosStatus.tsx` | `useCachedThanosStatus` | `createCachedHook` factory (simplest possible card) |

All of these live in `web/src/components/cards/` in the main [kubestellar/console](https://github.com/kubestellar/console) repo — read them for patterns before writing your own.
