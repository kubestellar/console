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

// ── mergeEnrichments — empty enrichments map ───────────────────────────────────


describe('useInsightEnrichment — HTTP enrichment request', () => {
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

  it('does not call fetch immediately — waits for the 2s debounce', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    // No timers advanced yet
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sends enrichment request after the 2s debounce delay', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enrichments: [], timestamp: new Date().toISOString() }),
    })

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0][0]).toContain('/insights/enrich')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
  })

  it('includes correct insight fields in the POST payload', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'payload-test', title: 'Payload Test', severity: 'critical' })

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enrichments: [], timestamp: new Date().toISOString() }),
    })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      insights: Array<{ id: string; title: string; severity: string }>
    }
    expect(body.insights).toHaveLength(1)
    expect(body.insights[0].id).toBe('payload-test')
    expect(body.insights[0].title).toBe('Payload Test')
    expect(body.insights[0].severity).toBe('critical')
  })

  it('applies enrichments from HTTP response and updates enriched state', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'http-test' })
    const enrichment = makeEnrichment({ insightId: 'http-test', description: 'HTTP AI desc' })

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [enrichment],
        timestamp: new Date().toISOString(),
      }),
    })

    const { result } = renderHook(() => useInsightEnrichment([insight]))

    // Advance 2 s to fire the debounce timer
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    // Flush the fetch promise chain and resulting React state updates
    await act(async () => {})

    expect(result.current.hasEnrichments).toBe(true)
    expect(result.current.enrichedInsights[0].description).toBe('HTTP AI desc')
    expect(result.current.enrichedInsights[0].source).toBe('ai')
  })

  it('disables the enrichment endpoint after a 404 response and does not retry', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insights = [makeInsight()]

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    })

    // First mount — triggers the request
    const { unmount } = renderHook(() => useInsightEnrichment(insights))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Second mount with same insights — endpoint is disabled, no new request
    renderHook(() => useInsightEnrichment(insights))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('does not send fetch when agent is not connected', async () => {
    mockIsAgentConnected.mockReturnValue(false)
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not send fetch when the insights array is empty', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([]))

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── useInsightEnrichment — return value shape ──────────────────────────────────

describe('useInsightEnrichment — return value shape', () => {
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

  it('returns enrichedInsights (array), hasEnrichments (boolean), enrichmentCount (number)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    const { result } = renderHook(() => useInsightEnrichment([makeInsight()]))

    expect(Array.isArray(result.current.enrichedInsights)).toBe(true)
    expect(typeof result.current.hasEnrichments).toBe('boolean')
    expect(typeof result.current.enrichmentCount).toBe('number')
  })

  it('hasEnrichments is false and enrichmentCount is 0 when no enrichments have been applied', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    const { result } = renderHook(() => useInsightEnrichment([makeInsight()]))

    expect(result.current.hasEnrichments).toBe(false)
    expect(result.current.enrichmentCount).toBe(0)
  })

  it('enrichedInsights contains the original insight when no enrichments exist', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ title: 'My Insight' })

    const { result } = renderHook(() => useInsightEnrichment([insight]))

    expect(result.current.enrichedInsights).toHaveLength(1)
    expect(result.current.enrichedInsights[0].title).toBe('My Insight')
  })

  it('hasEnrichments becomes true and enrichmentCount increases after WS enrichment', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'count-test' })
    const enrichment = makeEnrichment({ insightId: 'count-test' })

    const { result } = renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(result.current.hasEnrichments).toBe(true)
    expect(result.current.enrichmentCount).toBeGreaterThan(0)
  })
})

// ── Regression: cache TTL, hash dedup, and re-request logic ─────────────────

describe('useInsightEnrichment — cache TTL and hash dedup', () => {
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

  it('does not re-request when insights hash is unchanged and cache is valid', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'dedup-test', severity: 'warning' })

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [makeEnrichment({ insightId: 'dedup-test' })],
        timestamp: new Date().toISOString(),
      }),
    })

    const { unmount } = renderHook(() => useInsightEnrichment([insight]))

    // First request after debounce
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {}) // flush promise
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Re-mount with identical insights — same hash, cache still valid
    renderHook(() => useInsightEnrichment([insight]))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {})

    // Should NOT have made a second request
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('re-requests after cache TTL expires (5 minutes)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'ttl-test', severity: 'info' })

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [makeEnrichment({ insightId: 'ttl-test' })],
        timestamp: new Date().toISOString(),
      }),
    })

    const { unmount } = renderHook(() => useInsightEnrichment([insight]))

    // First request
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Advance past the 5-minute cache TTL
    const CACHE_TTL_MS = 5 * 60_000
    await act(async () => { await vi.advanceTimersByTimeAsync(CACHE_TTL_MS + 1) })

    // Re-mount — cache expired so same hash should trigger new request
    renderHook(() => useInsightEnrichment([insight]))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('re-requests when insights change (different hash)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        enrichments: [],
        timestamp: new Date().toISOString(),
      }),
    })

    const insightA = makeInsight({ id: 'hash-a', severity: 'warning' })
    const { unmount } = renderHook(() => useInsightEnrichment([insightA]))

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {})
    expect(mockFetch).toHaveBeenCalledOnce()

    unmount()

    // Different insight — different hash
    const insightB = makeInsight({ id: 'hash-b', severity: 'critical' })
    renderHook(() => useInsightEnrichment([insightB]))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    await act(async () => {})

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

