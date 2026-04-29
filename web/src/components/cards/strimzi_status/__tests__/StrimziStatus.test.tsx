import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { StrimziStatusData, StrimziKafkaCluster } from '../demoData'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseCachedStrimzi = vi.fn()
vi.mock('../../../../hooks/useCachedStrimzi', () => ({
  useCachedStrimzi: (...args: unknown[]) => mockUseCachedStrimzi(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: string | Record<string, unknown>) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts
      return key
    },
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
import { StrimziStatus } from '../index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCluster(overrides: Partial<StrimziKafkaCluster> = {}): StrimziKafkaCluster {
  return {
    name: 'orders-kafka',
    namespace: 'kafka',
    cluster: 'prod-east',
    kafkaVersion: '3.7.0',
    health: 'healthy',
    brokers: { ready: 3, total: 3 },
    topics: [
      { name: 'orders', partitions: 12, replicationFactor: 3, status: 'active' },
      { name: 'payments', partitions: 6, replicationFactor: 3, status: 'active' },
    ],
    consumerGroups: [
      { groupId: 'order-service', members: 4, lag: 0, status: 'ok' },
      { groupId: 'payment-processor', members: 2, lag: 150, status: 'warning' },
    ],
    totalLag: 150,
    ...overrides,
  }
}

function makeData(overrides: Partial<StrimziStatusData> = {}): StrimziStatusData {
  const clusters = overrides.clusters ?? [makeCluster()]
  return {
    health: 'healthy',
    clusters,
    stats: {
      clusterCount: clusters.length,
      brokerCount: 3,
      topicCount: 2,
      consumerGroupCount: 2,
      totalLag: 150,
      operatorVersion: '0.41.0',
    },
    summary: {
      totalClusters: clusters.length,
      healthyClusters: clusters.filter(c => c.health === 'healthy').length,
      totalBrokers: 3,
      readyBrokers: 3,
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

describe('StrimziStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCachedStrimzi.mockReturnValue(defaultHookReturn())
    mockUseReportCardDataState.mockReturnValue(undefined)
  })

  it('renders without crashing', () => {
    const { container } = render(<StrimziStatus />)
    expect(container).toBeTruthy()
  })

  it('renders loading skeleton when showSkeleton is true', () => {
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({ showSkeleton: true, data: makeData({ health: 'unknown' }) }),
    )
    const { container } = render(<StrimziStatus />)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders error state when error and showEmptyState are true', () => {
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({ error: true, showEmptyState: true, isFailed: true }),
    )
    render(<StrimziStatus />)
    expect(screen.getByText('Unable to fetch Strimzi status')).toBeTruthy()
  })

  it('renders not-installed state', () => {
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'not-installed' }) }),
    )
    render(<StrimziStatus />)
    expect(screen.getByText('Strimzi not detected')).toBeTruthy()
  })

  it('renders healthy state with green indicator', () => {
    const { container } = render(<StrimziStatus />)
    expect(screen.getByText('Healthy')).toBeTruthy()
    const greenElements = container.querySelectorAll('.text-green-400')
    expect(greenElements.length).toBeGreaterThan(0)
  })

  it('renders degraded state with yellow indicator', () => {
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({ data: makeData({ health: 'degraded' }) }),
    )
    render(<StrimziStatus />)
    expect(screen.getByText('Degraded')).toBeTruthy()
  })

  it('renders Kafka cluster rows', () => {
    render(<StrimziStatus />)
    expect(screen.getByText('orders-kafka')).toBeTruthy()
  })

  it('renders broker readiness in summary tiles', () => {
    render(<StrimziStatus />)
    expect(screen.getByText('3/3')).toBeTruthy()
  })

  it('renders consumer group chips for clusters', () => {
    render(<StrimziStatus />)
    expect(screen.getByText('order-service')).toBeTruthy()
    expect(screen.getByText('payment-processor')).toBeTruthy()
  })

  it('renders operator version', () => {
    render(<StrimziStatus />)
    expect(screen.getByText('0.41.0')).toBeTruthy()
  })

  it('handles empty clusters array safely', () => {
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({
        data: makeData({
          clusters: [],
          stats: { clusterCount: 0, brokerCount: 0, topicCount: 0, consumerGroupCount: 0, totalLag: 0, operatorVersion: '0.41.0' },
          summary: { totalClusters: 0, healthyClusters: 0, totalBrokers: 0, readyBrokers: 0 },
        }),
      }),
    )
    render(<StrimziStatus />)
    expect(screen.getByText('No Kafka clusters found')).toBeTruthy()
  })

  it('handles undefined clusters gracefully (array safety)', () => {
    const data = makeData()
    ;(data as Record<string, unknown>).clusters = undefined
    mockUseCachedStrimzi.mockReturnValue(defaultHookReturn({ data }))
    const { container } = render(<StrimziStatus />)
    expect(container).toBeTruthy()
  })

  it('reports card data state with correct arguments', () => {
    render(<StrimziStatus />)
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
    mockUseCachedStrimzi.mockReturnValue(defaultHookReturn({ isDemoData: true }))
    render(<StrimziStatus />)
    expect(mockUseReportCardDataState).toHaveBeenCalledWith(
      expect.objectContaining({ isDemoData: true }),
    )
  })

  it('renders multiple kafka clusters', () => {
    const clusters = [
      makeCluster({ name: 'orders-kafka', cluster: 'prod-east' }),
      makeCluster({ name: 'telemetry-kafka', cluster: 'prod-west', health: 'degraded' }),
    ]
    mockUseCachedStrimzi.mockReturnValue(
      defaultHookReturn({ data: makeData({ clusters }) }),
    )
    render(<StrimziStatus />)
    expect(screen.getByText('orders-kafka')).toBeTruthy()
    expect(screen.getByText('telemetry-kafka')).toBeTruthy()
  })
})
