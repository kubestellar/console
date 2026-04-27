import { describe, it, expect, vi, beforeEach } from 'vitest'
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
}))

vi.mock('../lib/missions/preflightCheck', () => ({
  runPreflightCheck: vi.fn().mockResolvedValue({ ok: true }),
  classifyKubectlError: vi.fn().mockReturnValue({ code: 'UNKNOWN_EXECUTION_FAILURE', message: 'mock' }),
  getRemediationActions: vi.fn().mockReturnValue([]),
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
  localStorage.clear()
  MockWebSocket.lastInstance = null
  vi.clearAllMocks()
  vi.mocked(getDemoMode).mockReturnValue(false)
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

// ── Provider setup ────────────────────────────────────────────────────────────

describe('MissionProvider', () => {
  it('renders children without crashing', () => {
    render(
      <MissionProvider>
        <span>hello</span>
      </MissionProvider>,
    )
    expect(screen.getByText('hello')).toBeTruthy()
  })

  it('useMissions returns safe fallback when used outside MissionProvider', () => {
    const { result } = renderHook(() => useMissions())
    expect(result.current.missions).toEqual([])
    expect(result.current.activeMission).toBeNull()
    expect(result.current.isAIDisabled).toBe(true)
    expect(typeof result.current.startMission).toBe('function')
    expect(result.current.startMission({ title: '', description: '', type: 'troubleshoot', initialPrompt: '' })).toBe('')
  })

  it('exposes the expected context shape', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(Array.isArray(result.current.missions)).toBe(true)
    expect(typeof result.current.startMission).toBe('function')
    expect(typeof result.current.sendMessage).toBe('function')
    expect(typeof result.current.cancelMission).toBe('function')
    expect(typeof result.current.rateMission).toBe('function')
    expect(typeof result.current.toggleSidebar).toBe('function')
  })
})

// ── startMission ──────────────────────────────────────────────────────────────

describe('startMission', () => {
  it('returns a string mission ID', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })
    expect(typeof missionId).toBe('string')
    expect(missionId.length).toBeGreaterThan(0)
  })

  it('creates a mission with status pending initially', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission(defaultParams)
    })
    expect(result.current.missions[0].status).toBe('pending')
  })

  it('appends an initial user message with the prompt text', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission(defaultParams)
    })
    const msg = result.current.missions[0].messages[0]
    expect(msg.role).toBe('user')
    expect(msg.content).toBe(defaultParams.initialPrompt)
  })

  it('sets isSidebarOpen to true after startMission', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)
    act(() => {
      result.current.startMission(defaultParams)
    })
    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('calls emitMissionStarted analytics event', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission(defaultParams)
    })
    expect(emitMissionStarted).toHaveBeenCalledWith('troubleshoot', expect.any(String))
  })

  it('transitions mission to running after WebSocket opens', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('running')
  })

  it('sends a chat message over the WebSocket', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await startMissionWithConnection(result)
    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const msg = JSON.parse(chatCall![0])
    expect(msg.payload.prompt).toBe(defaultParams.initialPrompt)
  })

  it('transitions mission to waiting_input when stream done:true is received', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    expect(result.current.missions[0].status).toBe('waiting_input')
  })

  // #5936 — mission stuck in waiting_input must auto-fail after a watchdog
  // timeout if the backend never delivers a final result message.
  it('auto-fails mission stuck in waiting_input after watchdog timeout (#5936)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { requestId, missionId } = await startMissionWithConnection(result)

      // Stream done but no result — mission enters waiting_input
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: '', done: true },
        })
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('waiting_input')

      // Advance past the 10-minute watchdog (WAITING_INPUT_TIMEOUT_MS = 600_000)
      act(() => {
        vi.advanceTimersByTime(600_000 + 1_000)
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
      expect(systemMessages.some(m => m.content.includes('No response from agent'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears waiting_input watchdog when result message arrives (#5936)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { requestId, missionId } = await startMissionWithConnection(result)

      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: '', done: true },
        })
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('waiting_input')

      // Backend sends final result before the watchdog fires
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'result',
          payload: { content: 'All done.' },
        })
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('completed')

      // Advancing past the watchdog must NOT flip the completed mission to failed
      act(() => {
        vi.advanceTimersByTime(600_000 + 1_000)
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('completed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('calls emitMissionCompleted when result message is received', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Task completed.' },
      })
    })

    expect(emitMissionCompleted).toHaveBeenCalled()
  })

  it('does not duplicate response when stream is followed by result with same content', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Simulate streaming chunks
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'vCluster CLI is installed and upgraded successfully.' },
      })
    })

    // Stream done
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    const messagesAfterStream = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(messagesAfterStream).toHaveLength(1)

    // Now simulate the result message with the same content
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'vCluster CLI is installed and upgraded successfully.' },
      })
    })

    const messagesAfterResult = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    // Should still be 1 assistant message, not 2
    expect(messagesAfterResult).toHaveLength(1)
  })

  it('adds result message when no prior streaming occurred', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Result without prior streaming
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Task completed.' },
      })
    })

    const assistantMessages = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].content).toBe('Task completed.')
  })

  it('transitions mission to failed on error message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'agent_error', message: 'Something went wrong' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.role === 'system')).toBe(true)
  })

  it('calls emitMissionError when an error message is received', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'test_err', message: 'Oops' },
      })
    })

    // #6240: emitMissionError gained an `error_detail` 3rd arg in #6235.
    // Use expect.anything() so this assertion stays valid as the 3rd arg
    // evolves (test exists to verify the type+code, not the message body).
    expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'test_err', expect.anything())
  })

  it('transitions mission to failed when connection cannot be established', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true) // demo mode rejects connection
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.startMission(defaultParams)
    })
    expect(result.current.missions[0].status).toBe('failed')
  })
})
