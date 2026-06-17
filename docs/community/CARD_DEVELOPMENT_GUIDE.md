# Card Development Guide for Marketplace Contributors

This guide is for contributors who want to build a new KubeStellar Console dashboard card and publish it through [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace).

> New CNCF project cards belong in **console-marketplace**, not this repo. The main console repo is the reference implementation for card patterns, caching hooks, demo data, and testing.

## What you are building

Today, a marketplace "card plugin" is a reusable card package or preset that follows the same patterns as the built-in cards in this repository:

- a React card component
- a cached data hook built on `useCache()` / `createCachedHook()`
- demo data for local testing and hosted demos
- translations for user-facing strings
- tests and screenshots when the UI changes

Use this repo as your implementation reference, then submit the finished card to **console-marketplace**.

## Before you start

1. Read [CONTRIBUTING.md](../../CONTRIBUTING.md).
2. Review the shared card criteria in [docs/components/component-criteria.md](../components/component-criteria.md).
3. Look at example hooks and cards in:
   - [`web/src/lib/cache/createCachedHook.ts`](../../web/src/lib/cache/createCachedHook.ts)
   - [`web/src/hooks/useCachedVitess.ts`](../../web/src/hooks/useCachedVitess.ts)
   - [`web/src/components/cards/CardDataContext.tsx`](../../web/src/components/cards/CardDataContext.tsx)
   - [`web/src/components/cards/ClusterCosts.tsx`](../../web/src/components/cards/ClusterCosts.tsx)
