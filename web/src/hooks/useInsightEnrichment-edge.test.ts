/**
 * Unit tests for useInsightEnrichment hook (part 1 of 3).
 *
 * Covers: HTTP error handling, debounce behavior on rapid updates, payload optional fields
 * See also: useInsightEnrichment-edge-2.test.ts, useInsightEnrichment-edge-3.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { MultiClusterInsight, AIInsightEnrichment } from '../types/insights'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
// vi.hoisted runs before vi.mock factories, so the mock fns can be referenced.

const { mockIsAgentConnected, mockIsAgentUnavailable } = vi.hoisted(() => ({
  mockIsAgentConnected: vi.fn(() => true),
  mockIsAgentUnavailable: vi.fn(() => false),
}))

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('./useLocalAgent', () => ({
  isAgentConnected: () => mockIsAgentConnected(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
} })

vi.mock('../lib/utils/wsAuth', () => ({
  getWsAuthParams: async (url: string) => ({ url, protocols: [] }),
}))

// ── WebSocket mock ──────────────────────────────────────────────────────────────
// A lightweight stand-in that captures instances and exposes simulation helpers.

let capturedWsInstances: MockWebSocket[] = []

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null

  constructor(public readonly url: string) {
    capturedWsInstances.push(this)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  simulateError() {
    this.onerror?.(new Event('error'))
  }
}

// ── Helper factories ────────────────────────────────────────────────────────────

function makeInsight(overrides: Partial<MultiClusterInsight> = {}): MultiClusterInsight {
  return {
    id: 'insight-1',
    category: 'event-correlation',
    source: 'heuristic',
    severity: 'warning',
    title: 'Test Insight',
    description: 'Heuristic description',
    affectedClusters: ['cluster-1', 'cluster-2'],
    detectedAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  }
}

function makeEnrichment(overrides: Partial<AIInsightEnrichment> = {}): AIInsightEnrichment {
  return {
    insightId: 'insight-1',
    description: 'AI description',
    remediation: 'Apply patch XYZ',
    confidence: 85,
    provider: 'claude',
    ...overrides,
  }
}

type UseInsightEnrichmentHook = (insights: MultiClusterInsight[]) => {
  enrichedInsights: MultiClusterInsight[]
  hasEnrichments: boolean
  enrichmentCount: number
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderInsightEnrichmentHook(
  useInsightEnrichment: UseInsightEnrichmentHook,
  insights: MultiClusterInsight[],
) {
  const hook = renderHook(() => useInsightEnrichment(insights))
  await flushMicrotasks()
  return hook
}

async function advanceTime(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  await flushMicrotasks()
}

async function runAllTimers() {
  await act(async () => {
    await vi.runAllTimersAsync()
  })
  await flushMicrotasks()
}

// ── mergeEnrichments — empty enrichments map ───────────────────────────────────


describe('useInsightEnrichment — HTTP error handling', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('silently handles 500 server error without disabling endpoint', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'err-500' })

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    })

    const { result, unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await advanceTime(2_000)
    await act(async () => {})

    // Should not crash — insights remain unchanged
    expect(result.current.enrichedInsights[0].source).toBe('heuristic')
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Endpoint NOT disabled — can retry with different insights
    const insightB = makeInsight({ id: 'err-500-retry', severity: 'critical' })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [makeEnrichment({ insightId: 'err-500-retry' })],
        timestamp: new Date().toISOString(),
      }),
    })

    await renderInsightEnrichmentHook(useInsightEnrichment, [insightB])
    await advanceTime(2_000)
    await act(async () => {})

    // Second call went through because endpoint was NOT disabled
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('silently handles network errors (fetch throws) without crashing', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'net-err' })

    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await advanceTime(2_000)
    await act(async () => {})

    // Should not crash — insights remain unchanged
    expect(result.current.enrichedInsights[0].source).toBe('heuristic')
    expect(result.current.enrichedInsights[0].description).toBe('Heuristic description')
  })

  it('handles empty enrichments array in response without errors', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'empty-resp' })

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [],
        timestamp: new Date().toISOString(),
      }),
    })

    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await advanceTime(2_000)
    await act(async () => {})

    expect(result.current.hasEnrichments).toBe(false)
    expect(result.current.enrichedInsights[0].source).toBe('heuristic')
  })
})

// ── Regression: debounce reset on rapid insight changes ─────────────────────

describe('useInsightEnrichment — debounce behavior on rapid updates', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('resets debounce timer when insights change rapidly — only fires once', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [],
        timestamp: new Date().toISOString(),
      }),
    })

    const insightA = makeInsight({ id: 'rapid-a', severity: 'info' })
    const insightB = makeInsight({ id: 'rapid-b', severity: 'warning' })
    const insightC = makeInsight({ id: 'rapid-c', severity: 'critical' })

    // The hook uses insightsKey = heuristicInsights.length as the effect
    // dependency, so changing array length triggers the debounce reset.
    // Use arrays of increasing length to exercise the debounce path.
    const { rerender } = renderHook(
      ({ insights }) => useInsightEnrichment(insights),
      { initialProps: { insights: [insightA] } },
    )

    // Advance 1s (less than 2s debounce) and change insights (length 1 -> 2)
    await advanceTime(1_000)
    rerender({ insights: [insightA, insightB] })

    // Advance another 1s and change again (length 2 -> 3)
    await advanceTime(1_000)
    rerender({ insights: [insightA, insightB, insightC] })

    // No fetch yet — debounce keeps resetting because length keeps changing
    expect(mockFetch).not.toHaveBeenCalled()

    // Now wait the full 2s debounce from the last change
    await advanceTime(2_000)
    await act(async () => {})

    // Only one fetch call with the latest insights
    expect(mockFetch).toHaveBeenCalledOnce()
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.insights).toHaveLength(3)
    expect(body.insights[2].id).toBe('rapid-c')
  })
})

// ── Regression: payload includes optional fields (chain, deltas, metrics) ───

describe('useInsightEnrichment — payload includes optional fields', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('includes chain, deltas, and metrics in POST payload when present', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enrichments: [], timestamp: new Date().toISOString() }),
    })

    const insight = makeInsight({
      id: 'full-payload',
      category: 'cascade-impact',
      chain: [
        { cluster: 'cluster-1', resource: 'pod/web', event: 'OOMKilled', timestamp: '2026-01-15T10:00:00Z', severity: 'critical' },
        { cluster: 'cluster-2', resource: 'svc/api', event: 'Unhealthy', timestamp: '2026-01-15T10:01:00Z', severity: 'warning' },
      ],
      deltas: [
        { dimension: 'cpu', clusterA: { name: 'c1', value: 80 }, clusterB: { name: 'c2', value: 20 }, significance: 'high' as const },
      ],
      metrics: { 'cpu-usage': 85.5, 'memory-usage': 72.1 },
    })

    await renderInsightEnrichmentHook(useInsightEnrichment, [insight])
    await advanceTime(2_000)
    await act(async () => {})

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.insights[0].chain).toHaveLength(2)
    expect(body.insights[0].chain[0].cluster).toBe('cluster-1')
    expect(body.insights[0].deltas).toHaveLength(1)
    expect(body.insights[0].deltas[0].dimension).toBe('cpu')
    expect(body.insights[0].metrics['cpu-usage']).toBe(85.5)
  })
})

// ── Regression: WebSocket edge cases ────────────────────────────────────────

