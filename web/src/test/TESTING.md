# Testing Guide

KubeStellar Console maintains **91%+ code coverage**. Every new component, hook, and utility must ship with tests.

## Quick Start

```bash
cd web

npm test                  # run all tests (watch mode)
npx vitest run            # single run, no watch
npm run test:coverage     # run with coverage report
npm run test:ui           # interactive Vitest UI
```

## Stack

| Tool | Purpose |
|------|---------|
| [Vitest](https://vitest.dev/) | Test runner (configured in `vite.config.ts`) |
| [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro) | Component rendering and queries |
| [@testing-library/jest-dom](https://github.com/testing-library/jest-dom) | DOM assertions (`toBeInTheDocument`, etc.) |
| [jsdom](https://github.com/jsdom/jsdom) | Browser environment for tests |

Global setup lives in `web/src/test/setup.ts` — it mocks `react-i18next`, `localStorage`, `IntersectionObserver`, `ResizeObserver`, and agent fetch wrappers so you don't have to.

## File Conventions

Tests go in a `__tests__/` directory alongside the source:

```
src/
  hooks/
    useCachedPods.ts
    __tests__/
      useCachedPods.test.ts      ← hook test
  components/
    cards/
      ResourceUsage.tsx
      __tests__/
        ResourceUsage.test.tsx   ← component test
  lib/
    formatStats.ts
    __tests__/
      formatStats.test.ts        ← utility test
```

Naming: `<SourceFile>.test.ts` (pure logic) or `<SourceFile>.test.tsx` (anything that renders JSX).

## Writing a Utility Test

Pure functions are the simplest to test — no mocking needed.

```ts
// src/lib/__tests__/formatStats.test.ts
import { describe, it, expect } from 'vitest'
import { formatStat } from '../formatStats'

describe('formatStat', () => {
  it('returns dash for undefined', () => {
    expect(formatStat(undefined)).toBe('-')
  })

  it('formats large numbers with K suffix', () => {
    expect(formatStat(15000)).toBe('15.0K')
  })

  it('appends suffix', () => {
    expect(formatStat(50, { suffix: '%' })).toBe('50%')
  })
})
```

## Writing a Hook Test

Hooks use `renderHook` from Testing Library. Mock dependencies with `vi.mock()` **before** the import.

```ts
// src/hooks/__tests__/useCachedCloudCustodian.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock dependencies BEFORE importing the hook
const mockUseCache = vi.fn()
vi.mock('../../lib/cache', () => ({
  useCache: (args: Record<string, unknown>) => mockUseCache(args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  // ... export every named export the module provides
}))

// Import AFTER vi.mock() calls
import { useCachedCloudCustodian } from '../useCachedCloudCustodian'

describe('useCachedCloudCustodian', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCache.mockReturnValue({
      data: { health: 'not-installed', policies: [] },
      isLoading: false,
      isDemoFallback: false,
      error: null,
    })
  })

  it('returns data from cache', () => {
    const { result } = renderHook(() => useCachedCloudCustodian())
    expect(result.current.data.health).toBe('not-installed')
  })

  it('returns isDemoFallback from cache result', () => {
    mockUseCache.mockReturnValue({
      data: { health: 'ok' },
      isDemoFallback: true,
    })
    const { result } = renderHook(() => useCachedCloudCustodian())
    expect(result.current.isDemoFallback).toBe(true)
  })
})
```

**Key pattern**: `vi.mock()` calls are hoisted to the top of the file by Vitest, so declare them before your import of the module under test.

## Writing a Component Test

Components use `render` and `screen` from Testing Library. Mock child components and hooks.

```tsx
// src/components/cards/__tests__/DeploymentRiskScore.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeploymentRiskScore } from '../DeploymentRiskScore'

// Mock hooks the component depends on
const mockUseArgoCDApplications = vi.fn()
vi.mock('../../../hooks/useArgoCD', () => ({
  useArgoCDApplications: () => mockUseArgoCDApplications(),
}))

const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

// Mock shared UI components with simple stubs
vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: ({ type }: { type?: string }) => (
    <div data-testid="card-skeleton" data-type={type} />
  ),
  CardEmptyState: ({ title }: { title?: string }) => (
    <div data-testid="empty-state"><span>{title}</span></div>
  ),
}))

// Helper to build test data
function makeArgoApp(overrides: Record<string, unknown> = {}) {
  return {
    name: 'app-1',
    namespace: 'default',
    syncStatus: 'Synced',
    healthStatus: 'Healthy',
    ...overrides,
  }
}

describe('DeploymentRiskScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCardLoadingState.mockReturnValue({ shouldRender: true })
    mockUseArgoCDApplications.mockReturnValue({ apps: [], isLoading: false })
  })

  it('renders empty state when no apps', () => {
    render(<DeploymentRiskScore />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('renders skeleton while loading', () => {
    mockUseArgoCDApplications.mockReturnValue({ apps: [], isLoading: true })
    mockUseCardLoadingState.mockReturnValue({ shouldRender: false })
    render(<DeploymentRiskScore />)
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument()
  })

  it('renders risk score with apps', () => {
    mockUseArgoCDApplications.mockReturnValue({
      apps: [makeArgoApp()],
      isLoading: false,
    })
    render(<DeploymentRiskScore />)
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument()
  })
})
```

## Common Mock Patterns

### Mocking `fetch`

```ts
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ items: [] }),
}))
```

### Mocking `useCardLoadingState`

Every card component calls this. Mock it to control rendering:

```ts
const mockUseCardLoadingState = vi.fn()
vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

// In beforeEach:
mockUseCardLoadingState.mockReturnValue({ shouldRender: true })
```

### Mocking `useDemoMode`

```ts
const mockIsDemoMode = vi.fn(() => false)
vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: mockIsDemoMode() }),
  isDemoModeForced: () => false,
  canToggleDemoMode: () => true,
  isNetlifyDeployment: () => false,
  isDemoToken: () => false,
  hasRealToken: () => true,
  setDemoToken: vi.fn(),
  getDemoMode: () => false,
  setGlobalDemoMode: vi.fn(),
}))
```

## CI Workflows

Three workflows enforce test quality on PRs:

### 1. Coverage Gate (`coverage-gate.yml`) — **blocks merge**

Runs on every PR that touches `web/src/`. Fails if total project coverage drops below **91%**.

```
PR opened → vitest --coverage → check coverage-summary.json → pass/fail
```

### 2. Test Coverage Check (`test-coverage-check.yml`) — **informational**

Detects new hooks/components without corresponding test files. Posts a PR comment listing gaps and adds the `needs-tests` label. Does **not** block merge.

### 3. Auto Test Generator (`auto-test-gen.yml`) — **informational**

Detects new components/hooks without tests and can auto-generate stub test files.

## Adding Tests to Coverage

The coverage config in `vite.config.ts` controls which directories are measured:

```ts
coverage: {
  provider: 'v8',
  include: [
    'src/hooks/**',
    'src/lib/**',
    'src/contexts/**',
    'src/components/charts/**',
    'src/components/dashboard/customizer/**',
    'src/components/dashboard/shared/cardCatalog.ts',
    'src/components/dashboard/shared/CardPreview.tsx',
  ],
  exclude: [
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    '**/demo*Data*.{ts,tsx}',
    'src/test/',
    // ... see vite.config.ts for full list
  ],
}
```

**To add a new directory to coverage tracking:**

1. Add the path to the `include` array in `vite.config.ts`
2. Write tests for the files in that directory
3. Run `npm run test:coverage` locally to verify the threshold holds
4. The Coverage Gate workflow will enforce the 91% threshold on your PR

## Checklist for New Code

- [ ] New hook → `src/hooks/__tests__/<hookName>.test.ts`
- [ ] New component → `src/components/<area>/__tests__/<ComponentName>.test.tsx`
- [ ] New utility → `src/lib/__tests__/<utilName>.test.ts`
- [ ] New context → `src/contexts/__tests__/<ContextName>.test.tsx`
- [ ] Mocks use `vi.mock()` before the import of the module under test
- [ ] `beforeEach` calls `vi.clearAllMocks()`
- [ ] Tests cover: happy path, empty/null data, loading state, error state
- [ ] Run `npm run test:coverage` — total stays above 91%
