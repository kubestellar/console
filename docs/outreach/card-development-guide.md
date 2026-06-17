# Card Development Quick Start

This guide is for contributors who want to add a new CNCF project card quickly and safely.

> **Important:** New third-party CNCF project cards belong in the [console-marketplace](https://github.com/kubestellar/console-marketplace), not in this repository. Use this guide to learn the console card patterns and to contribute in the right place.

## 30-minute quick start

### 0-5 minutes — choose the scope

- Pick one project and one card outcome
- Write down the API or demo data shape
- Confirm whether the card can use a pure `createCachedHook` wrapper or needs a custom hook

### 5-15 minutes — scaffold the data hook

Use `createCachedHook` for simple cache-backed hooks with no parameters or post-processing.

```tsx
import { createCachedHook } from '@/lib/cache'

interface FooStatus {
  healthy: boolean
  items: string[]
}

const INITIAL_FOO: FooStatus = { healthy: false, items: [] }
const DEMO_FOO: FooStatus = { healthy: true, items: ['demo-item'] }

async function fetchFoo(): Promise<FooStatus> {
  const response = await fetch('/api/foo/status')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const useCachedFoo = createCachedHook<FooStatus>({
  key: 'foo-status',
  initialData: INITIAL_FOO,
  demoData: DEMO_FOO,
  fetcher: fetchFoo,
})
```

Use a handwritten hook instead when you need parameters, aggregation, or extra derived fields.

### 15-25 minutes — wire the card UI

- Use the cache-backed hook
- Pass loading state through the standard card loading helpers
- Reuse semantic UI primitives and existing card layout patterns
- Add demo-safe empty and error states

### 25-30 minutes — verify and package the contribution

- Review the visual checklist
- Add or update the visual test
- Keep the PR focused on one card or one hook path

## Best practices

- **Always use `useCache` or `useCached*` hooks**
- Guard array operations: use `(data || []).map(...)`, `(data || []).filter(...)`, `(data || []).join(...)`
- Use semantic Tailwind classes such as `bg-card`, `text-foreground`, and `border-border`
- Prefer existing UI primitives before adding new component patterns
- Make demo data realistic enough for screenshots and docs

## Visual test requirements

Any UI-facing card change should include Playwright visual coverage:

- Put the test in `web/e2e/visual/`
- Use `setupDemoMode` from `web/e2e/helpers/setup.ts`
- Wait for content with locators, not sleeps
- Capture snapshots with `expect(page).toHaveScreenshot('card-name.png')`

Minimum checklist:

- [ ] Card renders with live or demo data
- [ ] Loading and empty states are intentional
- [ ] No console errors during render
- [ ] Snapshot baseline is updated when UI changes

## Review checklist for card contributors

- [ ] Hook follows cache-first pattern
- [ ] Demo data exists
- [ ] Array operations are guarded
- [ ] User-facing strings use `t()`
- [ ] Styling uses semantic Tailwind tokens
- [ ] Visual test coverage exists for visible changes

## Where to ask for help

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [docs/COMMUNITY.md](../COMMUNITY.md)
- CNCF Slack `#kubestellar-dev`

---
Last updated: June 2026
