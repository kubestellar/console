import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { DaprStatusData } from '../demoData'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedDapr = vi.fn()
vi.mock('../../../../hooks/useCachedDapr', () => ({
  useCachedDapr: (...args: unknown[]) => mockUseCachedDapr(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

const mockUseReportCardDataState = vi.fn()
vi.mock('../../CardDataContext', () => ({
  useReportCardDataState: (opts: unknown) => mockUseReportCardDataState(opts),
}))

vi.mock('../../../../lib/formatters', () => ({
  formatTimeAgo: () => 'just now',
}))

// Import component after mocks
import { DaprStatus } from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeData(overrides: Partial<DaprStatusData> = {}): DaprStatusData {
  return {
    health: 'healthy',
    controlPlane: [
      {
        name: 'operator',
        namespace: 'dapr-system',
        status: 'running',
        replicasDesired: 1,
        replicasReady: 1,
        cluster: 'default',
      },
      {
        name: 'sentry',
        namespace: 'dapr-system',
        status: 'running',
        replicasDesired: 1,
        replicasReady: 1,
        cluster: 'default',
      },
    ],
    components: [
      {
        name: 'orders-statestore',
        namespace: 'orders',
        type: 'state-store',
        componentImpl: 'state.redis',
        cluster: 'default',
      },
      {
        name: 'checkout-pubsub',
        namespace: 'checkout',
        type: 'pubsub',
        componentImpl: 'pubsub.kafka',
        cluster: 'default',
      },
    ],
    apps: { total: 10, namespaces: 3 },
    buildingBlocks: { stateStores: 1, pubsubs: 1, bindings: 0 },
    summary: {
      totalControlPlanePods: 2,
      runningControlPlanePods: 2,
      totalComponents: 2,
      totalDaprApps: 10,
    },
    lastCheckTime: new Date().toISOString(),
    ...overrides,
  }
}

function defaultHookReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: makeData(),
    isLoading: false,
    isRefreshing: false,
    isDemoData: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    showSkeleton: false,
    showEmptyState: false,
    error: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DaprStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedDapr.mockReturnValue(defaultHookReturn())
    mockUseReportCardDataState.mockReturnValue(undefined)
  })

  it('renders without crashing', () => {
    const { container } = render(<DaprStatus />)
    expect(container).toBeTruthy()
  })

  it('renders loading skeleton when showSkeleton is true', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ showSkeleton: true, data: makeData({ health: 'unknown' }) }),
    )
    const { container } = render(<DaprStatus />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders error state when error and showEmptyState are true', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ error: true, showEmptyState: true, isFailed: true }),
    )
    render(<DaprStatus />)
    expect(screen.getByText('Unable to fetch Dapr status')).toBeTruthy()
  })

  it('renders not-installed state', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'not-installed' }) }),
    )
    render(<DaprStatus />)
    expect(screen.getByText('Dapr not detected')).toBeTruthy()
  })

  it('renders healthy state with green indicator', () => {
    const { container } = render(<DaprStatus />)
    expect(screen.getByText('Healthy')).toBeTruthy()
    const greenElements = container.querySelectorAll('.text-green-400')
    expect(greenElements.length).toBeGreaterThan(0)
  })

  it('renders degraded state with yellow indicator', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'degraded' }) }),
    )
    render(<DaprStatus />)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('renders control plane pods', () => {
    render(<DaprStatus />)
    expect(screen.getByText('operator')).toBeTruthy()
    expect(screen.getByText('sentry')).toBeTruthy()
  })

  it('renders component rows', () => {
    render(<DaprStatus />)
    expect(screen.getByText('orders-statestore')).toBeTruthy()
    expect(screen.getByText('checkout-pubsub')).toBeTruthy()
  })

  it('renders summary metric tiles', () => {
    render(<DaprStatus />)
    expect(screen.getByText('2/2')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
  })

  it('handles empty controlPlane array safely', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ data: makeData({ controlPlane: [], health: 'healthy' }) }),
    )
    render(<DaprStatus />)
    expect(screen.getByText('No Dapr control plane pods detected')).toBeTruthy()
  })

  it('handles empty components array safely', () => {
    mockUseCachedDapr.mockReturnValue(
      defaultHookReturn({ data: makeData({ components: [] }) }),
    )
    render(<DaprStatus />)
    expect(screen.getByText('No Dapr components configured')).toBeTruthy()
  })

  it('reports card data state with correct arguments', () => {
    render(<DaprStatus />)
    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({
        isFailed: false,
        isDemoData: false,
        isRefreshing: false,
        hasData: true,
      }),
    )
  })

  it('reports isDemoData when hook returns isDemoData true', () => {
    mockUseCachedDapr.mockReturnValue(defaultHookReturn({ isDemoData: true }))
    render(<DaprStatus />)
    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders building block counts', () => {
    render(<DaprStatus />)
    expect(screen.getByText('State stores')).toBeTruthy()
    expect(screen.getByText('Pub/sub')).toBeTruthy()
    expect(screen.getByText('Bindings')).toBeTruthy()
  })
})