// ── Regression: multiple enrichments, overwrite, and mixed matching ──────────

describe('useInsightEnrichment — multiple enrichments and overwrite', () => {
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

  it('applies multiple enrichments from a single WS message to different insights', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insights = [
      makeInsight({ id: 'multi-1', title: 'First' }),
      makeInsight({ id: 'multi-2', title: 'Second' }),
      makeInsight({ id: 'multi-3', title: 'Third' }),
    ]

    const { result } = renderHook(() => useInsightEnrichment(insights))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: {
          enrichments: [
            makeEnrichment({ insightId: 'multi-1', description: 'AI desc 1' }),
            makeEnrichment({ insightId: 'multi-3', description: 'AI desc 3' }),
          ],
        },
      })
    })

    expect(result.current.enrichmentCount).toBe(2)
    expect(result.current.enrichedInsights[0].description).toBe('AI desc 1')
    expect(result.current.enrichedInsights[0].source).toBe('ai')
    // multi-2 has no enrichment — should stay heuristic
    expect(result.current.enrichedInsights[1].description).toBe('Heuristic description')
    expect(result.current.enrichedInsights[1].source).toBe('heuristic')
    expect(result.current.enrichedInsights[2].description).toBe('AI desc 3')
    expect(result.current.enrichedInsights[2].source).toBe('ai')
  })

  it('later enrichment overwrites earlier one for the same insight ID', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'overwrite-test' })

    const { result } = renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      // First enrichment
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: {
          enrichments: [
            makeEnrichment({ insightId: 'overwrite-test', description: 'First AI desc', confidence: 60 }),
          ],
        },
      })
    })

    expect(result.current.enrichedInsights[0].description).toBe('First AI desc')
    expect(result.current.enrichedInsights[0].confidence).toBe(60)

    await act(async () => {
      // Second enrichment overwrites
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: {
          enrichments: [
            makeEnrichment({ insightId: 'overwrite-test', description: 'Updated AI desc', confidence: 95 }),
          ],
        },
      })
    })

    expect(result.current.enrichedInsights[0].description).toBe('Updated AI desc')
    expect(result.current.enrichedInsights[0].confidence).toBe(95)
  })
})

// ── Regression: severity edge cases in mergeEnrichments ─────────────────────

describe('mergeEnrichments — severity edge cases', () => {
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

  it('AI upgrades info to warning', async () => {
    const insight = makeInsight({ id: 'sev-info-warn', severity: 'info' })
    const enrichment = makeEnrichment({ insightId: 'sev-info-warn', severity: 'warning' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(mergeEnrichments([insight])[0].severity).toBe('warning')
  })

  it('AI upgrades info to critical', async () => {
    const insight = makeInsight({ id: 'sev-info-crit', severity: 'info' })
    const enrichment = makeEnrichment({ insightId: 'sev-info-crit', severity: 'critical' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(mergeEnrichments([insight])[0].severity).toBe('critical')
  })

  it('AI cannot downgrade critical to info', async () => {
    const insight = makeInsight({ id: 'sev-crit-info', severity: 'critical' })
    const enrichment = makeEnrichment({ insightId: 'sev-crit-info', severity: 'info' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(mergeEnrichments([insight])[0].severity).toBe('critical')
  })

  it('uses heuristic severity when enrichment has no severity field', async () => {
    const insight = makeInsight({ id: 'sev-undef', severity: 'warning' })
    // Enrichment without severity (undefined)
    const enrichment = makeEnrichment({ insightId: 'sev-undef' })
    delete (enrichment as Record<string, unknown>).severity

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const merged = mergeEnrichments([insight])
    expect(merged[0].severity).toBe('warning')
    expect(merged[0].source).toBe('ai')
  })
})

// ── Regression: remediation fallback ────────────────────────────────────────

describe('mergeEnrichments — remediation fallback', () => {
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

  it('keeps original remediation when enrichment remediation is empty string', async () => {
    const insight = makeInsight({ id: 'rem-empty', remediation: 'Original fix' })
    const enrichment = makeEnrichment({ insightId: 'rem-empty', remediation: '' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    // Empty string is falsy, so || fallback triggers
    expect(mergeEnrichments([insight])[0].remediation).toBe('Original fix')
  })

  it('uses enrichment remediation when both exist', async () => {
    const insight = makeInsight({ id: 'rem-both', remediation: 'Original fix' })
    const enrichment = makeEnrichment({ insightId: 'rem-both', remediation: 'AI fix' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(mergeEnrichments([insight])[0].remediation).toBe('AI fix')
  })
})

// ── Regression: HTTP error handling (non-404, network, abort) ───────────────

