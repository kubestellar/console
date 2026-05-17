import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

interface DashboardPagePropsCapture {
  getStatValue?: (blockId: string) => { value: unknown }
}

const dashboardPageProps: { current: DashboardPagePropsCapture | null } = { current: null }

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
  DashboardPage: (props: { title: string; subtitle?: string; children?: React.ReactNode }) => {
    dashboardPageProps.current = props
    const { title, subtitle, children } = props
    return (
      <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
    )
  },
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false,
    lastUpdated: null, refetch: vi.fn(), error: null,
  }),
  useGPUNodes: () => ({ nodes: [] }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true, customFilter: '',
    filterByCluster: (items: unknown[]) => items,
  }),
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllClusters: vi.fn(), drillToAllNodes: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Cost } from './Cost'

describe('Cost Component', () => {
  const renderCost = () => {
    dashboardPageProps.current = null
    return render(
      <MemoryRouter>
        <Cost />
      </MemoryRouter>
    )
  }

  it('renders without crashing', () => {
    expect(() => renderCost()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderCost()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getAllByText(/cost/i).length).toBeGreaterThan(0)
  })

  it('passes a subtitle to DashboardPage', () => {
    renderCost()
    const page = screen.getByTestId('dashboard-page')
    expect(page.getAttribute('data-subtitle')).toBeTruthy()
  })

  it('shows a dash for total cost when no clusters are connected', () => {
    renderCost()
    const props = dashboardPageProps.current
    expect(props).toBeTruthy()

    const getStatValue = props?.getStatValue
    if (!getStatValue) {
      throw new Error('Expected getStatValue to be passed to DashboardPage')
    }
    expect(getStatValue('total_cost').value).toBe('-')
  })
})
