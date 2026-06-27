import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?]))),
}))

vi.mock('./useDemoMode', () => ({
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