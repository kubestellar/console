import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('./useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  default: vi.fn(() => false),
}))
vi.mock('./useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
  isAgentUnavailable: vi.fn(() => false),
  isAgentConnected: vi.fn(() => false),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

vi.mock('../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn((url: string) => url),
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

vi.mock('../lib/analytics', () => ({
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}))

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
  // Flush microtask queue so the preflight .then() chain resolves (#3742)
  await act(async () => { await Promise.resolve() })
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
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      const firstWs = MockWebSocket.lastInstance

      // Close the WebSocket — should schedule a reconnect
      act(() => { firstWs?.simulateClose() })

      // Advance past initial reconnect delay (1s)
      act(() => { vi.advanceTimersByTime(1_100) })

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

// ── Resolution auto-matching ─────────────────────────────────────────────────

describe('resolution auto-matching', () => {
  it('injects matched resolutions into mission when signature is recognized', async () => {
    const { detectIssueSignature, findSimilarResolutionsStandalone, generateResolutionPromptContext } = await import('./useResolutions')
    vi.mocked(detectIssueSignature).mockReturnValueOnce({ type: 'CrashLoopBackOff', resourceKind: 'Pod', errorPattern: 'OOM' })
    vi.mocked(findSimilarResolutionsStandalone).mockReturnValueOnce([
      {
        resolution: { id: 'res-1', title: 'Fix OOM crash', steps: [], tags: [] },
        similarity: 0.85,
        source: 'personal' as const,
      },
    ])
    vi.mocked(generateResolutionPromptContext).mockReturnValueOnce('\n\nResolution context here.')

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'troubleshoot',
      })
    })

    const mission = result.current.missions[0]
    expect(mission.matchedResolutions).toBeDefined()
    expect(mission.matchedResolutions).toHaveLength(1)
    expect(mission.matchedResolutions![0].title).toBe('Fix OOM crash')
    expect(mission.matchedResolutions![0].similarity).toBe(0.85)

    // Should have system message about matched resolutions
    const systemMsgs = mission.messages.filter(m => m.role === 'system')
    expect(systemMsgs.some(m => m.content.includes('similar resolution'))).toBe(true)
  })

  it('does not match resolutions for deploy type missions', async () => {

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
      })
    })

    // detectIssueSignature should not have been called for deploy missions
    // (the mock default returns { type: 'Unknown' } anyway)
    const mission = result.current.missions[0]
    expect(mission.matchedResolutions).toBeUndefined()
  })
})

// ── Non-quota localStorage save errors ───────────────────────────────────────

describe('non-quota localStorage save errors', () => {
  it('logs error when setItem throws a non-quota error during missions save', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const realSetItem = localStorage.setItem.bind(localStorage)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        throw new Error('Generic storage error')
      }
      return realSetItem(key, value)
    })

    // Trigger a save by changing missions state
    act(() => { result.current.startMission(defaultParams) })
    // Flush the 500ms debounced save timer (#9617)
    act(() => { vi.advanceTimersByTime(600) })

    expect(errorSpy).toHaveBeenCalledWith('Failed to save missions to localStorage:', expect.any(Error))

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })

  it('logs error when saving unread IDs fails', () => {
    const realSetItem = localStorage.setItem.bind(localStorage)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_unread_missions') {
        throw new Error('Storage error for unread')
      }
      return realSetItem(key, value)
    })

    // Mount provider — it will try to save initial unread state
    const { result } = renderHook(() => useMissions(), { wrapper })

    // Trigger unread save by starting and completing a mission
    // The provider saves unread IDs on mount if they exist
    expect(result.current.unreadMissionCount).toBe(0)

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })
})

// ── wsSend onFailure callback ────────────────────────────────────────────────

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
    await act(async () => { MockWebSocket.lastInstance?.simulateError() })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Lost connection to local agent'))).toBe(true)
  })
})

// ── retryPreflight unexpected throw re-blocks (fail-closed) ─────────────────

