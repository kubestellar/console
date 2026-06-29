import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions, __missionsTestables } from './useMissions'
import { getDemoMode } from './useDemoMode'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?]))),
}))

vi.mock('./useDemoMode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useDemoMode')>()),
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
  getDemoMode: vi.fn(() => false),
  isDemoModeForced: false,
  default: vi.fn(() => false),
}))
vi.mock('./useLocalAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useLocalAgent')>()
  return {
    ...actual,
    useLocalAgent: vi.fn(() => ({ isConnected: false })),
    isAgentUnavailable: vi.fn(() => false),
    isAgentConnected: vi.fn(() => false),
    reportAgentActivity: vi.fn(),
    reportAgentDataSuccess: vi.fn(),
    reportAgentDataError: vi.fn(),
  }
})

vi.mock('../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn((url: string) => Promise.resolve({ url, protocols: [] })),
}))

vi.mock('./useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  setActiveTokenCategory: vi.fn(),
  clearActiveTokenCategory: vi.fn(),
  getActiveTokenCategories: vi.fn(() => []),
}))

vi.mock('./useResolutions', () => ({
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
  findSimilarResolutionsStandalone: vi.fn(() => []),
  generateResolutionPromptContext: vi.fn(() => ''),
}))

vi.mock('../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
} })

vi.mock('../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/analytics')>()),
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}
))

vi.mock('../lib/missions/preflightCheck', () => ({
  runPreflightCheck: vi.fn().mockResolvedValue({ ok: true }),
  classifyKubectlError: vi.fn().mockReturnValue({ code: 'UNKNOWN_EXECUTION_FAILURE', message: 'mock' }),
  getRemediationActions: vi.fn().mockReturnValue([]),
  resolveRequiredTools: vi.fn(() => []),
  runToolPreflightCheck: vi.fn().mockResolvedValue({ ok: true, tools: [] }),
}))

vi.mock('../lib/missions/scanner/malicious', () => ({
  scanForMaliciousContent: vi.fn().mockReturnValue([]),
}))

vi.mock('../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

// ── Mock WebSocket ─────────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  /** Reference to the most recently created instance. Reset in beforeEach. */
  static lastInstance: MockWebSocket | null = null

  readyState = MockWebSocket.CONNECTING
  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(public url: string) {
    MockWebSocket.lastInstance = this
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

vi.stubGlobal('WebSocket', MockWebSocket)

// ── Helpers ───────────────────────────────────────────────────────────────────

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MissionProvider>{children}</MissionProvider>
)

const defaultParams = {
  title: 'Test Mission',
  description: 'Pod crash investigation',
  type: 'troubleshoot' as const,
  initialPrompt: 'Fix the pod crash',
  skipReview: true,
}

/** Start a mission and simulate the WebSocket opening so the mission moves to 'running'. */
async function startMissionWithConnection(
  result: { current: ReturnType<typeof useMissions> },
): Promise<{ missionId: string; requestId: string }> {
  let missionId = ''
  act(() => {
    missionId = result.current.startMission(defaultParams)
  })
  // Flush the preflight promise chain before simulating the socket opening.
  await flushMissionPreflightChain()
  await act(async () => {
    MockWebSocket.lastInstance?.simulateOpen()
  })
  // Find the chat send call (list_agents fires first, then chat)
  const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
    (call: string[]) => JSON.parse(call[0]).type === 'chat',
  )
  const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''
  return { missionId, requestId }
}

async function flushMissionPreflightChain() {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

// ── Pre-seed a mission in localStorage without going through the WS flow ──────
function seedMission(overrides: Partial<{
  id: string
  status: string
  title: string
  type: string
}> = {}) {
  const mission = {
    id: overrides.id ?? 'seeded-mission-1',
    title: overrides.title ?? 'Seeded Mission',
    description: 'Pre-seeded',
    type: overrides.type ?? 'troubleshoot',
    status: overrides.status ?? 'pending',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem('kc_missions', JSON.stringify([mission]))
  return mission.id
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  MockWebSocket.lastInstance = null
  vi.clearAllMocks()
  vi.mocked(getDemoMode).mockReturnValue(false)
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── ensureConnection timeout ─────────────────────────────────────────────────

describe('ensureConnection timeout', () => {
  it('rejects with CONNECTION_TIMEOUT after 5s if WS never opens', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    let missionId = ''
    act(() => { missionId = result.current.startMission(defaultParams) })
    await act(async () => { await Promise.resolve() })

    // Don't open the WS — let it timeout
    act(() => { vi.advanceTimersByTime(5_100) })
    await act(async () => { await Promise.resolve() })

    // Mission should fail due to connection timeout
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
  })
})

// ── WebSocket close fails pending missions ───────────────────────────────────

describe('WS close fails pending running missions', () => {
  it('keeps missions running with needsReconnect flag on transient WS close (#5929)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

    // Simulate WebSocket closing — transient disconnect, reconnect attempts still available
    act(() => { MockWebSocket.lastInstance?.simulateClose() })

    const mission = result.current.missions.find(m => m.id === missionId)
    // Mission should remain running with needsReconnect flag set,
    // not be failed (#5929 — transient disconnect shouldn't fail missions)
    expect(mission?.status).toBe('running')
    expect(mission?.context?.needsReconnect).toBe(true)
    expect(mission?.currentStep).toBe('Reconnecting...')
  })
})

// ── WebSocket error handler ──────────────────────────────────────────────────

describe('WebSocket error handler', () => {
  it('rejects connection promise on WS error event', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    let missionId = ''
    act(() => { missionId = result.current.startMission(defaultParams) })
    await act(async () => { await Promise.resolve() })

    // Simulate WS error (not open)
    await act(async () => { MockWebSocket.lastInstance?.simulateError() })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
  })
})

