// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { OtelStatus } from '../index'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockUseCachedOtel = vi.fn()

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, optsOrDefault?: unknown) => {
      if (typeof optsOrDefault === 'string') return optsOrDefault
      if (optsOrDefault && typeof optsOrDefault === 'object') {
        const opts = optsOrDefault as Record<string, unknown>
        if (typeof opts.defaultValue === 'string') return opts.defaultValue
      }
      return key
    },
  }),
}))

vi.mock('../../../../hooks/useCachedOtel', () => ({
  useCachedOtel: () => mockUseCachedOtel(),
}))

vi.mock('../CardDataContext', () => ({
  useCardLoadingState: ({ isLoading }: { isLoading: boolean }) => ({
    showSkeleton: isLoading,
    showEmptyState: false,
  }),
}))

vi.mock('../../../ui/Skeleton', () => ({
  SkeletonCardWithRefresh: () => <div data-testid="skeleton-card-with-refresh" />,
}))

vi.mock('../../../ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      {description && <span>{description}</span>}
    </div>
  ),
}))

vi.mock('../../../../lib/cards/CardComponents', () => ({
  MetricTile: ({
    label,
    value,
  }: {
    label: string
    value: string | number
  }) => (
    <div data-testid="metric-tile">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}))

vi.mock('../../../../lib/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('../../../../lib/cards/statusColors', () => ({
  getHealthBadgeClasses: (isHealthy: boolean) =>
    isHealthy ? 'badge-healthy' : 'badge-degraded',
}))

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

const HEALTHY_DATA = {
  health: 'healthy' as const,
  collectors: [
    {
      name: 'otel-collector-abc',
      namespace: 'observability',
      cluster: 'prod-cluster',
      state: 'Running' as const,
      version: '0.109.0',
      mode: 'deployment',
      pipelines: [
        {
          name: 'traces',
          signal: 'traces' as const,
          receivers: ['otlp'],
          processors: ['batch'],
          exporters: ['jaeger'],
          healthy: true,
        },
      ],
      spansAccepted: 5000,
      spansDropped: 0,
      metricsAccepted: 1000,
      metricsDropped: 0,
      logsAccepted: 2000,
      logsDropped: 0,
      exportErrors: 0,
    },
  ],
  summary: {
    totalCollectors: 1,
    runningCollectors: 1,
    degradedCollectors: 0,
    totalPipelines: 1,
    healthyPipelines: 1,
    uniqueReceivers: ['otlp'],
    uniqueExporters: ['jaeger'],
    totalSpansAccepted: 5000,
    totalSpansDropped: 0,
    totalMetricsAccepted: 1000,
    totalMetricsDropped: 0,
    totalLogsAccepted: 2000,
    totalLogsDropped: 0,
    totalExportErrors: 0,
  },
  lastCheckTime: new Date().toISOString(),
}

const DEGRADED_DATA = {
  ...HEALTHY_DATA,
  health: 'degraded' as const,
  collectors: [
    {
      ...HEALTHY_DATA.collectors[0],
      state: 'Running' as const,
      exportErrors: 3,
      pipelines: [
        { ...HEALTHY_DATA.collectors[0].pipelines[0], healthy: false },
      ],
    },
  ],
  summary: {
    ...HEALTHY_DATA.summary,
    degradedCollectors: 1,
    healthyPipelines: 0,
    totalSpansDropped: 42,
    totalMetricsDropped: 10,
    totalLogsDropped: 5,
  },
}

function setupMock(overrides: Record<string, unknown> = {}) {
  mockUseCachedOtel.mockReturnValue({
    data: HEALTHY_DATA,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OtelStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton while loading', () => {
    setupMock({ isLoading: true, data: { ...HEALTHY_DATA, summary: { ...HEALTHY_DATA.summary, totalCollectors: 0 } } })
    render(<OtelStatus />)
    expect(screen.getByTestId('skeleton-card-with-refresh')).toBeInTheDocument()
  })

  it('renders healthy status badge', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('renders degraded status badge when health is degraded', () => {
    setupMock({ data: DEGRADED_DATA })
    render(<OtelStatus />)
    expect(screen.getByText('Degraded')).toBeInTheDocument()
  })

  it('renders collector count in summary', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('1 collectors')).toBeInTheDocument()
  })

  it('renders metric tiles for running, degraded, pipelines, and dropped', () => {
    setupMock()
    render(<OtelStatus />)
    const tiles = screen.getAllByTestId('metric-tile')
    expect(tiles.length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Degraded')).toBeInTheDocument()
    expect(screen.getByText('Pipelines')).toBeInTheDocument()
    expect(screen.getByText('Dropped')).toBeInTheDocument()
  })

  it('renders receiver badge', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('Receivers')).toBeInTheDocument()
    expect(screen.getByText('otlp')).toBeInTheDocument()
  })

  it('renders exporter badge', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('Exporters')).toBeInTheDocument()
    expect(screen.getByText('jaeger')).toBeInTheDocument()
  })

  it('renders collector name and cluster', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('otel-collector-abc')).toBeInTheDocument()
    expect(screen.getByText('prod-cluster')).toBeInTheDocument()
  })

  it('renders pipeline badge with signal and name', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText('traces:traces')).toBeInTheDocument()
  })

  it('renders collector mode and version', () => {
    setupMock()
    render(<OtelStatus />)
    expect(screen.getByText(/Mode.*deployment.*v0\.109\.0/)).toBeInTheDocument()
  })

  it('renders dropped total from degraded data', () => {
    setupMock({ data: DEGRADED_DATA })
    render(<OtelStatus />)
    // totalSpansDropped(42) + totalMetricsDropped(10) + totalLogsDropped(5) = 57
    expect(screen.getByText('57')).toBeInTheDocument()
  })

  it('shows not-installed empty state when health is not-installed and not demo', () => {
    mockUseCachedOtel.mockReturnValue({
      data: {
        ...HEALTHY_DATA,
        health: 'not-installed',
        summary: { ...HEALTHY_DATA.summary, totalCollectors: 0 },
      },
      isLoading: false,
      isRefreshing: false,
      isDemoFallback: false,
      isFailed: false,
      consecutiveFailures: 0,
      lastRefresh: Date.now(),
    })
    render(<OtelStatus />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('OpenTelemetry not detected')).toBeInTheDocument()
  })

  it('renders +N overflow badge when receivers exceed limit', () => {
    const manyReceivers = ['otlp', 'prometheus', 'hostmetrics', 'filelog', 'k8sattributes']
    setupMock({
      data: {
        ...HEALTHY_DATA,
        summary: {
          ...HEALTHY_DATA.summary,
          uniqueReceivers: manyReceivers,
        },
      },
    })
    render(<OtelStatus />)
    // 4 shown, 1 overflow → "+1"
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('shows no-collectors message when collector list is empty', () => {
    setupMock({
      data: {
        ...HEALTHY_DATA,
        collectors: [],
        summary: { ...HEALTHY_DATA.summary, totalCollectors: 2, runningCollectors: 2 },
      },
    })
    render(<OtelStatus />)
    expect(screen.getByText('No OpenTelemetry Collectors reporting.')).toBeInTheDocument()
  })

  it('renders export errors count per collector', () => {
    setupMock({ data: DEGRADED_DATA })
    render(<OtelStatus />)
    expect(screen.getByText('3 export errors')).toBeInTheDocument()
  })
})
