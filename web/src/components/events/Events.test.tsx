import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  DashboardPage: ({ title, subtitle, children, beforeCards }: { title: string; subtitle?: string; children?: React.ReactNode; beforeCards?: React.ReactNode }) => (
    <div data-testid="dashboard-page" data-title={title} data-subtitle={subtitle}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {beforeCards}
      {children}
    </div>
  ),
}))

const mockUseCachedEvents = vi.fn(() => ({
  events: [], isLoading: false, isRefreshing: false, lastRefresh: null, refetch: vi.fn(),
  isFailed: false, consecutiveFailures: 0, isDemoFallback: false, error: null,
}))
const mockFilterBySeverity = vi.fn((items: unknown[]) => items)

vi.mock('../../hooks/useCachedData', () => ({
  useCachedEvents: () => mockUseCachedEvents(),
}))

vi.mock('../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => ({
    selectedClusters: [], isAllClustersSelected: true,
    customFilter: '', filterByCluster: (items: unknown[]) => items,
    filterBySeverity: mockFilterBySeverity,
  }),
}))

vi.mock('../../hooks/useDrillDown', () => ({
  useDrillDownActions: () => ({
    drillToAllEvents: vi.fn(),
  }),
}))

vi.mock('../../hooks/useUniversalStats', () => ({
  useUniversalStats: () => ({ getStatValue: () => ({ value: 0 }) }),
  createMergedStatValueGetter: () => () => ({ value: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

import { Events } from './Events'

describe('Events Component', () => {
  beforeEach(() => {
    mockUseCachedEvents.mockReset()
    mockFilterBySeverity.mockReset()
    mockFilterBySeverity.mockImplementation((items: unknown[]) => items)
    mockUseCachedEvents.mockReturnValue({
      events: [], isLoading: false, isRefreshing: false, lastRefresh: null, refetch: vi.fn(),
      isFailed: false, consecutiveFailures: 0, isDemoFallback: false, error: null,
    })
  })

  const renderEvents = () =>
    render(
      <MemoryRouter>
        <Events />
      </MemoryRouter>
    )

  it('renders without crashing', () => {
    expect(() => renderEvents()).not.toThrow()
  })

  it('renders the DashboardPage with correct title', () => {
    renderEvents()
    expect(screen.getByTestId('dashboard-page')).toBeTruthy()
    expect(screen.getByText('common.events')).toBeTruthy()
  })

  it('renders the overview tab by default', () => {
    renderEvents()
    expect(screen.getByText('events.tabs.overview')).toBeTruthy()
    expect(screen.getByText('events.tabs.timeline')).toBeTruthy()
    expect(screen.getByText('events.tabs.allEvents')).toBeTruthy()
  })

  it('renders stat summary cards', () => {
    renderEvents()
    expect(screen.getAllByText('events.stats.total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('events.stats.warnings').length).toBeGreaterThan(0)
  })

  it('clears cached stats when all events are removed', async () => {
    const liveEvents = [
      { type: 'Warning', reason: 'Failed', message: 'warn', object: 'pod-a', namespace: 'default', cluster: 'cluster-a', lastSeen: '2026-05-09T14:00:00Z' },
      { type: 'Normal', reason: 'Scheduled', message: 'ok', object: 'pod-b', namespace: 'default', cluster: 'cluster-a', lastSeen: '2026-05-09T14:05:00Z' },
    ]
    const getAllEventsTab = () => screen.getByRole('button', { name: /events\.tabs\.allEvents/i })

    mockUseCachedEvents.mockReturnValueOnce({
      events: liveEvents,
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      error: null,
    })

    const { rerender } = renderEvents()

    await waitFor(() => {
      expect(getAllEventsTab().textContent).toContain('2')
    })

    mockUseCachedEvents.mockReturnValue({
      events: [],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      error: null,
    })

    rerender(
      <MemoryRouter>
        <Events />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(getAllEventsTab().textContent).toContain('0')
      expect(getAllEventsTab().textContent).not.toContain('2')
    })
  })

  it('keeps event stats aligned with the rendered list when severity filters hide info events', async () => {
    mockUseCachedEvents.mockReturnValue({
      events: [
        { type: 'Normal', reason: 'Scheduled', message: 'scheduled', object: 'pod-a', namespace: 'default', cluster: 'cluster-a', lastSeen: '2026-05-09T14:00:00Z' },
        { type: 'Normal', reason: 'Started', message: 'started', object: 'pod-b', namespace: 'default', cluster: 'cluster-a', lastSeen: '2026-05-09T14:05:00Z' },
      ],
      isLoading: false,
      isRefreshing: false,
      lastRefresh: null,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      isDemoFallback: false,
      error: null,
    })
    mockFilterBySeverity.mockReturnValue([])

    renderEvents()

    const allEventsTab = screen.getByRole('button', { name: /events\.tabs\.allEvents/i })
    await waitFor(() => {
      expect(allEventsTab.textContent).toContain('0')
    })

    fireEvent.click(allEventsTab)

    expect(screen.getByText('events.empty.noEventsFound')).toBeTruthy()
  })
})