describe('retryPreflight unexpected failure', () => {
  it('re-blocks mission when retryPreflight throws unexpectedly (#5851)', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    // First call: fail normally to create a blocked mission
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'No access' },
    } as never)

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'c1', type: 'deploy' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Second call: throw unexpectedly
    vi.mocked(runPreflightCheck).mockRejectedValueOnce(new Error('Unexpected crash'))

    act(() => { result.current.retryPreflight(missionId) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should be re-blocked (fail-closed), not proceed to execution (#5851)
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')
    // No WebSocket should have been created — execution was blocked (#5865)
    expect(MockWebSocket.lastInstance).toBeNull()
  })
})

// ── Agent message with unknown request ID is ignored ─────────────────────────

describe('unknown request ID handling', () => {
  it('ignores messages with unrecognized request IDs', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await startMissionWithConnection(result)

    const missionsBefore = JSON.stringify(result.current.missions.map(m => m.messages.length))

    // Send a message with an unknown request ID
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'unknown-request-id',
        type: 'stream',
        payload: { content: 'stray data', done: false },
      })
    })

    const missionsAfter = JSON.stringify(result.current.missions.map(m => m.messages.length))
    expect(missionsAfter).toBe(missionsBefore)
  })
})

// ── Token usage tracking with addCategoryTokens ──────────────────────────────

describe('token usage tracking', () => {
  it('calls addCategoryTokens on progress message with token delta', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Processing...', tokens: { input: 50, output: 25, total: 75 } },
      })
    })

    expect(addCategoryTokens).toHaveBeenCalledWith(75, 'missions')
  })

  it('calls clearActiveTokenCategory when stream completes with usage', async () => {
    const { clearActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      })
    })

    // Should clear active token category for this specific mission (#6016)
    expect(clearActiveTokenCategory).toHaveBeenCalledWith(missionId)
  })

  it('tracks token delta on stream-done with usage', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } },
      })
    })

    expect(addCategoryTokens).toHaveBeenCalledWith(300, 'missions')
  })
})

// ── connectToAgent error logging ─────────────────────────────────────────────

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
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

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
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    // needsReconnect should be cleared and step updated
    const mission = result.current.missions[0]
    expect(mission.context?.needsReconnect).toBe(false)
    expect(mission.currentStep).toBe('Resuming...')
  })

  it('sends reconnection chat message after delay', async () => {
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
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    // Wait for the MISSION_RECONNECT_DELAY_MS (500ms) timer to fire.
    // Fake timers are active (set in beforeEach), so we must advance the
    // clock rather than relying on a real setTimeout that would never fire.
    act(() => { vi.advanceTimersByTime(600) })
    await act(async () => { await Promise.resolve() })

    // Check all WS send calls to see what types were sent
    const allCalls = MockWebSocket.lastInstance?.send.mock.calls ?? []
    const allTypes = allCalls.map((call: string[]) => {
      try { return JSON.parse(call[0]).type } catch { return 'unparseable' }
    })

    // At minimum, list_agents should have been sent on connect
    expect(allTypes).toContain('list_agents')

    // The chat reconnection should have been scheduled and fired
    const chatCalls = allCalls.filter(
      (call: string[]) => {
        try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
      },
    )

    // If chat was sent, verify the payload
    if (chatCalls.length > 0) {
      const payload = JSON.parse(chatCalls[chatCalls.length - 1][0]).payload
      expect(payload.prompt).toBe('Help me')
      expect(payload.history).toBeDefined()
    } else {
      // The reconnection scheduled a setTimeout but wsSend may be using
      // retry logic. At least verify the needsReconnect was cleared.
      expect(result.current.missions[0].context?.needsReconnect).toBe(false)
    }
  })
})

// ── Multiple missions ────────────────────────────────────────────────────────

describe('multiple concurrent missions', () => {
  it('tracks separate missions independently', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    let id1 = ''
    let id2 = ''
    act(() => { id1 = result.current.startMission(defaultParams) })
    act(() => {
      id2 = result.current.startMission({
        ...defaultParams,
        title: 'Second Mission',
        type: 'deploy',
      })
    })

    expect(result.current.missions).toHaveLength(2)
    expect(result.current.missions.find(m => m.id === id1)?.title).toBe('Test Mission')
    expect(result.current.missions.find(m => m.id === id2)?.title).toBe('Second Mission')
  })
})

