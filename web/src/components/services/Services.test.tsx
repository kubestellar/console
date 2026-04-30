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

// #6423 — mock must surface `emptyState.secondaryAction` so the
// "Connect a cluster" CTA test below can assert it renders when the
// cluster list is empty. The fake DashboardPage renders a button that
// mirrors whatever secondaryAction callers pass in.
interface MockEmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
}
interface MockDashboardPageProps {
  title: string
  subtitle?: string
  emptyState?: { secondaryAction?: MockEmptyStateAction }
  children?: React.ReactNode
}
vi.mock('../../lib/dashboards/DashboardPage', () => ({
  DashboardPage: ({ title, subtitle, emptyState, children }: MockDashboardPageProps) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {emptyState?.secondaryAction && (
        <button
          type="button"
          data-testid="empty-state-secondary-action"
          onClick={emptyState.secondaryAction.onClick}
        >
          {emptyState.secondaryAction.label}
        </button>
      )}
      {children}
    </div>
  ),
}))

vi.mock('../../hooks/useMCP', () => ({
  useClusters: () => ({
    clusters: [], deduplicatedClusters: [], isLoading: false, isRefreshing: false,
    lastUpdated: null, refetch: vi.fn(), error: null,
  }),
  useServices: () => ({ services: [], error: null }),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllServices: vi.fn(), drillToAllClusters: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Services } from './Services'

describe('Services Component', () => {
  const renderServices = () =>
    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderServices()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderServices()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getByText('Services')).toBeTruthy()
  })

  it('passes the correct subtitle', () => {
    renderServices()
    expect(screen.getByText('Monitor Kubernetes services and network connectivity')).toBeTruthy()
  })

  // #6423 (Copilot review comment on Services.tsx:111) — when there are
  // no reachable clusters, the empty state must surface a "Connect a
  // cluster" secondary action so the user has a clear next step. The
  // useClusters mock above returns `clusters: [], deduplicatedClusters: []`, which produces
  // `reachableClusters.length === 0` inside the component.
  it('renders the "Connect a cluster" CTA when no reachable clusters exist', () => {
    renderServices()
    const cta = screen.getByTestId('empty-state-secondary-action')
    expect(cta).toBeTruthy()
    expect(cta.textContent).toContain('Connect a cluster')
  })
})