4. Check the marketplace repo for open onboarding work and starter tasks:
   - [console-marketplace good first issues](https://github.com/kubestellar/console-marketplace/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
   - [console-marketplace help wanted issues](https://github.com/kubestellar/console-marketplace/issues?q=is%3Aopen+label%3A%22help+wanted%22)

## Step 1: Pick the right target

Use **console-marketplace** when your contribution is:

- a new CNCF project integration card
- a community-maintained dashboard preset
- a theme or optional bundle that should not increase the core console bundle size

Use the main console repo only when you are:

- fixing an existing built-in card
- changing shared card infrastructure
- updating common UI primitives, cache infrastructure, or drill-down behavior

## Step 2: Choose a card pattern

Every card should match one of the established patterns from [docs/components/component-criteria.md](../components/component-criteria.md):

1. **Data list card** — lists, search, filters, pagination
2. **Metric / overview card** — summary counts, health, status
3. **Chart card** — trends, time series, comparisons
4. **Single-select card** — choose one cluster or scope, then render
5. **Specialized card** — custom UI such as embedded tools or workflows

If you are new to the codebase, start with a metric or list card.

## Step 3: Create the cached data hook

All card data fetching must go through the cache layer.

For simple hooks, prefer `createCachedHook()`:

```tsx
import { createCachedHook } from '@/lib/cache'
import { FETCH_DEFAULT_TIMEOUT_MS } from '@/lib/constants/network'

interface ExampleStatus {
  items: Array<{ name: string }>
}

const EXAMPLE_CACHE_KEY = 'example-status'
const INITIAL_DATA: ExampleStatus = { items: [] }
const DEMO_DATA: ExampleStatus = { items: [{ name: 'demo-item' }] }

async function fetchExampleStatus(): Promise<ExampleStatus> {
  const response = await fetch('/api/example/status', {
    signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

export const useCachedExample = createCachedHook<ExampleStatus>({
  key: EXAMPLE_CACHE_KEY,
  initialData: INITIAL_DATA,
  demoData: DEMO_DATA,
  fetcher: fetchExampleStatus,
})
```

Use a handwritten hook instead when you need:

- parameters like cluster or namespace
- post-processing after fetch
- extra return fields beyond the standard cached hook contract
- multiple cache sources composed together

### Required hook contract

Your hook must return the standard cached state:

- `data`
- `isLoading`
- `isRefreshing`
- `isDemoData` / `isDemoFallback`
- `isFailed`
- `consecutiveFailures`
- `lastRefresh`
- `refetch`

### Critical loading rule

Never expose demo fallback while the first load is still in progress.

```tsx
const effectiveIsDemoFallback = result.isDemoFallback && !result.isLoading
```

This prevents cards from skipping the loading skeleton and rendering demo data too early.

## Step 4: Build the card component

Use existing card primitives instead of inventing new layout patterns.

Typical building blocks:

- `CardWrapper`
- `useCardLoadingState()`
- `CardSkeleton`
- `CardEmptyState`
- `CardErrorState`
- `CardSearchInput`
- `CardControlsRow`
- `CardPaginationFooter`

Minimal card pattern:

```tsx
import { CardWrapper } from '@/components/cards/CardWrapper'
import { useCardLoadingState } from '@/components/cards/CardDataContext'

const { data, isLoading, isRefreshing, isDemoData, isFailed, consecutiveFailures } = useCachedExample()

const items = data.items || []

useCardLoadingState({
  isLoading,
  isRefreshing,
  isDemoData,
  hasAnyData: items.length > 0,
  isFailed,
  consecutiveFailures,
})
```

### Card component rules

- Always pass both `isRefreshing` and `isDemoData` into `useCardLoadingState()`.
- Guard arrays with `(data || [])` before `.map()`, `.filter()`, `.join()`, or `for...of`.
- Reuse status colors and shared UI primitives instead of inline styles.
- Use `t()` from `react-i18next` for every user-facing string.
- Keep hook ordering correct: data hooks first, then `useCardLoadingState()`.

## Step 5: Provide demo data

Demo mode is a first-class requirement. Your card should still be useful when:

- a contributor is developing locally without a live cluster
- the hosted demo needs representative data
- the live fetch fails and the card falls back safely

Keep demo data realistic enough to show the card's value:

- healthy and degraded examples
- representative names and counts
- timestamps or versions when relevant
- empty-state behavior when appropriate

## Step 6: Add translations

Do not hardcode user-facing strings in card UI.

- Add English source strings under `web/src/locales/en/`
- Use `useTranslation()` and `t('key.path')`
- Prefer descriptive keys such as `cards:myCard.title` or `cards:myCard.empty`

## Step 7: Test the card

For UI work, test before you submit:

- verify loading, empty, live-data, and demo-data states
- verify there are no console errors
- add or update Playwright coverage for visible UI changes
- use screenshots for visual changes when needed

Relevant local references:

- [docs/components/component-criteria.md](../components/component-criteria.md)
- [CLAUDE.md](../../CLAUDE.md) — testing and visual verification rules

## Step 8: Package it for console-marketplace

When you move from prototype to submission, include:

1. the card component
2. the cached hook
3. demo data
4. translations or documented string keys
5. a short README describing:
   - what the card shows
   - what API or cluster data it depends on
   - any required configuration or secrets
   - screenshots or animated previews if available

If your marketplace item depends on a backend endpoint or local agent capability, call that out clearly in the submission notes.

## Step 9: Submit to the marketplace

1. Fork [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace).
2. Create a branch for your card plugin or preset.
3. Add your card files, screenshots, and contributor-facing notes.
4. Open a PR that explains:
   - the project or ecosystem integration
   - whether the card is live-data, demo-only, or mixed
   - any setup steps reviewers need
5. Link related issues or feature requests.

If you are looking for a place to start, browse:

- [good first issues in console-marketplace](https://github.com/kubestellar/console-marketplace/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
- [help wanted issues in console-marketplace](https://github.com/kubestellar/console-marketplace/issues?q=is%3Aopen+label%3A%22help+wanted%22)

## Good first card ideas

These are intentionally scoped so a new contributor can finish them without changing core console infrastructure:

- K3s cluster summary card
- Keptn delivery health card
- Kro resource overview card
- Crossplane control plane status card
- OpenFeature flag delivery summary card
- Backstage catalog activity card
- External Secrets sync health card
- cert-manager certificate expiry overview
- Cilium network policy summary card
- Kubeflow workload health card

## Submission checklist

Before opening your marketplace PR, confirm:

- [ ] The card follows an existing card pattern
- [ ] Data fetching uses `useCache()` or `createCachedHook()`
- [ ] `isRefreshing` and `isDemoData` are wired into `useCardLoadingState()`
- [ ] Demo data exists and behaves correctly
- [ ] User-facing strings go through `t()`
- [ ] Arrays are guarded safely
- [ ] Tests or screenshots cover the main UI states
- [ ] The PR explains how reviewers can validate the card

## Need help?

- Ask in [#kubestellar-dev on CNCF Slack](https://cloud-native.slack.com/channels/kubestellar-dev)
- Open an issue in [kubestellar/console-marketplace](https://github.com/kubestellar/console-marketplace)
- Use this repo's built-in cards as examples before starting from scratch