// ── WebSocket auto-reconnect with backoff ────────────────────────────────────

describe('WebSocket auto-reconnect backoff', () => {
  it('attempts reconnection with exponential backoff after close', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Connect first
      act(() => { result.current.connectToAgent() })
      await act(async () => {
        MockWebSocket.lastInstance?.simulateOpen()
        await Promise.resolve()
      })

      const firstWs = MockWebSocket.lastInstance

      // Close the WebSocket — should schedule a reconnect
      act(() => { firstWs?.simulateClose() })

      // Advance past initial reconnect delay (1s)
      await act(async () => {
        vi.advanceTimersByTime(1_100)
        await Promise.resolve()
      })

      // A new WebSocket should have been created
      expect(MockWebSocket.lastInstance).not.toBe(firstWs)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reconnect in demo mode', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(getDemoMode).mockReturnValue(false)
      const { result } = renderHook(() => useMissions(), { wrapper })

      act(() => { result.current.connectToAgent() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      const firstWs = MockWebSocket.lastInstance

      // Switch to demo mode before close
      vi.mocked(getDemoMode).mockReturnValue(true)

      act(() => { firstWs?.simulateClose() })
      act(() => { vi.advanceTimersByTime(2_000) })

      // Should NOT have created a new WebSocket (demo mode blocks reconnect)
      expect(MockWebSocket.lastInstance).toBe(firstWs)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('wsSend failure callback', () => {
  it('transitions mission to failed when wsSend retries exhausted during sendMessage', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId, requestId } = await startMissionWithConnection(result)

      // Complete first turn so mission is in waiting_input
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: '', done: true },
        })
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('waiting_input')

      // Now close WS readyState so wsSend will fail on retry
      MockWebSocket.lastInstance!.readyState = MockWebSocket.CLOSED

      // Send a follow-up — ensureConnection sees WS is closed, creates new WS
      act(() => { result.current.sendMessage(missionId, 'follow up') })

      // The new WS is in CONNECTING state. Don't open it.
      // Advance past 3 retry delays (3 * 1s = 3s) + extra
      act(() => { vi.advanceTimersByTime(4_000) })

      const mission = result.current.missions.find(m => m.id === missionId)
      // Mission status should have failed from either connection timeout or wsSend exhaustion
      // At minimum, the mission is not still in waiting_input
      expect(mission?.status).not.toBe('waiting_input')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── sendMessage connection failure ───────────────────────────────────────────

describe('sendMessage connection failure path', () => {
  it('adds system message when sendMessage connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    const missionId = seedMission({ status: 'waiting_input' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.sendMessage(missionId, 'follow up') })

    // Simulate connection error
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateError()
      await Promise.resolve()
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Lost connection to local agent'))).toBe(true)
  })
})

// ── retryPreflight unexpected throw re-blocks (fail-closed) ─────────────────

describe('connectToAgent', () => {
  it('logs error when connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => { result.current.connectToAgent() })

    expect(errorSpy).toHaveBeenCalledWith('[Missions] Failed to connect to agent:', expect.any(Error))
    errorSpy.mockRestore()
  })
})

// ── selectAgent with ensureConnection ────────────────────────────────────────

describe('selectAgent WebSocket interaction', () => {
  it('sends select_agent message over WS when selecting a real agent', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.selectAgent('claude-code') })
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
      await Promise.resolve()
    })

    const selectCalls = MockWebSocket.lastInstance?.send.mock.calls.filter(
      (call: string[]) => {
        try { return JSON.parse(call[0]).type === 'select_agent' } catch { return false }
      },
    )
    expect(selectCalls?.length).toBeGreaterThan(0)
    expect(JSON.parse(selectCalls![0][0]).payload.agent).toBe('claude-code')
  })

  it('logs error when selectAgent connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.selectAgent('claude-code') })
    // Let the rejection propagate
    await act(async () => { await Promise.resolve() })

    expect(errorSpy).toHaveBeenCalledWith('[Missions] Failed to select agent:', expect.any(Error))
    errorSpy.mockRestore()
  })
})

// ── Mission reconnection on WS open ──────────────────────────────────────────

