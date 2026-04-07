# KubeStellar Console — Test Authoring Guide

> **Audience:** contributors adding or fixing tests in the `web/` directory.
> **Stack:** Vitest + React Testing Library (component tests) · Playwright (E2E tests)

---

## Table of Contents

1. [Repository layout](#1-repository-layout)
2. [Running tests locally](#2-running-tests-locally)
3. [Vitest component tests](#3-vitest-component-tests)
4. [Playwright E2E tests](#4-playwright-e2e-tests)
5. [Test data factories](#5-test-data-factories)
6. [Coverage](#6-coverage)
7. [Common pitfalls](#7-common-pitfalls)
8. [Checklist before opening a PR](#8-checklist-before-opening-a-pr)

---

## 1. Repository layout

```
web/
├── src/
│   └── components/
│       └── cards/
│           ├── MyCard.tsx
│           └── __tests__/
│               └── MyCard.test.tsx   ← Vitest test lives here
├── e2e/
│   ├── fixtures.ts                   ← shared Playwright helpers
│   ├── user-flows/                   ← user-journey specs
│   │   ├── dashboard-crud.spec.ts
│   │   ├── error-recovery.spec.ts
│   │   └── theme-settings.spec.ts
│   └── compliance/                   ← compliance / audit specs
├── docs/
│   └── TEST_AUTHORING_GUIDE.md       ← you are here
└── playwright.config.ts
```

**Naming rules**

| What | Convention | Example |
|------|-----------|---------|
| Vitest component test | `__tests__/<ComponentName>.test.tsx` | `__tests__/MyCard.test.tsx` |
| Vitest hook test | `__tests__/<hookName>.test.ts` | `__tests__/useMyHook.test.ts` |
| Playwright user-flow | `e2e/user-flows/<flow>.spec.ts` | `e2e/user-flows/dashboard-crud.spec.ts` |
| Playwright compliance | `e2e/compliance/<topic>-compliance.spec.ts` | `e2e/compliance/a11y-compliance.spec.ts` |

---

## 2. Running tests locally

```bash
cd web

# Vitest — watch mode (fast feedback during development)
npx vitest

# Vitest — single run with coverage
npx vitest run --coverage

# Vitest — run only one file
npx vitest run src/components/cards/__tests__/MyCard.test.tsx

# Playwright — all tests against the dev server
npx playwright test

# Playwright — single file, headed (see the browser)
npx playwright test e2e/user-flows/dashboard-crud.spec.ts --headed

# Playwright — specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit

# Playwright — debug mode (pause on each step)
npx playwright test --debug

# View last Playwright HTML report
npx playwright show-report
```

---

## 3. Vitest component tests

### 3.1 Minimal card test template

```tsx
// web/src/components/cards/__tests__/MyCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyCard } from '../MyCard'

// Most cards need these providers — add only what the card actually uses
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <I18nextProvider i18n={i18nInstance}>
      {children}
    </I18nextProvider>
  </MemoryRouter>
)

describe('MyCard', () => {
  it('renders without crashing', () => {
    render(<MyCard />, { wrapper })
    // The card's root element or a known piece of content must be in the DOM
    expect(screen.getByRole('region')).toBeInTheDocument()
  })

  it('displays a loading skeleton while data is pending', () => {
    render(<MyCard />, { wrapper })
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
  })

  it('shows data once loaded', async () => {
    render(<MyCard />, { wrapper })
    await waitFor(() =>
      expect(screen.getByText('Expected content')).toBeInTheDocument()
    )
  })

  it('renders the demo badge in demo mode', () => {
    render(<MyCard demo />, { wrapper })
    expect(screen.getByText(/demo/i)).toBeInTheDocument()
  })
})
```

### 3.2 Mocking API calls (MSW)

The project uses [MSW](https://mswjs.io/) for API mocking. Handlers live in
`src/mocks/handlers.ts`. To override a handler in a single test:

```ts
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

it('shows error state when API fails', async () => {
  server.use(
    http.get('/api/mcp/clusters', () =>
      HttpResponse.json({ error: 'boom' }, { status: 500 })
    )
  )

  render(<MyCard />, { wrapper })
  await waitFor(() =>
    expect(screen.getByText(/error|unavailable/i)).toBeInTheDocument()
  )
})
```

### 3.3 Testing hooks

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { useMyHook } from '../useMyHook'

it('returns data after fetching', async () => {
  const { result } = renderHook(() => useMyHook(), { wrapper })

  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.data).toBeDefined()
})
```

### 3.4 Testing card interactions

```tsx
it('opens config modal when settings icon is clicked', async () => {
  const user = userEvent.setup()
  render(<MyCard />, { wrapper })

  await user.click(screen.getByRole('button', { name: /settings/i }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
```

### 3.5 Snapshot tests (use sparingly)

Snapshots are brittle. Only use them for stable, purely presentational components
where a regression would otherwise be invisible:

```tsx
it('matches snapshot', () => {
  const { container } = render(<MyCard title="Test" />, { wrapper })
  expect(container).toMatchSnapshot()
})
```

Update snapshots intentionally: `npx vitest run -u`.

---

## 4. Playwright E2E tests

### 4.1 Import fixtures — always

```ts
// ✅ correct — use the project's custom fixtures
import { test, expect, testData } from '../fixtures'

// ❌ wrong — misses mockAPI, aiMode helpers
import { test, expect } from '@playwright/test'
```

### 4.2 Standard page setup

Copy this `beforeEach` block to every new spec file and remove the mocks you
don't need:

```ts
test.beforeEach(async ({ page, mockAPI }) => {
  // Auth
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, json: { id: '1', github_login: 'testuser', onboarded: true } })
  )

  // Data
  await mockAPI.mockClusters(testData.clusters.healthy)
  await mockAPI.mockPodIssues(testData.podIssues.none)
  await mockAPI.mockEvents(testData.events.normal)
  await mockAPI.mockLocalAgent()

  // Token
  await page.goto('/login')
  await page.evaluate(() => {
    localStorage.setItem('token', 'test-token')
    localStorage.setItem('demo-user-onboarded', 'true')
  })

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })
})
```

### 4.3 Locator strategy (priority order)

1. `getByRole` — most resilient, matches ARIA semantics
2. `getByTestId` — for elements without obvious roles
3. `getByLabel` / `getByPlaceholder` — for form elements
4. `getByText` — last resort; brittle if copy changes

```ts
// ✅ preferred
await page.getByRole('button', { name: /add card/i }).click()

// ✅ acceptable for app-specific elements
await page.getByTestId('sidebar-add-card').click()

// ❌ fragile
await page.locator('.sidebar > div:nth-child(3) > button').click()
```

### 4.4 Handling optional UI elements

Use `isVisible()` with `.catch(() => false)` and `test.skip()` for features
that may not be implemented yet:

```ts
const btn = page.getByRole('button', { name: /export/i })
const exists = await btn.isVisible().catch(() => false)
if (!exists) test.skip()
```

### 4.5 Waiting for async state

```ts
// ✅ wait for a visible element — most common pattern
await expect(page.getByTestId('dashboard-page')).toBeVisible({ timeout: 15000 })

// ✅ wait for URL change
await page.waitForURL(/\/dashboard/, { timeout: 10000 })

// ❌ avoid arbitrary sleeps — they slow suites and hide real issues
await page.waitForTimeout(3000) // only use when absolutely necessary
```

### 4.6 Demo mode vs live mode

```ts
// Force demo mode
await page.evaluate(() => localStorage.setItem('demo-mode', 'true'))

// Force live mode (clear demo flag)
await page.evaluate(() => localStorage.removeItem('demo-mode'))
```

### 4.7 Cross-browser gotchas

| Browser | Known issue | Workaround |
|---------|-------------|-----------|
| webkit  | Slower JS execution | Covered by increased `timeout: 90_000` in config |
| firefox | `input[type=file]` picker behaviour differs | Use `page.setInputFiles()` instead of clicking |
| mobile  | Touch events vs click | `page.tap()` or `locator.tap()` |

---

## 5. Test data factories

Shared test data lives in `e2e/fixtures.ts` under `testData`:

```ts
import { testData } from '../fixtures'

// Use pre-built scenarios
testData.clusters.healthy          // 2 healthy clusters
testData.clusters.withUnhealthy    // 1 healthy + 1 unhealthy
testData.clusters.empty            // []

testData.podIssues.none            // []
testData.podIssues.few             // 2 issues
testData.podIssues.many            // 15 issues

testData.events.normal             // 1 Normal event
testData.events.warnings           // 2 Warning events
testData.events.mixed              // 1 Normal + 1 Warning
```

To add a new scenario, extend `testData` in `e2e/fixtures.ts` and open a PR.

---

## 6. Coverage

### Targets

| Threshold | Effect |
|-----------|--------|
| **70%** (hard gate) | PR is **blocked** if any modified file drops below this |
| **80%** (soft target) | PR receives a warning comment but is not blocked |

### Checking coverage locally

```bash
cd web
npx vitest run --coverage
# Open coverage/index.html in your browser to see the full report
open coverage/index.html
```

### What counts toward coverage

Vitest V8 coverage tracks **statement, branch, function, and line** coverage
for all files under `src/` that are imported by at least one test.

Files that are intentionally excluded (see `vite.config.ts`):
- `src/test/**`
- `src/mocks/**`
- `**/*.d.ts`
- `**/index.ts` (barrel files)

---

## 7. Common pitfalls

### "Cannot find module" in Vitest

Make sure the component's import path is correct and that you're importing from
the same path alias (`@/`) used in production code:

```ts
// ✅
import { MyCard } from '@/components/cards/MyCard'

// ❌ relative paths break when files move
import { MyCard } from '../../../components/cards/MyCard'
```

### Test passes locally but fails in CI

Most common causes:
1. **Timing** — add `await waitFor(...)` instead of relying on synchronous assertions
2. **Viewport** — CI runners default to 1280×720; explicitly set viewport if your test is layout-sensitive
3. **Fonts / animations** — disable animations in test mode: `prefers-reduced-motion: reduce` is set globally in the Playwright config

### Flaky Playwright tests

1. Replace `waitForTimeout` with `waitFor` + a condition
2. Use `toBeVisible` with an explicit `timeout` rather than the default
3. If the test is inherently slow (e.g. 3D card), add `test.slow()` at the top:

```ts
test('renders KubeCraft 3D', async ({ page }) => {
  test.slow()  // triples the default timeout for this test only
  // ...
})
```

### "act(...) warning" in Vitest

Wrap state-changing interactions in `act()`:

```tsx
import { act } from '@testing-library/react'

await act(async () => {
  await userEvent.click(button)
})
```

---

## 8. Checklist before opening a PR

- [ ] All new/modified components have a corresponding `.test.tsx` file
- [ ] `npx vitest run` passes with no errors
- [ ] Coverage does not drop below 70% on any modified file (`npx vitest run --coverage`)
- [ ] New E2E specs import from `../fixtures` (not directly from `@playwright/test`)
- [ ] Tests use `getByRole` / `getByTestId` — no CSS selector hacks
- [ ] No `test.only` or `describe.only` left in the code (`forbidOnly` is on in CI)
- [ ] New Playwright spec added to the correct folder (`user-flows/`, `compliance/`, etc.)
- [ ] Commit is signed off: `git commit -s -m "test: ..."`
- [ ] PR title starts with `test:` prefix

---

*For questions, reach out in `#kubestellar-dev` on Slack or open a Discussion on GitHub.*