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

vi.mock('./useLocalAgent', () => ({
  isAgentConnected: () => mockIsAgentConnected(),
  isAgentUnavailable: () => mockIsAgentUnavailable(),
}))

vi.mock('../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://127.0.0.1:8585',
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
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

// ── mergeEnrichments — empty enrichments map ───────────────────────────────────

describe('mergeEnrichments — empty enrichments', () => {
  let mergeEnrichments: (insights: MultiClusterInsight[]) => MultiClusterInsight[]

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./useInsightEnrichment')
    mergeEnrichments = mod.mergeEnrichments
  })

  it('returns the same array reference when no enrichments exist', () => {
    const insights = [makeInsight()]
    expect(mergeEnrichments(insights)).toBe(insights)
  })

  it('returns insights unchanged when no enrichments exist', () => {
    const insights = [makeInsight()]
    expect(mergeEnrichments(insights)).toEqual(insights)
  })

  it('returns empty array for empty input', () => {
    expect(mergeEnrichments([])).toEqual([])
  })

  it('returns multiple insights unchanged when no enrichments exist', () => {
    const insights = [
      makeInsight({ id: 'a', title: 'Alpha' }),
      makeInsight({ id: 'b', title: 'Beta' }),
    ]
    expect(mergeEnrichments(insights)).toEqual(insights)
  })
})

// ── mergeEnrichments — with enrichments applied via WebSocket ──────────────────

describe('mergeEnrichments — with enrichments', () => {
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

  it('merges AI description, remediation, confidence and provider into matching insight', async () => {
    const insight = makeInsight({ id: 'test-1' })
    const enrichment = makeEnrichment({
      insightId: 'test-1',
      description: 'AI desc',
      remediation: 'Fix it',
      confidence: 90,
      provider: 'gpt-4',
    })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const result = mergeEnrichments([insight])
    expect(result[0].source).toBe('ai')
    expect(result[0].description).toBe('AI desc')
    expect(result[0].remediation).toBe('Fix it')
    expect(result[0].confidence).toBe(90)
    expect(result[0].provider).toBe('gpt-4')
  })

  it('AI can upgrade severity (warning → critical)', async () => {
    const insight = makeInsight({ id: 'sev-up', severity: 'warning' })
    const enrichment = makeEnrichment({ insightId: 'sev-up', severity: 'critical' })

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

  it('AI cannot downgrade severity (warning stays warning when AI says info)', async () => {
    const insight = makeInsight({ id: 'sev-down', severity: 'warning' })
    const enrichment = makeEnrichment({ insightId: 'sev-down', severity: 'info' })

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

  it('critical severity is preserved when AI also says critical', async () => {
    const insight = makeInsight({ id: 'sev-same', severity: 'critical' })
    const enrichment = makeEnrichment({ insightId: 'sev-same', severity: 'critical' })

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

  it('insight without matching enrichment passes through unchanged', async () => {
    const insight = makeInsight({ id: 'no-match' })
    const enrichment = makeEnrichment({ insightId: 'different-id' })

    renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    const result = mergeEnrichments([insight])
    expect(result[0].source).toBe('heuristic')
    expect(result[0].description).toBe('Heuristic description')
  })
})

// ── useInsightEnrichment — agent not connected ─────────────────────────────────

describe('useInsightEnrichment — agent not connected', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(false)
    mockIsAgentUnavailable.mockReturnValue(false)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns insights unchanged when agent is not connected', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insights = [makeInsight()]

    const { result } = renderHook(() => useInsightEnrichment(insights))

    expect(result.current.enrichedInsights).toEqual(insights)
    expect(result.current.hasEnrichments).toBe(false)
    expect(result.current.enrichmentCount).toBe(0)
  })

  it('does not create a WebSocket connection when agent is not connected', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {})

    expect(capturedWsInstances.length).toBe(0)
  })
})

// ── useInsightEnrichment — agent unavailable ────────────────────────────────────

describe('useInsightEnrichment — agent unavailable', () => {
  beforeEach(async () => {
    vi.resetModules()
    capturedWsInstances = []
    mockIsAgentConnected.mockReturnValue(true)
    mockIsAgentUnavailable.mockReturnValue(true)
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('returns insights unchanged when agent is unavailable', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insights = [makeInsight()]

    const { result } = renderHook(() => useInsightEnrichment(insights))

    expect(result.current.enrichedInsights).toEqual(insights)
    expect(result.current.hasEnrichments).toBe(false)
  })

  it('does not create a WebSocket connection when agent is unavailable', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {})

    expect(capturedWsInstances.length).toBe(0)
  })
})

// ── useInsightEnrichment — WebSocket connection and message handling ────────────