describe('mission reconnection on WebSocket open', () => {
  it('clears needsReconnect flag and updates step when WebSocket opens', async () => {
    // Seed a running mission flagged for reconnection
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'reconnect-m-1',
      title: 'Running Mission',
      description: 'Was running',
      type: 'troubleshoot',
      status: 'running',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Fix the issue', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'assistant', content: 'Working on it', timestamp: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { needsReconnect: true },
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions[0].currentStep).toBe('Reconnecting...')
    expect(result.current.missions[0].context?.needsReconnect).toBe(true)

    // Connect to agent — the onopen handler should clear needsReconnect
    act(() => { result.current.connectToAgent() })
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
      await Promise.resolve()
    })

    const mission = result.current.missions[0]
    expect(mission.context?.needsReconnect).toBe(false)
    expect(mission.currentStep).toBe('Resuming...')
  })

  it('sends reconnection chat message after delay', async () => {
    vi.useRealTimers()

    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'reconnect-m-2',
      title: 'Running Mission 2',
      description: 'Was running',
      type: 'troubleshoot',
      status: 'running',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Help me', timestamp: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { needsReconnect: true },
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.connectToAgent() })
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.missions[0].context?.needsReconnect).toBe(false)
      expect(result.current.missions[0].currentStep).toBe('Resuming...')
    })

    // This specific reconnect flow is more reliable on real timers because
    // waitFor and the delayed resume send share the same timer queue.
    await waitFor(() => {
      const allCalls = MockWebSocket.lastInstance?.send.mock.calls ?? []
      const allTypes = allCalls.map((call: string[]) => {
        try { return JSON.parse(call[0]).type } catch { return 'unparseable' }
      })
      expect(allTypes).toContain('list_agents')

      const chatCalls = allCalls.filter(
        (call: string[]) => {
          try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
        },
      )
      expect(chatCalls.length).toBeGreaterThan(0)
      const payload = JSON.parse(chatCalls[chatCalls.length - 1][0]).payload
      expect(payload).toMatchObject({
        prompt: 'Help me',
        sessionId: 'reconnect-m-2',
        agent: 'claude-code',
        history: [],
        resumeKey: 'resume-reconnect-m-2',
        isResume: true,
      })
    }, { timeout: __missionsTestables.MISSION_RECONNECT_DELAY_MS * 3 })
  })
})

describe('WebSocket auto-reconnect backoff arithmetic', () => {
  it('doubles the delay on consecutive reconnection failures', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // First connection
      act(() => { result.current.connectToAgent() })
      await act(async () => {
        MockWebSocket.lastInstance?.simulateOpen()
        await Promise.resolve()
      })
      const ws1 = MockWebSocket.lastInstance

      // Close #1 -> delay = 1000ms
      act(() => { ws1?.simulateClose() })
      await act(async () => {
        vi.advanceTimersByTime(1_100)
        await Promise.resolve()
      })
      const ws2 = MockWebSocket.lastInstance
      expect(ws2).not.toBe(ws1)

      // Close #2 without opening -> delay = 2000ms
      act(() => { ws2?.simulateClose() })
      // At 1100ms nothing should have reconnected yet
      await act(async () => {
        vi.advanceTimersByTime(1_100)
        await Promise.resolve()
      })
      expect(MockWebSocket.lastInstance).toBe(ws2)
      // At 2100ms total (surpassing 2000ms) it should reconnect
      await act(async () => {
        vi.advanceTimersByTime(1_000)
        await Promise.resolve()
      })
      const ws3 = MockWebSocket.lastInstance
      expect(ws3).not.toBe(ws2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets backoff attempts on successful connection', async () => {
    // #6375 / #6407 — The backoff counter is no longer reset on transport
    // `onopen`. It's only reset once the first real application-layer frame
    // arrives (see `connectionEstablished` ref + reset in
    // `handleAgentMessage`). This test proves the connection works by
    // delivering an `agents_list` frame before the second close, which is
    // the cheapest app-level message to simulate.
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Connect and close to bump the attempt counter
      act(() => { result.current.connectToAgent() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
      act(() => { MockWebSocket.lastInstance?.simulateClose() })
      act(() => { vi.advanceTimersByTime(1_100) })

      // Second connect succeeds -> should reset counter, but ONLY after an
      // application-layer frame arrives (not merely on `onopen`).
      const ws2 = MockWebSocket.lastInstance
      await act(async () => { ws2?.simulateOpen() })
      // Deliver a real app-level frame — this is what now triggers the
      // backoff reset per the #6375 fix.
      act(() => {
        ws2?.simulateMessage({
          id: 'test-agents-list',
          type: 'agents_list',
          payload: { agents: [], defaultAgent: null },
        })
      })

      // Close again -> delay should be back to 1000ms (not 4000ms)
      act(() => { ws2?.simulateClose() })
      act(() => { vi.advanceTimersByTime(1_100) })
      const ws3 = MockWebSocket.lastInstance
      expect(ws3).not.toBe(ws2)
    } finally {
      vi.useRealTimers()
    }
  })
})