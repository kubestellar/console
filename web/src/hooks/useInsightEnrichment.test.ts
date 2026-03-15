import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInsightEnrichment, _resetStateForTest } from './useInsightEnrichment'
import * as useLocalAgent from './useLocalAgent'
import type { MultiClusterInsight } from '../types/insights'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'

// Mock dependencies
vi.mock('./useLocalAgent', () => ({
  isAgentConnected: vi.fn(),
  isAgentUnavailable: vi.fn(),
}))

describe('useInsightEnrichment', () => {
  const mockInsights: MultiClusterInsight[] = [
    {
      id: 'insight-1',
      category: 'event-correlation',
      title: 'Test Insight',
      description: 'Heuristic description',
      severity: 'warning',
      source: 'heuristic',
      affectedClusters: ['cluster-1'],
      detectedAt: new Date().toISOString(),
    },
  ]

  let fetchMock: ReturnType<typeof vi.fn>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeWsMock: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wsConstructorMock: any

  class MockWebSocket {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onopen: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onmessage: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onclose: any = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onerror: any = null
    close = vi.fn()
    send = vi.fn()

    constructor(url: string) {
      wsConstructorMock(url)
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      activeWsMock = this
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    
    // Reset activeWsMock for each test
    activeWsMock = null
    
    // Reset agent status
    vi.spyOn(useLocalAgent, 'isAgentConnected').mockReturnValue(true)
    vi.spyOn(useLocalAgent, 'isAgentUnavailable').mockReturnValue(false)
    
    // Setup globals
    wsConstructorMock = vi.fn()
    vi.stubGlobal('WebSocket', MockWebSocket)

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        enrichments: [
          {
            insightId: 'insight-1',
            description: 'AI description',
            remediation: 'AI remediation',
            severity: 'critical',
            confidence: 'high',
            provider: 'test-ai',
          }
        ]
      })
    })
    global.fetch = fetchMock

    // Reset singleton module state
    _resetStateForTest()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initially returns heuristic insights unchanged', () => {
    const { result } = renderHook(() => useInsightEnrichment(mockInsights))
    expect(result.current.enrichedInsights).toEqual(mockInsights)
    expect(result.current.hasEnrichments).toBe(false)
    expect(result.current.enrichmentCount).toBe(0)
  })

  it('does not connect or fetch if agent disconnected', () => {
    vi.spyOn(useLocalAgent, 'isAgentConnected').mockReturnValue(false)
    
    renderHook(() => useInsightEnrichment(mockInsights))
    
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    
    expect(global.fetch).not.toHaveBeenCalled()
    expect(wsConstructorMock).not.toHaveBeenCalled()
  })

  it('debounces fetch requests and applies enrichments', async () => {
    const { result } = renderHook(() => useInsightEnrichment(mockInsights))
    
    expect(global.fetch).not.toHaveBeenCalled()
    
    // Advance half the debounce time
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(global.fetch).not.toHaveBeenCalled()

    // Advance past debounce time
    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      `${LOCAL_AGENT_HTTP_URL}/insights/enrich`,
      expect.objectContaining({ method: 'POST' })
    )

    // The component should re-render and apply the new state
    expect(result.current.hasEnrichments).toBe(true)
    expect(result.current.enrichmentCount).toBe(1)
    
    const enriched = result.current.enrichedInsights[0]
    expect(enriched.description).toBe('AI description')
    expect(enriched.remediation).toBe('AI remediation')
    expect(enriched.severity).toBe('critical') // Upgraded from warning to critical
    expect(enriched.source).toBe('ai')
  })

  it('handles WebSocket reconnects with exponential backoff', async () => {
    renderHook((props: MultiClusterInsight[]) => useInsightEnrichment(props), {
      initialProps: []
    })
    
    // Wait for useEffect
    await act(async () => { vi.runAllTimers() })
    
    // Initial connection
    expect(wsConstructorMock).toHaveBeenCalledTimes(1)
    
    // Trigger disconnect
    act(() => {
      activeWsMock.onclose()
    })
    
    // First retry (5s)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(wsConstructorMock).toHaveBeenCalledTimes(2)
    
    // Second disconnect + retry (10s)
    act(() => {
      activeWsMock.onclose()
      vi.advanceTimersByTime(10000)
    })
    expect(wsConstructorMock).toHaveBeenCalledTimes(3)
  })

  it('stops retrying WebSocket after max attempts', async () => {
    renderHook((props: MultiClusterInsight[]) => useInsightEnrichment(props), {
      initialProps: []
    })
    
    // Wait for useEffect
    await act(async () => { vi.runAllTimers() })
    
    expect(wsConstructorMock).toHaveBeenCalledTimes(1)
    
    // Fail 5 times (MAX_WS_RECONNECT_ATTEMPTS)
    for (let i = 0; i < 5; i++) {
        act(() => {
            activeWsMock.onclose()
            vi.advanceTimersByTime(120000) // advance enough for max backoff
        })
    }
    
    // 1 initial + 4 retries = 5 calls. The 5th close doesn't schedule a new one.
    expect(wsConstructorMock).toHaveBeenCalledTimes(5)
    
    act(() => {
        vi.advanceTimersByTime(120000)
    })
    
    // Still 5, no more retries
    expect(wsConstructorMock).toHaveBeenCalledTimes(5)
  })
  
  it('applies WebSocket incoming enrichments', async () => {
      const { result } = renderHook((props: MultiClusterInsight[]) => useInsightEnrichment(props), {
        initialProps: mockInsights
      })
      
      // Wait for useEffect
      await act(async () => { vi.runAllTimers() })
      
      // Simulate incoming WS message
      act(() => {
          activeWsMock.onmessage({
              data: JSON.stringify({
                  type: 'insights_enriched',
                  data: {
                      enrichments: [
                          {
                              insightId: 'insight-1',
                              description: 'WS AI update',
                              severity: 'info' // AI says info, heuristic says warning -> should keep warning
                          }
                      ]
                  }
              })
          })
      })
      
      expect(result.current.hasEnrichments).toBe(true)
      const enriched = result.current.enrichedInsights[0]
      expect(enriched.description).toBe('WS AI update')
      // Original heuristic severity 'warning' > AI severity 'info', so it shouldn't downgrade
      expect(enriched.severity).toBe('warning') 
  })

  it('stops requesting HTTP enrichments if endpoint returns 404', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    renderHook(() => useInsightEnrichment(mockInsights))
    
    // First trigger
    await act(async () => {
      vi.advanceTimersByTime(2500)
    })
    
    expect(global.fetch).toHaveBeenCalledTimes(1)
    
    // Try forcing another update (this would reset the requestHash if we had a way to manually trigger, 
    // but the fastest way is to clear mock and try again)
    fetchMock.mockClear()
    
    // Send new insights to trigger again
    const newInsights = [...mockInsights, { ...mockInsights[0], id: 'insight-2' }]
    renderHook(() => useInsightEnrichment(newInsights))
    
    await act(async () => {
      vi.advanceTimersByTime(2500)
    })
    
    // Should NOT call fetch again because endpoint is marked permanently unavailable
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