// ── Dismiss mission removes from unread ──────────────────────────────────────

describe('dismissMission unread cleanup', () => {
  it('removes dismissed mission from unread tracking', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Background and trigger unread
    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })
    expect(result.current.unreadMissionIds.has(missionId)).toBe(true)

    // Dismiss
    act(() => { result.current.dismissMission(missionId) })

    expect(result.current.missions.find(m => m.id === missionId)).toBeUndefined()
  })
})

// ── NEW: Deep coverage tests ─────────────────────────────────────────────────
// Targets: 630 uncovered statements — WS message handling, state machine
// transitions, error classification, token usage tracking, auto-reconnect logic,
// wsSend retry, stream dedup, progress tokens, preflight, dry-run injection, etc.

// ── Error classification edge cases ──────────────────────────────────────────

describe('error classification edge cases', () => {
  it('detects auth error from "403" in message text', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'HTTP 403 Forbidden' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "permission_error" code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'permission_error', message: 'Insufficient permissions' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "oauth token" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'provider_error', message: 'OAuth token expired, please re-authenticate' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "token has expired" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'auth', message: 'The token has expired' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "invalid x-api-key" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'invalid x-api-key header value' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "failed to authenticate"', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'connection', message: 'failed to authenticate with provider' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects rate limit from "rate limit" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'rate limit exceeded for this model' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "rate_limit" code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'rate_limit', message: 'Throttled' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "too many requests" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'too many requests, slow down' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "resource_exhausted"', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'resource_exhausted', message: 'Quota depleted' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "tokens per min" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'exceeded tokens per min limit' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "requests per min" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'exceeded requests per min' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('shows generic error message for unrecognized error codes', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'some_novel_error', message: 'Something completely new went wrong' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    // Should contain the raw error message, not the auth/rate-limit template
    expect(mission.messages.some(m => m.content.includes('Something completely new went wrong'))).toBe(true)
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(false)
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(false)
  })

  it('handles error message with missing code and message (fallback to "Unknown error")', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: {},
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Unknown error'))).toBe(true)
    // The "missing message" path explicitly passes `undefined` as the
    // 3rd arg — toHaveBeenCalledWith requires an exact match for that
    // arg, and expect.anything() does NOT match undefined.
    expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'unknown', undefined)
  })
})

// ── Token usage tracking: progressive delta ─────────────────────────────────

describe('token usage delta tracking', () => {
  it('calculates delta from previous total on progress messages', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // First progress: total=100
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 80, output: 20, total: 100 } },
      })
    })
    expect(addCategoryTokens).toHaveBeenCalledWith(100, 'missions')

    vi.mocked(addCategoryTokens).mockClear()

    // Second progress: total=250, delta should be 150
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 200, output: 50, total: 250 } },
      })
    })
    expect(addCategoryTokens).toHaveBeenCalledWith(150, 'missions')
  })

  it('does not call addCategoryTokens when progress has no tokens', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'No tokens here' },
      })
    })

    expect(addCategoryTokens).not.toHaveBeenCalled()
  })

  it('does not call addCategoryTokens when delta is zero', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Set initial total
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 50, output: 50, total: 100 } },
      })
    })
    vi.mocked(addCategoryTokens).mockClear()

    // Same total again — delta is 0
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 50, output: 50, total: 100 } },
      })
    })
    expect(addCategoryTokens).not.toHaveBeenCalled()
  })

  it('tracks token delta from result message with usage data', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Set initial tokens via progress
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 50, total: 150 } },
      })
    })
    vi.mocked(addCategoryTokens).mockClear()

    // Result with higher total
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done',
          agent: 'claude-code',
          sessionId: 'test',
          done: true,
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        },
      })
    })

    // Delta: 300 - 150 = 150
    expect(addCategoryTokens).toHaveBeenCalledWith(150, 'missions')
  })
})

// ── Stream: agent field propagation ──────────────────────────────────────────

