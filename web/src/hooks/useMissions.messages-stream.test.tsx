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
  localStorage.clear()
  MockWebSocket.lastInstance = null
  vi.clearAllMocks()
  vi.mocked(getDemoMode).mockReturnValue(false)
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('appends a user message to the correct mission', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Transition to waiting_input so sendMessage is not blocked (#5478 guard)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    act(() => {
      result.current.sendMessage(missionId, 'follow-up question')
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    const userMessages = mission?.messages.filter(m => m.role === 'user') ?? []
    expect(userMessages.length).toBeGreaterThanOrEqual(2)
    expect(userMessages[userMessages.length - 1].content).toBe('follow-up question')
  })

  it('sends the message payload over the WebSocket', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Transition to waiting_input so sendMessage is not blocked (#5478 guard)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    const beforeCallCount = MockWebSocket.lastInstance!.send.mock.calls.length

    await act(async () => {
      result.current.sendMessage(missionId, 'another message')
    })

    const newCalls = MockWebSocket.lastInstance!.send.mock.calls.slice(beforeCallCount)
    const chatCall = newCalls.find((call: string[]) => JSON.parse(call[0]).type === 'chat')
    expect(chatCall).toBeDefined()
    expect(JSON.parse(chatCall![0]).payload.prompt).toBe('another message')
  })

  it('is a no-op when the mission does not exist', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const initialMissionCount = result.current.missions.length

    act(() => {
      result.current.sendMessage('nonexistent-id', 'hello')
    })

    expect(result.current.missions.length).toBe(initialMissionCount)
    expect(MockWebSocket.lastInstance?.send).not.toHaveBeenCalled()
  })

  it.each(['stop', 'cancel', 'abort', 'halt', 'quit'])(
    'stop keyword "%s" proxies to cancelMission',
    async keyword => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId } = await startMissionWithConnection(result)

      act(() => {
        result.current.sendMessage(missionId, keyword)
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('cancelling')
      const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
      expect(systemMessages.some(m => m.content.includes('Cancellation requested'))).toBe(true)
    },
  )
})

// ── cancelMission ─────────────────────────────────────────────────────────────

describe('cancelMission', () => {
  it('sets mission status to cancelling with a system message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.cancelMission(missionId)
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelling')
    const lastMsg = mission?.messages[mission.messages.length - 1]
    expect(lastMsg?.role).toBe('system')
    expect(lastMsg?.content).toContain('Cancellation requested')
  })

  it('transitions to cancelled after backend cancel_ack', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.cancelMission(missionId)
    })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Simulate backend acknowledgment
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
    expect(systemMessages.some(m => m.content.includes('Mission cancelled by user.'))).toBe(true)
  })

  it('transitions to cancelled after cancel ack timeout', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId } = await startMissionWithConnection(result)

      act(() => {
        result.current.cancelMission(missionId)
      })
      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

      // Advance past the cancel ack timeout (10s)
      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('cancelled')
      const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
      expect(systemMessages.some(m => m.content.includes('backend did not confirm'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends cancel_chat over WebSocket when connected', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)
    const beforeCallCount = MockWebSocket.lastInstance!.send.mock.calls.length

    act(() => {
      result.current.cancelMission(missionId)
    })

    const newCalls = MockWebSocket.lastInstance!.send.mock.calls.slice(beforeCallCount)
    const cancelCall = newCalls.find((call: string[]) => JSON.parse(call[0]).type === 'cancel_chat')
    expect(cancelCall).toBeDefined()
    expect(JSON.parse(cancelCall![0]).payload.sessionId).toBe(missionId)
  })

  it('does NOT close the WebSocket socket itself when cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.cancelMission(missionId)
    })

    expect(MockWebSocket.lastInstance?.close).not.toHaveBeenCalled()
  })

  it('falls back to HTTP POST when WebSocket is not open', async () => {
    const missionId = seedMission({ status: 'running' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => {
      result.current.cancelMission(missionId)
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cancel-chat'),
      expect.objectContaining({ method: 'POST' }),
    )
    // Should be in cancelling state initially (HTTP response will finalize)
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelling')

    // Let the fetch promise resolve to finalize
    await act(async () => { await Promise.resolve() })
    const missionAfter = result.current.missions.find(m => m.id === missionId)
    expect(missionAfter?.status).toBe('cancelled')
  })
})

// ── Agent management ──────────────────────────────────────────────────────────

describe('agent management', () => {
  it('populates agents[] from agents_list WebSocket message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-1',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude Code', description: '', provider: 'anthropic-local', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    expect(result.current.agents).toHaveLength(1)
    expect(result.current.agents[0].name).toBe('claude-code')
    expect(result.current.defaultAgent).toBe('claude-code')
  })

  it('selectAgent updates selectedAgent state', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => {
      result.current.selectAgent('gemini')
    })
    // Trigger open for the ensureConnection call inside selectAgent
    if (MockWebSocket.lastInstance) {
      await act(async () => {
        MockWebSocket.lastInstance?.simulateOpen()
      })
    }

    expect(result.current.selectedAgent).toBe('gemini')
  })

  it('selectAgent persists selection to localStorage', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => {
      result.current.selectAgent('none')
    })

    expect(localStorage.getItem('kc_selected_agent')).toBe('none')
  })

  it('isAIDisabled is true when selectedAgent is "none"', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => {
      result.current.selectAgent('none')
    })

    expect(result.current.isAIDisabled).toBe(true)
  })

  it('isAIDisabled is false when a real agent is selected', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    // Default state: no agent selected yet → AI should be disabled
    expect(result.current.isAIDisabled).toBe(true)

    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-2',
        type: 'agents_list',
        payload: {
          agents: [{ name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true }],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    expect(result.current.isAIDisabled).toBe(false)
  })

  it('updates selectedAgent from agent_selected WebSocket message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'sel-1',
        type: 'agent_selected',
        payload: { agent: 'openai-gpt4' },
      })
    })

    expect(result.current.selectedAgent).toBe('openai-gpt4')
  })
})
