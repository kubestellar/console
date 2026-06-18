# Card Contribution Guide

Welcome to the KubeStellar Console card development community! This guide walks you through creating your first card component.

## What is a Card?

A card is a reusable dashboard component that displays cluster data. Examples include Pod counts, node status, ArgoCD sync progress, and GPU availability.

## Card Architecture Pattern

Every card follows this pattern:

```
Hook → Component → Registry → Demo Data
```

### 1. Create a Data Hook (`useCachedXxx`)

The hook fetches and caches data. Location: `web/src/hooks/useCachedData.ts`

```typescript
// Example: useCachedPodCount.ts
import { useCache } from '@/lib/cache'

export const useCachedPodCount = () => {
  return useCache({
    key: 'pod-count',
    initialData: 0,
    fetcher: async () => {
      const resp = await fetch('/api/pods/count')
      if (!resp.ok) throw new Error('Failed to fetch pod count')
      return resp.json()
    },
    demoData: 42,
  })
}
```

### 2. Create a Card Component

Location: `web/src/components/cards/`

```typescript
// PodCountCard.tsx
import { useCachedPodCount } from '@/hooks/useCachedData'
import { useCardLoadingState } from '@/hooks/useCardLoadingState'
import { Card } from '@/components/ui/Card'

export function PodCountCard() {
  const { data, isLoading, isRefreshing, isDemoData, isFailed } = useCachedPodCount()

  useCardLoadingState({
    isLoading,
    isRefreshing,
    isDemoData,
    hasAnyData: data > 0,
    isFailed,
  })

  return (
    <Card>
      <div className="text-3xl font-bold">{data}</div>
      <p className="text-muted-foreground">Pods Running</p>
    </Card>
  )
}
```

### 3. Register in Card Registry

Location: `web/src/lib/cardRegistry.ts`

Add your card to the registry with metadata:

```typescript
export const CARD_REGISTRY: CardDefinition[] = [
  // ... existing cards ...
  {
    id: 'pod-count',
    name: 'Pod Count',
    description: 'Number of running pods',
    component: PodCountCard,
    category: 'resources',
  },
]
```

### 4. Add Demo Data

Demo data is automatically served when users have no API keys. Use realistic, representative data.

## Testing Your Card

### Local Testing

1. Start the console: `./start-dev.sh` or `./startup-oauth.sh`
2. Navigate to the dashboard
3. Your card should appear automatically if registered
4. Test demo mode (no API keys configured)
5. Test with live cluster data (if available)

### Visual Testing

Create a Playwright visual test in `web/e2e/visual/`:

```typescript
// app-pod-count-visual.spec.ts
import { setupDemoMode } from '../helpers/setup'
import { expect, test } from '../app-visual.config'

test('pod count card renders correctly', async ({ page, browser }) => {
  const { app } = await setupDemoMode({ browser })
  await page.goto(app)
  
  await expect(page.getByTestId('pod-count-card')).toBeVisible()
  await expect(page).toHaveScreenshot('pod-count-card.png')
})
```

Run: `cd web && npm run test:visual`

## Common Patterns

### Array Safety
Always guard arrays before calling `.map()` or `.join()`:

```typescript
// ❌ WRONG
data.map(item => ...)

// ✅ CORRECT
(data || []).map(item => ...)
```

### No Magic Numbers
Use named constants:

```typescript
// ✅ CORRECT
const FETCH_TIMEOUT_MS = 30000
const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
```

### Translations
Always use `useTranslation()` for user-facing text:

```typescript
import { useTranslation } from 'react-i18next'

export function MyCard() {
  const { t } = useTranslation()
  return <h2>{t('cards.myCard.title')}</h2>
}
```

## Labeling for First Contributors

Issues labeled `good-first-issue` are suitable for new contributors. Card-related first issues typically involve:

- Adding a new card for an existing API endpoint
- Enhancing demo data for an existing card
- Writing visual tests for existing cards
- Improving card documentation

## Getting Help

- **Questions?** Check the [CONTRIBUTING.md](../../CONTRIBUTING.md) file
- **Discord/Slack:** Post in `#kubestellar` channel
- **Code review:** Tag `@kubestellar/console-maintainers` in PRs

## Next Steps

1. Find an open issue labeled `good-first-issue`
2. Follow this pattern to create your card
3. Write tests (Playwright visual tests)
4. Submit a PR with the title format: `[feature] add {card-name} card`
5. Ensure commit message is signed: `git commit -s -m "..."`

Welcome to the team! 🚀
