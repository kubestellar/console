/**
 * Unit tests for useInsightEnrichment hook (part 2 of 3).
 *
 * Covers: WebSocket edge cases, cleanup on unmount, multiple concurrent hook instances, requestEnrichment guards
 * See also: useInsightEnrichment-edge.test.ts, useInsightEnrichment-edge-3.test.ts
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

