/**
 * Unit tests for useInsightEnrichment hook.
 *
 * Covers:
 * - mergeEnrichments pure logic (empty state, severity upgrade/downgrade, passthrough)
 * - Hook passthrough when agent is not connected or unavailable
 * - WebSocket connection, message parsing, and error handling
 * - Exponential backoff retry logic and max-retry cap
 * - HTTP enrichment request debouncing, 404 disabling endpoint, payload validation
 * - Hook return value shape
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
  appendWsAuthToken: async (url: string) => url,
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

describe('useInsightEnrichment — WebSocket edge cases', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('ignores WS message with type insights_enriched but missing data field', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({ type: 'insights_enriched' })
    })

    expect(result.current.hasEnrichments).toBe(false)
  })

  it('ignores WS message with type insights_enriched but null enrichments in data', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: null },
      })
    })

    // applyEnrichments guards with (newEnrichments || []) so null is safe
    expect(result.current.hasEnrichments).toBe(false)
  })

  it('handles WebSocket constructor throwing without crashing', async () => {
    // Replace WebSocket with one that throws
    vi.stubGlobal('WebSocket', class ThrowingWebSocket {
      constructor() {
        throw new Error('WebSocket not supported')
      }
    })

    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])

    // Should not crash — graceful degradation
    expect(result.current.enrichedInsights).toHaveLength(1)
    expect(result.current.hasEnrichments).toBe(false)
  })
})

// ── Regression: cleanup on unmount ──────────────────────────────────────────

describe('useInsightEnrichment — cleanup on unmount', () => {
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

  it('clears the debounce timer on unmount so fetch is never called', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enrichments: [], timestamp: new Date().toISOString() }),
    })

    const { unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight({ id: 'unmount-test' })])

    // Advance 1s (less than 2s debounce) then unmount
    await advanceTime(1_000)
    unmount()

    // Advance past the debounce window
    await advanceTime(5_000)

    // Fetch should never have been called — timer was cleared on unmount
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('unsubscribes from enrichment notifications on unmount', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'unsub-test' })

    const { result, unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
    })

    unmount()

    // Sending a message after unmount should not throw
    await act(async () => {
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: {
          enrichments: [makeEnrichment({ insightId: 'unsub-test' })],
        },
      })
    })

    // Since unmounted, the result ref is stale — just verify no error
    expect(result.current.hasEnrichments).toBe(false)
  })
})

// ── Regression: multiple concurrent hook instances (subscribers) ────────────

describe('useInsightEnrichment — multiple concurrent hook instances', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('both hook instances see the same enrichments from singleton state', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'shared-test' })

    const { result: result1 } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])
    const { result: result2 } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    // WS was already connected by first hook — second hook reuses singleton
    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: {
          enrichments: [makeEnrichment({ insightId: 'shared-test', description: 'Shared AI' })],
        },
      })
    })

    // Both instances should see the enrichment
    expect(result1.current.hasEnrichments).toBe(true)
    expect(result1.current.enrichedInsights[0].description).toBe('Shared AI')
    expect(result2.current.hasEnrichments).toBe(true)
    expect(result2.current.enrichedInsights[0].description).toBe('Shared AI')
  })
})

// ── Additional coverage: hashInsights, isCacheValid, requestEnrichment edge cases ──

describe('useInsightEnrichment — requestEnrichment guards', () => {
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

  it('does not fetch when agent is unavailable even if connected', async () => {
    mockIsAgentUnavailable.mockReturnValue(true)
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight({ id: 'unavail-guard' })])
    await advanceTime(2_000)

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not fetch when enrichmentEndpointAvailable is false (404 was received)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    // First call gets a 404 — disables endpoint
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })

    const { unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight({ id: 'disable-1' })])
    await advanceTime(2_000)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Change to a different insight (different hash) to bypass dedup
    const insightNew = makeInsight({ id: 'disable-2', severity: 'critical' })
    await renderInsightEnrichmentHook(useInsightEnrichment, [insightNew])
    await advanceTime(2_000)
    await act(async () => {})

    // Should still be only 1 call — endpoint was disabled by 404
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('handles fetch abort (timeout) gracefully without crashing', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    const abortError = new DOMException('The operation was aborted', 'AbortError')
    mockFetch.mockRejectedValue(abortError)

    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight({ id: 'abort-test' })])
    await advanceTime(2_000)
    await act(async () => {})

    // Should not crash — insights remain heuristic
    expect(result.current.enrichedInsights[0].source).toBe('heuristic')
    expect(result.current.hasEnrichments).toBe(false)
  })
})

// ── Additional coverage: applyEnrichments edge cases ──────────────────────

describe('useInsightEnrichment — applyEnrichments edge cases', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('handles enrichments with undefined enrichments array via || [] guard', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      // data.enrichments is undefined — applyEnrichments uses (undefined || [])
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: undefined },
      })
    })

    expect(result.current.hasEnrichments).toBe(false)
    expect(result.current.enrichmentCount).toBe(0)
  })

  it('does not notify subscribers when empty enrichments array is applied', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [] },
      })
    })

    // Empty array means changed = false, so no subscriber notification
    expect(result.current.hasEnrichments).toBe(false)
  })

  it('overwrites enrichment for same insightId when a later WS message arrives', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'overwrite-ws' })

    const { result } = await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    // First enrichment
    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [makeEnrichment({ insightId: 'overwrite-ws', confidence: 50, description: 'Old desc' })] },
      })
    })

    expect(result.current.enrichedInsights[0].confidence).toBe(50)

    // Second enrichment overwrites
    await act(async () => {
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [makeEnrichment({ insightId: 'overwrite-ws', confidence: 99, description: 'New desc' })] },
      })
    })

    expect(result.current.enrichedInsights[0].confidence).toBe(99)
    expect(result.current.enrichedInsights[0].description).toBe('New desc')
  })
})

// ── Additional coverage: WebSocket reconnect when agent disconnects during close handler ──

describe('useInsightEnrichment — WS reconnect agent state changes', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('does not reconnect if agent disconnects between close event and reconnect timeout', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])
    await runAllTimers()
    expect(capturedWsInstances.length).toBe(1)

    // Close the WS
    act(() => { capturedWsInstances[0].simulateClose() })

    // Agent disconnects before the 5s reconnect timer fires
    mockIsAgentConnected.mockReturnValue(false)

    await advanceTime(5_000)

    // connectWebSocket bails because isAgentConnected() returns false
    expect(capturedWsInstances.length).toBe(1)
  })

  it('caps reconnect delay at 2 minutes (WS_MAX_RECONNECT_DELAY_MS)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    await renderInsightEnrichmentHook(useInsightEnrichment, [makeInsight()])
    await runAllTimers()

    // Close 1: delay = 5s
    act(() => { capturedWsInstances[0].simulateClose() })
    await advanceTime(5_000)
    expect(capturedWsInstances.length).toBe(2)

    // Close 2: delay = 10s
    act(() => { capturedWsInstances[1].simulateClose() })
    await advanceTime(10_000)
    expect(capturedWsInstances.length).toBe(3)

    // Close 3: delay = 20s
    act(() => { capturedWsInstances[2].simulateClose() })
    await advanceTime(20_000)
    expect(capturedWsInstances.length).toBe(4)

    // Close 4: delay = 40s
    act(() => { capturedWsInstances[3].simulateClose() })
    await advanceTime(40_000)
    expect(capturedWsInstances.length).toBe(5)

    // Close 5: wsReconnectAttempts = 5 = MAX — no more reconnects
    act(() => { capturedWsInstances[4].simulateClose() })
    await advanceTime(300_000)
    expect(capturedWsInstances.length).toBe(5)
  })
})

// ── Additional coverage: mergeEnrichments severity with undefined severity ──

describe('mergeEnrichments — enrichment severity undefined edge case', () => {
  let mergeEnrichments: (insights: MultiClusterInsight[]) => MultiClusterInsight[]
  let useInsightEnrichment: (insights: MultiClusterInsight[]) => {
    enrichedInsights: MultiClusterInsight[]
    hasEnrichments: boolean
    enrichmentCount: number
  }

  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
    const mod = await import('./useInsightEnrichment')
    mergeEnrichments = mod.mergeEnrichments
    useInsightEnrichment = mod.useInsightEnrichment
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('preserves heuristic severity when enrichment.severity is undefined and heuristic is critical', async () => {
    const insight = makeInsight({ id: 'sev-undef-crit', severity: 'critical' })
    const enrichment = makeEnrichment({ insightId: 'sev-undef-crit' })
    delete (enrichment as Record<string, unknown>).severity

    await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const merged = mergeEnrichments([insight])
    // undefined severity → aiRank = heuristicRank = 2 (critical) → tie → AI wins but AI severity is undefined → uses fallback to heuristic severity
    expect(merged[0].severity).toBe('critical')
    expect(merged[0].source).toBe('ai')
  })

  it('preserves heuristic remediation when enrichment.remediation is undefined', async () => {
    const insight = makeInsight({ id: 'rem-undef', remediation: 'Existing fix' })
    const enrichment = makeEnrichment({ insightId: 'rem-undef' })
    delete (enrichment as Record<string, unknown>).remediation

    await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const merged = mergeEnrichments([insight])
    // undefined || insight.remediation → 'Existing fix'
    expect(merged[0].remediation).toBe('Existing fix')
  })

  it('returns enrichment remediation when heuristic has no remediation', async () => {
    const insight = makeInsight({ id: 'rem-no-heuristic' })
    // No remediation on insight (undefined)
    const enrichment = makeEnrichment({ insightId: 'rem-no-heuristic', remediation: 'AI fix' })

    await renderInsightEnrichmentHook(useInsightEnrichment, [insight])

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const merged = mergeEnrichments([insight])
    expect(merged[0].remediation).toBe('AI fix')
  })
})

// ── Additional coverage: hashInsights sorting determinism ──────────────────

describe('useInsightEnrichment — hashInsights determinism', () => {
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

  it('treats different ordering of same insights as same hash (no duplicate request)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [makeEnrichment({ insightId: 'order-a' }), makeEnrichment({ insightId: 'order-b' })],
        timestamp: new Date().toISOString(),
      }),
    })

    const insightA = makeInsight({ id: 'order-a', severity: 'info', affectedClusters: ['c1'] })
    const insightB = makeInsight({ id: 'order-b', severity: 'warning', affectedClusters: ['c1', 'c2'] })

    // First render: [A, B]
    const { unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [insightA, insightB])
    await advanceTime(2_000)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Second render: [B, A] — same insights, different order → hash sorts → same hash
    await renderInsightEnrichmentHook(useInsightEnrichment, [insightB, insightA])
    await advanceTime(2_000)
    await act(async () => {})

    // Should NOT have made a second request (hash is the same, cache is valid)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('detects hash change when affectedClusters count changes', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [],
        timestamp: new Date().toISOString(),
      }),
    })

    const insightV1 = makeInsight({ id: 'cluster-count', severity: 'warning', affectedClusters: ['c1'] })

    const { unmount } = await renderInsightEnrichmentHook(useInsightEnrichment, [insightV1])
    await advanceTime(2_000)
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Same id and severity but different cluster count → different hash
    const insightV2 = makeInsight({ id: 'cluster-count', severity: 'warning', affectedClusters: ['c1', 'c2', 'c3'] })
    await renderInsightEnrichmentHook(useInsightEnrichment, [insightV2])
    await advanceTime(2_000)
    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
