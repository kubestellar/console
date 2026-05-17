import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventSummary } from '../EventSummary'
import type { ClusterEvent } from '../../../hooks/useMCP'

const mockUseCachedEvents = vi.fn()
const mockUseGlobalFilters = vi.fn()
const mockUseCardLoadingState = vi.fn()
const mockUseChartFilters = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (
      opts?.count !== undefined ? `${key}:${opts.count}` : key
    ),
  }),
}))

vi.mock('../../../hooks/useCachedData', () => ({
  useCachedEvents: (...args: unknown[]) => mockUseCachedEvents(...args),
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockUseGlobalFilters(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: (...args: unknown[]) => mockUseCardLoadingState(...args),
}))

vi.mock('../../../lib/cards/cardHooks', () => ({
  useChartFilters: (...args: unknown[]) => mockUseChartFilters(...args),
}))

vi.mock('../../ui/RefreshIndicator', () => ({
  RefreshButton: () => <button data-testid="refresh-button" />,
}))

vi.mock('../../../lib/cards/CardComponents', () => ({
  CardSkeleton: () => <div data-testid="card-skeleton" />,
}))

function makeEvent(overrides: Partial<ClusterEvent> = {}): ClusterEvent {
  return {
    type: 'Normal',
    reason: 'PodStarted',
    message: 'Pod started successfully',
    object: 'Pod/my-pod',
    namespace: 'default',
    cluster: 'prod',
    count: 1,
    lastSeen: new Date().toISOString(),
    ...overrides,
  } as ClusterEvent
}

describe('EventSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedEvents.mockReturnValue({
      events: [],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })
    mockUseGlobalFilters.mockReturnValue({
      filterByCluster: (events: ClusterEvent[]) => events,
    })
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: false,
    })
    mockUseChartFilters.mockReturnValue({
      localClusterFilter: [],
      toggleClusterFilter: vi.fn(),
      clearClusterFilter: vi.fn(),
      availableClusters: [],
      showClusterFilter: false,
      setShowClusterFilter: vi.fn(),
      clusterFilterRef: { current: null },
    })
  })

  it('renders skeleton when loading state is active', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: true,
      showEmptyState: false,
    })

    render(<EventSummary />)

    expect(screen.getByTestId('card-skeleton')).toBeTruthy()
  })

  it('renders empty state when no events are available', () => {
    mockUseCardLoadingState.mockReturnValue({
      showSkeleton: false,
      showEmptyState: true,
    })

    render(<EventSummary />)

    expect(screen.getByText('eventSummary.noEvents')).toBeTruthy()
    expect(screen.getByText('eventSummary.noEventsHint')).toBeTruthy()
  })

  it('renders error banner when the fetch failed', () => {
    mockUseCachedEvents.mockReturnValue({
      events: [],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      refetch: vi.fn(),
      isFailed: true,
      consecutiveFailures: 3,
      lastRefresh: null,
    })

    render(<EventSummary />)

    expect(screen.getByText('eventSummary.errorLoading')).toBeTruthy()
    expect(screen.getByText('eventSummary.fetchFailed:3')).toBeTruthy()
  })

  it('aggregates warning and normal events and renders top reasons', () => {
    mockUseCachedEvents.mockReturnValue({
      events: [
        makeEvent({ type: 'Warning', reason: 'ImagePullBackOff', cluster: 'prod' }),
        makeEvent({ type: 'Warning', reason: 'ImagePullBackOff', cluster: undefined }),
        makeEvent({ type: 'Normal', reason: 'PodStarted', cluster: 'prod' }),
        makeEvent({ type: 'Normal', reason: 'Scheduled', cluster: 'dev' }),
        makeEvent({ type: 'Normal', reason: 'Scheduled', cluster: 'dev' }),
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    render(<EventSummary />)

    expect(screen.getByText('eventSummary.nEvents:5')).toBeTruthy()
    expect(screen.getByText('common:common.warnings')).toBeTruthy()
    expect(screen.getByText('common:common.normal')).toBeTruthy()
    expect(screen.getByText('ImagePullBackOff')).toBeTruthy()
    expect(screen.getByText('PodStarted')).toBeTruthy()
    expect(screen.getByText('Scheduled')).toBeTruthy()
    expect(screen.queryByText('eventSummary.others')).toBeNull()
  })

  it('adds an Others row and uses event counts for totals', () => {
    mockUseCachedEvents.mockReturnValue({
      events: [
        makeEvent({ type: 'Warning', reason: 'ImagePullBackOff', count: 4 }),
        makeEvent({ type: 'Normal', reason: 'BackOff', count: 3 }),
        makeEvent({ type: 'Normal', reason: 'FailedScheduling', count: 2 }),
        makeEvent({ type: 'Normal', reason: 'Unhealthy', count: 1 }),
        makeEvent({ type: 'Normal', reason: 'FailedMount', count: 1 }),
        makeEvent({ type: 'Normal', reason: 'NodeNotReady', count: 1 }),
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    render(<EventSummary />)

    expect(screen.getByText('eventSummary.nEvents:12')).toBeTruthy()
    expect(screen.getByText('eventSummary.others')).toBeTruthy()
  })

  it('filters events by cluster through the global filter hook', () => {
    mockUseGlobalFilters.mockReturnValue({
      filterByCluster: (events: ClusterEvent[]) => events.filter(event => event.cluster === 'prod'),
    })
    mockUseCachedEvents.mockReturnValue({
      events: [
        makeEvent({ type: 'Warning', reason: 'ImagePullBackOff', cluster: 'prod' }),
        makeEvent({ type: 'Normal', reason: 'PodStarted', cluster: 'dev' }),
      ],
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      refetch: vi.fn(),
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: null,
    })

    render(<EventSummary />)

    expect(screen.getByText('eventSummary.nEvents:1')).toBeTruthy()
    expect(screen.getByText('ImagePullBackOff')).toBeTruthy()
    expect(screen.queryByText('PodStarted')).toBeNull()
  })
})