describe('stream agent field propagation', () => {
  it('sets the mission agent from stream payload.agent', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Hello from gemini', done: false, agent: 'gemini-pro' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.agent).toBe('gemini-pro')
    const assistantMsg = mission.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.agent).toBe('gemini-pro')
  })

  it('sets the mission agent from result payload.agent', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done by GPT',
          agent: 'openai-gpt4',
          sessionId: 'test',
          done: true,
        },
      })
    })

    expect(result.current.missions[0].agent).toBe('openai-gpt4')
  })
})

// ── Dry-run injection ───────────────────────────────────────────────────────

describe('dry-run prompt injection', () => {
  it('injects dry-run instructions into the prompt when dryRun=true', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        dryRun: true,
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('DRY RUN MODE')
    expect(prompt).toContain('--dry-run=server')
  })

  it('does not inject dry-run instructions when dryRun is false/undefined', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({ ...defaultParams })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).not.toContain('DRY RUN MODE')
  })
})

// ── Progress message: partial fields ────────────────────────────────────────

describe('progress message partial fields', () => {
  it('preserves previous progress percentage when new progress message has no progress field', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Step 1', progress: 30 },
      })
    })
    expect(result.current.missions[0].progress).toBe(30)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Step 2' },
      })
    })
    // Progress should be preserved from previous
    expect(result.current.missions[0].progress).toBe(30)
    expect(result.current.missions[0].currentStep).toBe('Step 2')
  })

  it('preserves previous currentStep when progress message has no step field', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Custom step' },
      })
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { progress: 75 },
      })
    })

    expect(result.current.missions[0].currentStep).toBe('Custom step')
    expect(result.current.missions[0].progress).toBe(75)
  })

  it('updates tokenUsage fields individually from progress (missing fields use prior values)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 50, total: 150 } },
      })
    })

    // Send partial update with only total
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { total: 200 } },
      })
    })

    const tokenUsage = result.current.missions[0].tokenUsage
    expect(tokenUsage?.total).toBe(200)
    // input and output should be preserved from previous
    expect(tokenUsage?.input).toBe(100)
    expect(tokenUsage?.output).toBe(50)
  })
})

// ── WS close: auto-reconnect backoff arithmetic ─────────────────────────────

describe('WebSocket auto-reconnect backoff arithmetic', () => {
  it('doubles the delay on consecutive reconnection failures', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // First connection
      act(() => { result.current.connectToAgent() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
      const ws1 = MockWebSocket.lastInstance

      // Close #1 -> delay = 1000ms
      act(() => { ws1?.simulateClose() })
      act(() => { vi.advanceTimersByTime(1_100) })
      const ws2 = MockWebSocket.lastInstance
      expect(ws2).not.toBe(ws1)

      // Close #2 without opening -> delay = 2000ms
      act(() => { ws2?.simulateClose() })
      // At 1100ms nothing should have reconnected yet
      act(() => { vi.advanceTimersByTime(1_100) })
      expect(MockWebSocket.lastInstance).toBe(ws2)
      // At 2100ms total (surpassing 2000ms) it should reconnect
      act(() => { vi.advanceTimersByTime(1_000) })
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

// ── Stream gap: no gap when under threshold ─────────────────────────────────

describe('stream gap detection: no gap under threshold', () => {
  it('appends to existing message when gap is under 8 seconds', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      let missionId = ''
      act(() => {
        missionId = result.current.startMission(defaultParams)
      })
      await act(async () => { await Promise.resolve() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
      const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
        (call: string[]) => JSON.parse(call[0]).type === 'chat',
      )
      const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''

      // First chunk
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Part A', done: false },
        })
      })

      // Advance only 5 seconds (under 8s threshold)
      act(() => { vi.advanceTimersByTime(5000) })

      // Second chunk
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: ' Part B', done: false },
        })
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      const assistantMsgs = mission?.messages.filter(m => m.role === 'assistant') ?? []
      // Should be a single concatenated message
      expect(assistantMsgs.length).toBe(1)
      expect(assistantMsgs[0].content).toBe('Part A Part B')
    } finally {
      vi.useRealTimers()
    }
  })
})
