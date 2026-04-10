/// <reference types='@testing-library/jest-dom/vitest' />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import '../../test/utils/setupMocks'

// Wait budget for async detection flows.
const ASYNC_WAIT_TIMEOUT_MS = 2000

// Controls whether getDemoMode() returns true for the current test.
// IMPORTANT: setupMocks mocks useDemoMode to always return true. We override
// that below with `vi.doMock` inside a sync import shim so tests can flip
// demo mode on/off per test case.
let demoModeFlag = false

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children, beforeCards }: { title: string; subtitle?: string; children?: React.ReactNode; beforeCards?: React.ReactNode }) => (
    <div data-testid='dashboard-page' data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {beforeCards}
      {children}
    </div>
  ),
}))

// Mutable clusters list so individual tests can exercise single vs multi
// cluster attribution (#6157).
let mockClusters: Array<{ name: string; context?: string }> = []

const stableRefetch = vi.fn()
vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: mockClusters, isRefreshing: false, refetch: stableRefetch,
  }),
  useHelmReleases: () => ({ releases: [] }),
  useOperatorSubscriptions: () => ({ subscriptions: [] }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllHelm: vi.fn(), drillToAllOperators: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('../ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

// The component uses both api.post (for detect-drift) and getDemoMode.
const apiPostMock = vi.fn()
vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => apiPostMock(...args) },
}))

// NOTE: setupMocks.ts already mocks '../../hooks/useDemoMode'. We override
// getDemoMode at runtime in beforeEach below so each test can control the
// demo-mode flag without racing vi.mock hoisting.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { GitOps } from './GitOps'
import * as useDemoModeModule from '../../hooks/useDemoMode'

describe('GitOps Component', () => {
  const renderGitOps = () =>
    render(
      <MemoryRouter>
        <GitOps />
      </MemoryRouter>
    )

  beforeEach(() => {
    demoModeFlag = false
    mockClusters = []
    apiPostMock.mockReset()
    // Override setupMocks' forced-true getDemoMode with our flag. vi.spyOn
    // replaces the export on the already-mocked module.
    vi.spyOn(useDemoModeModule, 'getDemoMode').mockImplementation(() => demoModeFlag)
    // Default: health check + detect-drift both succeed cleanly.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders without crashing', () => {
    expect(() => renderGitOps()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderGitOps()
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
    expect(screen.getByText('gitops.title')).toBeInTheDocument()
  })

  it('renders the applications section', () => {
    renderGitOps()
    expect(screen.getByText('gitops.applications')).toBeInTheDocument()
  })

  it('renders the integration info section', () => {
    renderGitOps()
    expect(screen.getByText('gitops.integrationTitle')).toBeInTheDocument()
  })

  // #6155 — in demo mode we must NOT be stuck in perpetual "checking".
  it('does not leave cards stuck in checking state in demo mode (#6155)', async () => {
    demoModeFlag = true
    renderGitOps()
    // In demo mode there is no detection pass, so "Checking..." must not
    // persist. We assert that after render the checking label is not in the
    // DOM for any of the apps.
    await waitFor(
      () => {
        expect(screen.queryByText('gitops.checking')).not.toBeInTheDocument()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
  })

  // #6156 — failed drift checks must render as a distinct error, not as
  // "synced + healthy" (false green).
  it('renders drift check failure as error state, not as synced (#6156)', async () => {
    mockClusters = [{ name: 'only', context: 'only' }]
    // health check ok, but api.post (detect-drift) throws.
    apiPostMock.mockRejectedValue(new Error('backend exploded'))
    renderGitOps()
    await waitFor(
      () => {
        // api.post must have been called for each app config.
        expect(apiPostMock).toHaveBeenCalled()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    await waitFor(
      () => {
        expect(screen.getAllByText('gitops.driftCheckFailed').length).toBeGreaterThan(0)
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    // And the error details should be surfaced in the drift details list.
    expect(screen.getAllByText(/backend exploded/).length).toBeGreaterThan(0)
  })

  // #6157 — multi-cluster attribution must not silently fall back to
  // clusters[0]. With >1 clusters and no explicit target, apps render as
  // "cluster: unknown".
  it('marks cluster as unresolved when multiple clusters exist and none is configured (#6157)', async () => {
    mockClusters = [
      { name: 'cluster-a', context: 'cluster-a' },
      { name: 'cluster-b', context: 'cluster-b' },
    ]
    apiPostMock.mockResolvedValue({ data: { drifted: false, resources: [] } })
    renderGitOps()
    await waitFor(
      () => {
        expect(screen.getAllByText('gitops.clusterUnresolved').length).toBeGreaterThan(0)
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
    // And "cluster-a" (the old clusters[0] fallback) should NOT appear as
    // an attributed cluster on any app row. It will still appear in the
    // cluster-filter <option>, so we scope the query to <span> elements.
    const attributedSpans = screen
      .queryAllByText('cluster-a')
      .filter((el) => el.tagName.toLowerCase() === 'span')
    expect(attributedSpans.length).toBe(0)
  })

  // #6158 — lastSyncTime should NOT be fabricated on render. With the
  // component rendering freshly-detected "synced" apps, we should see
  // "gitops.unknown" (via getTimeAgo with undefined), not "gitops.justNow".
  it('does not fabricate a recent lastSyncTime on render (#6158)', async () => {
    mockClusters = [{ name: 'only', context: 'only' }]
    apiPostMock.mockResolvedValue({ data: { drifted: false, resources: [] } })
    renderGitOps()
    await waitFor(
      () => {
        // "Just now" would be the old buggy behavior. Assert it never
        // appears as the lastSync value for newly-detected apps.
        expect(screen.queryByText(/justNow/)).not.toBeInTheDocument()
      },
      { timeout: ASYNC_WAIT_TIMEOUT_MS }
    )
  })
})
