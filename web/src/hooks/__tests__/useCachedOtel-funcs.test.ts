/**
 * Tests for the pure helper functions exported via __testables
 * from useCachedOtel.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 5000,
}))

const { mockAuthFetch, mockUseCache } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
  mockUseCache: vi.fn(() => ({
    data: null,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    refetch: vi.fn(),
  })),
}))
vi.mock('../../lib/api', () => ({ authFetch: mockAuthFetch }))
vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
  createCachedHook: (_config: unknown) => () => mockUseCache(_config),
}))

import { __testables, useCachedOtel } from '../useCachedOtel'

const {
  isOtelCollectorPod,
  parseIntOrZero,
  deriveCollectorState,
  parseVersion,
  parsePipelines,
  normalizeSignal,
  podToCollector,
  summarize,
  buildStatus,
} = __testables

// ---------------------------------------------------------------------------
// isOtelCollectorPod
// ---------------------------------------------------------------------------

describe('isOtelCollectorPod', () => {
  it('matches by app.kubernetes.io/name label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/name': 'opentelemetry-collector' } } }
    expect(isOtelCollectorPod(pod)).toBe(true)
  })

  it('matches by app.kubernetes.io/part-of label', () => {
    const pod = { name: 'pod1', metadata: { labels: { 'app.kubernetes.io/part-of': 'opentelemetry' } } }
    expect(isOtelCollectorPod(pod)).toBe(true)
  })

  it('matches by app label', () => {
    const pod = { name: 'pod1', metadata: { labels: { app: 'opentelemetry-collector' } } }
    expect(isOtelCollectorPod(pod)).toBe(true)
  })

  it('matches by name containing otel-collector', () => {
    expect(isOtelCollectorPod({ name: 'otel-collector-abc-xyz' })).toBe(true)
  })

  it('matches by name starting with otel-agent', () => {
    expect(isOtelCollectorPod({ name: 'otel-agent-0' })).toBe(true)
  })

  it('matches by name starting with otel-gateway', () => {
    expect(isOtelCollectorPod({ name: 'otel-gateway-abc' })).toBe(true)
  })

  it('matches name containing opentelemetry-collector', () => {
    expect(isOtelCollectorPod({ name: 'my-opentelemetry-collector-0' })).toBe(true)
  })

  it('does not match unrelated pods', () => {
    expect(isOtelCollectorPod({ name: 'nginx-pod' })).toBe(false)
    expect(isOtelCollectorPod({ name: 'prometheus-server-0' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// parseIntOrZero
// ---------------------------------------------------------------------------

describe('parseIntOrZero', () => {
  it('parses valid integer string', () => {
    expect(parseIntOrZero('42')).toBe(42)
  })

  it('returns 0 for undefined', () => {
    expect(parseIntOrZero(undefined)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(parseIntOrZero('')).toBe(0)
  })

  it('returns 0 for non-numeric string', () => {
    expect(parseIntOrZero('abc')).toBe(0)
  })

  it('parses integer part of decimal', () => {
    expect(parseIntOrZero('3.14')).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// deriveCollectorState
// ---------------------------------------------------------------------------

describe('deriveCollectorState', () => {
  it('returns Running when phase=Running and all containers ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }] } }
    expect(deriveCollectorState(pod)).toBe('Running')
  })

  it('returns Degraded when phase=Running but not all containers ready', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [{ ready: true }, { ready: false }] } }
    expect(deriveCollectorState(pod)).toBe('Degraded')
  })

  it('returns Degraded when phase=Running but no container statuses', () => {
    const pod = { name: 'p', status: { phase: 'Running', containerStatuses: [] } }
    expect(deriveCollectorState(pod)).toBe('Degraded')
  })

  it('returns Pending for Pending phase', () => {
    const pod = { name: 'p', status: { phase: 'Pending' } }
    expect(deriveCollectorState(pod)).toBe('Pending')
  })

  it('returns Failed for Failed phase', () => {
    const pod = { name: 'p', status: { phase: 'Failed' } }
    expect(deriveCollectorState(pod)).toBe('Failed')
  })

  it('returns Failed for unknown phase', () => {
    const pod = { name: 'p', status: { phase: 'Succeeded' } }
    expect(deriveCollectorState(pod)).toBe('Failed')
  })

  it('returns Failed when status is missing', () => {
    const pod = { name: 'p' }
    expect(deriveCollectorState(pod)).toBe('Failed')
  })
})

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------

describe('parseVersion', () => {
  it('extracts version from otel container image', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'otel-collector', image: 'otel/opentelemetry-collector:0.88.0' }] },
    }
    expect(parseVersion(pod)).toBe('0.88.0')
  })

  it('strips digest before extracting version', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'opentelemetry', image: 'ghcr.io/otel/collector:0.90.1@sha256:abc123' }] },
    }
    expect(parseVersion(pod)).toBe('0.90.1')
  })

  it('falls back to first container if no otel container found', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'sidecar', image: 'envoy:v1.28.0' }] },
    }
    expect(parseVersion(pod)).toBe('v1.28.0')
  })

  it('returns empty string when no containers', () => {
    expect(parseVersion({ name: 'p' })).toBe('')
    expect(parseVersion({ name: 'p', status: { containerStatuses: [] } })).toBe('')
  })

  it('returns empty string for image without tag', () => {
    const pod = {
      name: 'p',
      status: { containerStatuses: [{ name: 'c', image: 'nginx' }] },
    }
    expect(parseVersion(pod)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// parsePipelines
// ---------------------------------------------------------------------------

describe('parsePipelines', () => {
  it('returns empty array for undefined', () => {
    expect(parsePipelines(undefined)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parsePipelines('')).toEqual([])
  })

  it('parses JSON array of pipeline objects', () => {
    const json = JSON.stringify([
      { name: 'traces/default', signal: 'traces', receivers: ['otlp'], processors: ['batch'], exporters: ['jaeger'], healthy: true },
    ])
    const result = parsePipelines(json)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('traces/default')
    expect(result[0].receivers).toEqual(['otlp'])
    expect(result[0].exporters).toEqual(['jaeger'])
  })

  it('parses comma-delimited token format', () => {
    const result = parsePipelines('traces/default:traces,metrics/prom:metrics')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('traces/default')
    expect(result[0].signal).toBe('traces')
    expect(result[1].name).toBe('metrics/prom')
    expect(result[1].signal).toBe('metrics')
  })

  it('handles token without signal part', () => {
    const result = parsePipelines('my-pipeline')
    expect(result).toHaveLength(1)
    expect(result[0].signal).toBe('traces') // default signal
  })

  it('normalizes pipeline objects with missing fields', () => {
    const json = JSON.stringify([{}])
    const result = parsePipelines(json)
    expect(result[0].name).toBe('pipeline')
    expect(result[0].signal).toBe('traces')
    expect(result[0].receivers).toEqual([])
    expect(result[0].healthy).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// normalizeSignal
// ---------------------------------------------------------------------------

describe('normalizeSignal', () => {
  it('returns traces for undefined', () => {
    expect(normalizeSignal(undefined)).toBe('traces')
  })

  it('returns metrics for metric-prefixed values', () => {
    expect(normalizeSignal('metrics')).toBe('metrics')
    expect(normalizeSignal('metric')).toBe('metrics')
  })

  it('returns logs for log-prefixed values', () => {
    expect(normalizeSignal('logs')).toBe('logs')
    expect(normalizeSignal('log')).toBe('logs')
  })

  it('returns traces for other values', () => {
    expect(normalizeSignal('traces')).toBe('traces')
    expect(normalizeSignal('something')).toBe('traces')
    expect(normalizeSignal('')).toBe('traces')
  })
})

// ---------------------------------------------------------------------------
// podToCollector
// ---------------------------------------------------------------------------

describe('podToCollector', () => {
  it('maps a fully-annotated pod to a collector', () => {
    const pod = {
      name: 'otel-collector-0',
      namespace: 'monitoring',
      cluster: 'prod',
      status: {
        phase: 'Running',
        containerStatuses: [{ name: 'otel-collector', ready: true, image: 'otel/collector:0.90.0' }],
      },
      metadata: {
        labels: { 'app.kubernetes.io/component': 'gateway' },
        annotations: {
          'opentelemetry.io/pipelines': 'traces:traces',
          'opentelemetry.io/spans-accepted': '1000',
          'opentelemetry.io/spans-dropped': '5',
          'opentelemetry.io/export-errors': '2',
        },
      },
    }
    const collector = podToCollector(pod)
    expect(collector.name).toBe('otel-collector-0')
    expect(collector.namespace).toBe('monitoring')
    expect(collector.cluster).toBe('prod')
    expect(collector.state).toBe('Running')
    expect(collector.version).toBe('0.90.0')
    expect(collector.mode).toBe('gateway')
    expect(collector.spansAccepted).toBe(1000)
    expect(collector.spansDropped).toBe(5)
    expect(collector.exportErrors).toBe(2)
  })

  it('uses defaults for missing fields', () => {
    const pod = { name: 'otel-pod' }
    const collector = podToCollector(pod)
    expect(collector.namespace).toBe('default')
    expect(collector.cluster).toBe('')
    expect(collector.mode).toBe('deployment')
    expect(collector.spansAccepted).toBe(0)
    expect(collector.pipelines).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize (otel)', () => {
  it('returns zeros for empty collectors', () => {
    const result = summarize([])
    expect(result.totalCollectors).toBe(0)
    expect(result.runningCollectors).toBe(0)
    expect(result.totalPipelines).toBe(0)
  })

  it('counts collectors and pipelines correctly', () => {
    const collectors = [
      {
        name: 'c1', namespace: 'ns', cluster: '', state: 'Running' as const, version: '',
        mode: 'deployment', pipelines: [
          { name: 'p1', signal: 'traces' as const, receivers: ['otlp'], processors: [], exporters: ['jaeger'], healthy: true },
          { name: 'p2', signal: 'metrics' as const, receivers: ['prometheus'], processors: [], exporters: ['prometheus'], healthy: false },
        ],
        spansAccepted: 100, spansDropped: 1, metricsAccepted: 200, metricsDropped: 2,
        logsAccepted: 50, logsDropped: 0, exportErrors: 3,
      },
      {
        name: 'c2', namespace: 'ns', cluster: '', state: 'Degraded' as const, version: '',
        mode: 'daemonset', pipelines: [],
        spansAccepted: 0, spansDropped: 0, metricsAccepted: 0, metricsDropped: 0,
        logsAccepted: 0, logsDropped: 0, exportErrors: 0,
      },
    ]
    const result = summarize(collectors)
    expect(result.totalCollectors).toBe(2)
    expect(result.runningCollectors).toBe(1)
    expect(result.degradedCollectors).toBe(1)
    expect(result.totalPipelines).toBe(2)
    expect(result.healthyPipelines).toBe(1)
    expect(result.uniqueReceivers).toEqual(['otlp', 'prometheus'])
    expect(result.uniqueExporters).toEqual(['jaeger', 'prometheus'])
    expect(result.totalSpansAccepted).toBe(100)
    expect(result.totalSpansDropped).toBe(1)
    expect(result.totalMetricsAccepted).toBe(200)
    expect(result.totalExportErrors).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------------

describe('buildStatus (otel)', () => {
  it('returns not-installed for empty collectors', () => {
    const result = buildStatus([])
    expect(result.health).toBe('not-installed')
    expect(result.collectors).toEqual([])
  })

  it('returns healthy when all collectors running and no export errors', () => {
    const collectors = [{
      name: 'c1', namespace: 'ns', cluster: '', state: 'Running' as const, version: '',
      mode: 'deployment', pipelines: [],
      spansAccepted: 0, spansDropped: 0, metricsAccepted: 0, metricsDropped: 0,
      logsAccepted: 0, logsDropped: 0, exportErrors: 0,
    }]
    const result = buildStatus(collectors)
    expect(result.health).toBe('healthy')
  })

  it('returns degraded when degraded collectors exist', () => {
    const collectors = [{
      name: 'c1', namespace: 'ns', cluster: '', state: 'Degraded' as const, version: '',
      mode: 'deployment', pipelines: [],
      spansAccepted: 0, spansDropped: 0, metricsAccepted: 0, metricsDropped: 0,
      logsAccepted: 0, logsDropped: 0, exportErrors: 0,
    }]
    const result = buildStatus(collectors)
    expect(result.health).toBe('degraded')
  })

  it('returns degraded when export errors > 0', () => {
    const collectors = [{
      name: 'c1', namespace: 'ns', cluster: '', state: 'Running' as const, version: '',
      mode: 'deployment', pipelines: [],
      spansAccepted: 0, spansDropped: 0, metricsAccepted: 0, metricsDropped: 0,
      logsAccepted: 0, logsDropped: 0, exportErrors: 5,
    }]
    const result = buildStatus(collectors)
    expect(result.health).toBe('degraded')
  })
})

// ---------------------------------------------------------------------------
// Fetcher (via useCache capture)
// ---------------------------------------------------------------------------

describe('fetchOtelStatus (fetcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function captureFetcher(): () => Promise<unknown> {
    renderHook(() => useCachedOtel())
    const config = mockUseCache.mock.calls[0]?.[0] as { fetcher: () => Promise<unknown> }
    return config.fetcher
  }

  it('returns parsed data on success', async () => {
    const otelPod = {
      name: 'otel-collector-0',
      namespace: 'monitoring',
      cluster: 'prod',
      status: {
        phase: 'Running',
        containerStatuses: [{ name: 'otel-collector', ready: true, image: 'otel/collector:0.90.0' }],
      },
      metadata: {
        labels: { 'app.kubernetes.io/name': 'opentelemetry-collector' },
        annotations: {},
      },
    }
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ items: [otelPod] }),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string; collectors: unknown[] }
    expect(result.health).toBe('healthy')
    expect(result.collectors).toHaveLength(1)
  })

  it('returns not-installed for 404 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('returns not-installed for 503 status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })

  it('throws on non-whitelisted error status', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('HTTP 500')
  })

  it('throws on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'))

    const fetcher = captureFetcher()
    await expect(fetcher()).rejects.toThrow('Network error')
  })

  it('returns not-installed when JSON parse fails', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    })

    const fetcher = captureFetcher()
    const result = await fetcher() as { health: string }
    expect(result.health).toBe('not-installed')
  })
})
