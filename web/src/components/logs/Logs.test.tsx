import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => true, getDemoMode: () => true, isNetlifyDeployment: false,
  isDemoModeForced: false, canToggleDemoMode: () => true, setDemoMode: vi.fn(),
  toggleDemoMode: vi.fn(), subscribeDemoMode: () => () => { },
  isDemoToken: () => true, hasRealToken: () => false, setDemoToken: vi.fn(),
}))
vi.mock('../../hooks/useDemoMode', () => ({
  getDemoMode: () => true, default: () => true, useDemoMode: () => true, isDemoModeForced: false,
}))
vi.mock('../../lib/analytics', () => ({
  emitNavigate: vi.fn(), emitLogin: vi.fn(), emitEvent: vi.fn(), analyticsReady: Promise.resolve(),
}))
vi.mock('../../hooks/useTokenUsage', () => ({
  useTokenUsage: () => ({ usage: { total: 0, remaining: 0, used: 0 }, isLoading: false }),
  tokenUsageTracker: { getUsage: () => ({ total: 0, remaining: 0, used: 0 }), trackRequest: vi.fn(), getSettings: () => ({ enabled: false }) },
}))

vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false, refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useCachedData', () => ({
  useCachedEvents: () => ({
    // lastRefresh: null → no lastUpdated timestamp available in test environment
    events: [], isLoading: false, isRefreshing: false, lastRefresh: null, refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true, customFilter: '',
    filterByCluster: (items: unknown[]) => items,
    filterBySeverity: (items: unknown[]) => items,
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllEvents: vi.fn(), drillToAllClusters: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Logs } from './Logs'

describe('Logs Component', () => {
  const renderLogs = () =>
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderLogs()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderLogs()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getAllByText(/logs/i).length).toBeGreaterThan(0)
  })

  it('passes a subtitle to DashboardPage', () => {
    renderLogs()
    const page = screen.getByTestId('dashboard-page')
    expect(page.getAttribute('data-subtitle')).toBeTruthy()
  })
})
