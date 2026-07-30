/**
 * Unit tests for useInsightEnrichment hook (part 3 of 3).
 *
 * Covers: applyEnrichments edge cases, WS reconnect agent state changes, mergeEnrichments severity edge case, hashInsights determinism
 * See also: useInsightEnrichment-edge.test.ts, useInsightEnrichment-edge-2.test.ts
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