describe('useInsightEnrichment — WebSocket connection', () => {
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

  it('creates a WebSocket connection on mount when agent is connected', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {})

    expect(capturedWsInstances.length).toBe(1)
    expect(capturedWsInstances[0].url).toBe('ws://127.0.0.1:8585/ws')
  })

  it('does not create a second WebSocket when one is already open', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    const { rerender } = renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
    })

    rerender()

    expect(capturedWsInstances.length).toBe(1)
  })

  it('processes insights_enriched WebSocket message and updates enriched state', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const insight = makeInsight({ id: 'ws-msg-test' })
    const enrichment = makeEnrichment({ insightId: 'ws-msg-test', description: 'WS AI desc' })

    const { result } = renderHook(() => useInsightEnrichment([insight]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({
        type: 'insights_enriched',
        data: { enrichments: [enrichment] },
      })
    })

    expect(result.current.hasEnrichments).toBe(true)
    expect(result.current.enrichmentCount).toBe(1)
    expect(result.current.enrichedInsights[0].source).toBe('ai')
    expect(result.current.enrichedInsights[0].description).toBe('WS AI desc')
  })

  it('ignores WebSocket messages with an unknown type', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateMessage({ type: 'unknown_type', data: {} })
    })

    expect(result.current.hasEnrichments).toBe(false)
  })

  it('ignores malformed JSON in WebSocket messages without throwing', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')
    const { result } = renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.onmessage?.(
        new MessageEvent('message', { data: 'not-valid-json{{' }),
      )
    })

    expect(result.current.hasEnrichments).toBe(false)
  })

  it('marks WebSocket as closed after an error event', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))

    await act(async () => {
      capturedWsInstances[0]?.simulateOpen()
      capturedWsInstances[0]?.simulateError()
    })

    expect(capturedWsInstances[0].readyState).toBe(MockWebSocket.CLOSED)
  })
})

// ── useInsightEnrichment — exponential backoff ─────────────────────────────────

describe('useInsightEnrichment — exponential backoff', () => {
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

  it('schedules reconnect with 5s delay after first disconnect', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(capturedWsInstances.length).toBe(1)

    act(() => { capturedWsInstances[0].simulateClose() })

    // Advance exactly 5s — reconnect should fire
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

    expect(capturedWsInstances.length).toBe(2)
  })

  it('schedules reconnect with 10s delay after second disconnect', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    // 1st close → 5s reconnect
    act(() => { capturedWsInstances[0].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(capturedWsInstances.length).toBe(2)

    // 2nd close → 10s reconnect
    act(() => { capturedWsInstances[1].simulateClose() })

    // 9 999ms is not enough
    await act(async () => { await vi.advanceTimersByTimeAsync(9_999) })
    expect(capturedWsInstances.length).toBe(2)

    // +1ms completes the 10s window
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(capturedWsInstances.length).toBe(3)
  })

  it('schedules reconnect with 20s delay after third disconnect', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    // 1st close → 5s
    act(() => { capturedWsInstances[0].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

    // 2nd close → 10s
    act(() => { capturedWsInstances[1].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

    // 3rd close → 20s reconnect
    act(() => { capturedWsInstances[2].simulateClose() })

    // 19 999ms is not enough
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999) })
    expect(capturedWsInstances.length).toBe(3)

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(capturedWsInstances.length).toBe(4)
  })

  it('stops reconnecting after max reconnect attempts (5)', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    expect(capturedWsInstances.length).toBe(1)

    // Simulate 4 successful reconnects (delays: 5s, 10s, 20s, 40s)
    const delays = [5_000, 10_000, 20_000, 40_000]
    for (const delay of delays) {
      act(() => {
        capturedWsInstances[capturedWsInstances.length - 1].simulateClose()
      })
      await act(async () => { await vi.advanceTimersByTimeAsync(delay) })
    }

    // After 4 reconnects we have 5 WS instances total
    expect(capturedWsInstances.length).toBe(5)

    // 5th close → wsReconnectAttempts hits MAX (5) → no more setTimeout
    const countBefore = capturedWsInstances.length
    act(() => {
      capturedWsInstances[capturedWsInstances.length - 1].simulateClose()
    })

    await act(async () => { await vi.advanceTimersByTimeAsync(200_000) })

    expect(capturedWsInstances.length).toBe(countBefore)
  })

  it('resets reconnect attempt counter on successful open, allowing fresh reconnects', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    // Close once → reconnect after 5s
    act(() => { capturedWsInstances[0].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(capturedWsInstances.length).toBe(2)

    // Open second WS — resets wsReconnectAttempts to 0
    act(() => { capturedWsInstances[1].simulateOpen() })

    // Close again — should still reconnect after 5 s (attempts reset)
    act(() => { capturedWsInstances[1].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })

    expect(capturedWsInstances.length).toBe(3)
  })

  it('does not reconnect if agent becomes unavailable during backoff', async () => {
    const { useInsightEnrichment } = await import('./useInsightEnrichment')

    renderHook(() => useInsightEnrichment([makeInsight()]))
    await act(async () => { await vi.runAllTimersAsync() })

    // Agent becomes unavailable
    mockIsAgentUnavailable.mockReturnValue(true)

    act(() => { capturedWsInstances[0].simulateClose() })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })

    // No new WS — the close handler bailed early due to unavailable agent
    expect(capturedWsInstances.length).toBe(1)
  })
})

// ── useInsightEnrichment — HTTP enrichment request ────────────────────────────

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
