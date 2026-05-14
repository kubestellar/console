import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockUseServices, mockT } = vi.hoisted(() => ({
  mockUseServices: vi.fn(),
  mockT: vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'network.errors.loadFailedTitle': 'Unable to load network data',
      'network.errors.refreshFailedTitle': 'Unable to refresh network data — showing cached data',
      'network.errors.loadingDescription': 'Please check your connection and try again.',
      'network.errors.permissionsDescription': 'Please check your connection or permissions, then try again.',
    }
    return translations[key] ?? key
  }),
}))

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
  useServices: () => mockUseServices(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
  }),
}))

vi.mock('../../lib/unified/demo', () => ({
  useIsModeSwitching: () => false,
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToService: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT, i18n: { language: 'en' } }),
}))

import { Network } from './Network'

describe('Network Component', () => {
  const renderNetwork = () =>
    render(
      <MemoryRouter>
        <Network />
      </MemoryRouter>
    )

  beforeEach(() => {
    mockUseServices.mockReturnValue({
      services: [],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      error: null,
      isFailed: false,
    })
  })

  it('renders without crashing', () => {
    expect(() => renderNetwork()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderNetwork()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getAllByText(/network/i).length).toBeGreaterThan(0)
  })

  it('passes a subtitle to DashboardPage', () => {
    renderNetwork()
    const page = screen.getByTestId('dashboard-page')
    expect(page.getAttribute('data-subtitle')).toBeTruthy()
  })

  it('shows a permissions-friendly message for unauthorized errors', () => {
    mockUseServices.mockReturnValue({
      services: [],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      error: 'API error: 401',
      isFailed: true,
    })

    renderNetwork()

    expect(screen.getByText('Unable to load network data')).toBeTruthy()
    expect(screen.getByText('Please check your connection or permissions, then try again.')).toBeTruthy()
    expect(screen.queryByText('API error: 401')).toBeNull()
  })

  it('shows a generic message for non-auth network errors', () => {
    mockUseServices.mockReturnValue({
      services: [],
      isLoading: false,
      isRefreshing: false,
      lastUpdated: null,
      refetch: vi.fn(),
      error: 'API error: 500',
      isFailed: true,
    })

    renderNetwork()

    expect(screen.getByText('Unable to load network data')).toBeTruthy()
    expect(screen.getByText('Please check your connection and try again.')).toBeTruthy()
    expect(screen.queryByText('API error: 500')).toBeNull()
  })
})
