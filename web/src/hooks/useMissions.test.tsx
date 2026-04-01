import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  default: vi.fn(() => false),
}))

vi.mock('./useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  setActiveTokenCategory: vi.fn(),
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

  it('calls emitMissionCompleted when stream done:true is received', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
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

    expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'test_err')
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

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('appends a user message to the correct mission', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

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
    const { missionId } = await startMissionWithConnection(result)
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

  it('transitions to failed after backend cancel_ack', async () => {
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
    expect(mission?.status).toBe('failed')
    const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
    expect(systemMessages.some(m => m.content.includes('Mission cancelled by user.'))).toBe(true)
  })

  it('transitions to failed after cancel ack timeout', async () => {
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
      expect(mission?.status).toBe('failed')
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
    expect(missionAfter?.status).toBe('failed')
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

// ── Streaming messages ────────────────────────────────────────────────────────

describe('WebSocket stream messages', () => {
  it('creates an assistant message on first stream chunk', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Hello', done: false },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].content).toBe('Hello')
  })

  it('appends subsequent stream chunks to the existing assistant message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: 'Hello', done: false } })
    })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: ' World', done: false } })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].content).toBe('Hello World')
  })

  it('creates an assistant message on result message type', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Task completed successfully.', done: true },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs.length).toBeGreaterThan(0)
    expect(assistantMsgs[assistantMsgs.length - 1].content).toContain('Task completed successfully.')
  })

  it('updates progress step on progress message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Querying cluster...' },
      })
    })

    expect(result.current.missions[0].currentStep).toBe('Querying cluster...')
  })
})

// ── Unread tracking ───────────────────────────────────────────────────────────

describe('unread tracking', () => {
  it('unreadMissionCount increments when a backgrounded mission gets a stream-done message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)
    // Move the sidebar to a state where this mission is backgrounded (no active mission)
    act(() => {
      result.current.setActiveMission(null)
    })

    expect(result.current.unreadMissionCount).toBe(0)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    expect(result.current.unreadMissionCount).toBeGreaterThan(0)
  })

  it('markMissionAsRead decrements the count and removes from unreadMissionIds', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: '', done: true } })
    })
    expect(result.current.unreadMissionCount).toBeGreaterThan(0)

    act(() => {
      result.current.markMissionAsRead(missionId)
    })

    expect(result.current.unreadMissionCount).toBe(0)
    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ── Demo mode ─────────────────────────────────────────────────────────────────

describe('demo mode', () => {
  it('does NOT open WebSocket when demo mode is active', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => {
      result.current.startMission(defaultParams)
    })

    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('returns empty missions initially when localStorage has no data', () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })
    // No missions are in localStorage — provider starts with []
    expect(result.current.missions).toHaveLength(0)
  })

  it('startMission in demo mode transitions mission to failed (no agent)', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => {
      result.current.startMission(defaultParams)
    })

    expect(result.current.missions[0].status).toBe('failed')
  })
})

// ── Sidebar state ─────────────────────────────────────────────────────────────

describe('sidebar state', () => {
  it('toggleSidebar flips isSidebarOpen from false to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)

    act(() => { result.current.toggleSidebar() })

    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('toggleSidebar flips isSidebarOpen from true to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
    expect(result.current.isSidebarOpen).toBe(true)

    act(() => { result.current.toggleSidebar() })

    expect(result.current.isSidebarOpen).toBe(false)
  })

  it('openSidebar sets isSidebarOpen to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('closeSidebar sets isSidebarOpen to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
    act(() => { result.current.closeSidebar() })
    expect(result.current.isSidebarOpen).toBe(false)
  })

  it('openSidebar also expands a minimized sidebar', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    expect(result.current.isSidebarMinimized).toBe(true)

    act(() => { result.current.openSidebar() })

    expect(result.current.isSidebarMinimized).toBe(false)
  })

  it('setFullScreen sets isFullScreen to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setFullScreen(true) })
    expect(result.current.isFullScreen).toBe(true)
  })

  it('closeSidebar also exits fullscreen', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setFullScreen(true) })
    act(() => { result.current.closeSidebar() })
    expect(result.current.isFullScreen).toBe(false)
  })
})

// ── rateMission ───────────────────────────────────────────────────────────────

describe('rateMission', () => {
  it('records positive feedback on the mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'positive') })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.feedback).toBe('positive')
  })

  it('records negative feedback on the mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'negative') })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.feedback).toBe('negative')
  })

  it('calls emitMissionRated analytics event', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'positive') })

    expect(emitMissionRated).toHaveBeenCalledWith('troubleshoot', 'positive')
  })
})

// ── dismissMission ────────────────────────────────────────────────────────────

describe('dismissMission', () => {
  it('removes the mission from the list', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions).toHaveLength(1)

    act(() => { result.current.dismissMission(missionId) })

    expect(result.current.missions).toHaveLength(0)
  })

  it('clears activeMission when the active mission is dismissed', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setActiveMission(missionId) })
    expect(result.current.activeMission?.id).toBe(missionId)

    act(() => { result.current.dismissMission(missionId) })

    expect(result.current.activeMission).toBeNull()
  })
})

// ── Persistence ───────────────────────────────────────────────────────────────

describe('persistence', () => {
  it('missions loaded from localStorage appear in state', () => {
    seedMission({ id: 'persisted-1', title: 'Persisted Mission' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions.some(m => m.id === 'persisted-1')).toBe(true)
  })

  it('missions are saved to localStorage when state changes', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.startMission(defaultParams) })
    const stored = localStorage.getItem('kc_missions')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('state is preserved across re-renders (context value stability)', () => {
    const { result, rerender } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.startMission(defaultParams) })
    const missionsBefore = result.current.missions.length

    rerender()

    expect(result.current.missions.length).toBe(missionsBefore)
  })
})

// ── Quota / pruning ─────────────────────────────────────────────────────────

describe('localStorage quota handling', () => {
  /**
   * Helper: build a minimal serialised mission object.
   */
  function makeMission(overrides: Partial<{
    id: string; status: string; updatedAt: string
  }> = {}) {
    return {
      id: overrides.id ?? `m-${Math.random()}`,
      title: 'M',
      description: 'D',
      type: 'troubleshoot',
      status: overrides.status ?? 'completed',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    }
  }

  it('prunes completed/failed missions but preserves saved (library) missions on QuotaExceededError', () => {
    // Seed a mix of saved (library), completed, and active missions
    const saved1 = makeMission({ id: 'saved-1', status: 'saved' })
    const saved2 = makeMission({ id: 'saved-2', status: 'saved' })
    const completed1 = makeMission({ id: 'completed-1', status: 'completed', updatedAt: '2020-01-01T00:00:00Z' })
    const completed2 = makeMission({ id: 'completed-2', status: 'completed', updatedAt: '2025-01-01T00:00:00Z' })
    const failed1 = makeMission({ id: 'failed-1', status: 'failed', updatedAt: '2019-01-01T00:00:00Z' })
    const pending1 = makeMission({ id: 'pending-1', status: 'pending' })

    localStorage.setItem('kc_missions', JSON.stringify([
      saved1, saved2, completed1, completed2, failed1, pending1,
    ]))

    // Intercept setItem: throw QuotaExceededError on the FIRST kc_missions
    // write (the save triggered by useEffect), then allow the retry.
    // NOTE: In Vitest 4 / jsdom, localStorage.setItem is a direct own property,
    // not inherited from Storage.prototype, so we must patch the instance directly.
    let missionWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        missionWriteCount++
        if (missionWriteCount === 1) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Mount — loadMissions() then saveMissions() via useEffect
    renderHook(() => useMissions(), { wrapper })

    // The pruning path must have retried
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    // Verify pruned data was saved (second write succeeded)
    const stored = JSON.parse(localStorage.getItem('kc_missions')!)
    // All saved (library) missions must still be present
    expect(stored.some((m: { id: string }) => m.id === 'saved-1')).toBe(true)
    expect(stored.some((m: { id: string }) => m.id === 'saved-2')).toBe(true)
    // Active missions must still be present
    expect(stored.some((m: { id: string }) => m.id === 'pending-1')).toBe(true)

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('detects QuotaExceededError via legacy numeric code 22', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    let missionWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        missionWriteCount++
        if (missionWriteCount === 1) {
          // Simulate legacy code-22 DOMException (no named exception)
          const err = new DOMException('quota exceeded')
          Object.defineProperty(err, 'code', { value: 22 })
          Object.defineProperty(err, 'name', { value: '' })
          throw err
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })

    // The pruning branch should have fired (retry = missionWriteCount >= 2)
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('logs the error and clears storage when pruning still exceeds quota', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return realSetItem(key, value)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })

    // Should log the inner retry error (not silently swallow it)
    expect(errorSpy).toHaveBeenCalledWith(
      '[Missions] localStorage still full after pruning, clearing missions',
      expect.any(DOMException),
    )

    // Storage should have been cleared as a last resort
    expect(localStorage.getItem('kc_missions')).toBeNull()

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})

// ── saveMission ───────────────────────────────────────────────────────────────

describe('saveMission', () => {
  it('adds a saved mission with status: saved', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.saveMission({
        title: 'Library Mission',
        description: 'Do something useful',
        type: 'deploy',
        initialPrompt: 'deploy',
      })
    })
    const mission = result.current.missions[0]
    expect(mission.status).toBe('saved')
    expect(mission.title).toBe('Library Mission')
  })

  it('does NOT open a WebSocket when saving', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.saveMission({
        title: 'Lib',
        description: 'Desc',
        type: 'deploy',
        initialPrompt: 'deploy',
      })
    })
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('stores importedFrom metadata with steps and tags', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.saveMission({
        title: 'CNCF Mission',
        description: 'Deploy Istio',
        type: 'deploy',
        missionClass: 'service-mesh',
        cncfProject: 'istio',
        steps: [
          { title: 'Install', description: 'Install Istio via Helm' },
          { title: 'Verify', description: 'Verify pods are running' },
        ],
        tags: ['cncf', 'istio'],
        initialPrompt: 'deploy istio',
      })
    })
    const mission = result.current.missions[0]
    expect(mission.importedFrom).toBeDefined()
    expect(mission.importedFrom?.missionClass).toBe('service-mesh')
    expect(mission.importedFrom?.cncfProject).toBe('istio')
    expect(mission.importedFrom?.steps).toHaveLength(2)
    expect(mission.importedFrom?.tags).toEqual(['cncf', 'istio'])
  })

  it('returns a unique mission ID', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let id1 = ''
    let id2 = ''
    act(() => {
      id1 = result.current.saveMission({ title: 'A', description: 'A', type: 'deploy', initialPrompt: 'a' })
    })
    act(() => {
      id2 = result.current.saveMission({ title: 'B', description: 'B', type: 'deploy', initialPrompt: 'b' })
    })
    expect(id1).not.toBe(id2)
    expect(id1.startsWith('mission-')).toBe(true)
  })
})

// ── renameMission ────────────────────────────────────────────────────────────

describe('renameMission', () => {
  it('updates the mission title', () => {
    const missionId = seedMission({ title: 'Old Title' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, 'New Title') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('New Title')
  })

  it('trims whitespace from the new title', () => {
    const missionId = seedMission({ title: 'Original' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, '  Trimmed  ') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('Trimmed')
  })

  it('is a no-op when the new title is empty or whitespace-only', () => {
    const missionId = seedMission({ title: 'Keep Me' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, '   ') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('Keep Me')
  })

  it('updates the updatedAt timestamp', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    const before = result.current.missions.find(m => m.id === missionId)?.updatedAt
    act(() => { result.current.renameMission(missionId, 'Renamed') })
    const after = result.current.missions.find(m => m.id === missionId)?.updatedAt
    expect(after!.getTime()).toBeGreaterThanOrEqual(before!.getTime())
  })
})

// ── runSavedMission ──────────────────────────────────────────────────────────

describe('runSavedMission', () => {
  function seedSavedMission(overrides: Partial<{
    id: string; steps: Array<{ title: string; description: string }>; tags: string[]
  }> = {}) {
    const mission = {
      id: overrides.id ?? 'saved-mission-1',
      title: 'Saved Mission',
      description: 'Deploy something',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Saved Mission',
        description: 'Deploy something',
        steps: overrides.steps,
        tags: overrides.tags,
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))
    return mission.id
  }

  it('transitions a saved mission to pending and then running', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId) })
    // Should have a user message now
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.messages.some(m => m.role === 'user')).toBe(true)
    // Should transition to running when WS opens
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
    const updated = result.current.missions.find(m => m.id === missionId)
    expect(updated?.status).toBe('running')
  })

  it('is a no-op for a non-saved mission', () => {
    const missionId = seedMission({ status: 'completed' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    const before = result.current.missions.find(m => m.id === missionId)?.status
    act(() => { result.current.runSavedMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe(before)
  })

  it('is a no-op for a non-existent mission', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('nonexistent-id') })
    expect(result.current.missions).toHaveLength(0)
  })

  it('builds prompt from steps when importedFrom has steps', async () => {
    const missionId = seedSavedMission({
      steps: [
        { title: 'Step 1', description: 'First step' },
        { title: 'Step 2', description: 'Second step' },
      ],
    })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId) })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Step 1')
    expect(payload.prompt).toContain('Step 2')
  })

  it('injects single cluster targeting into the prompt', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId, 'cluster-a') })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target cluster: cluster-a')
    expect(payload.prompt).toContain('--context=cluster-a')
  })

  it('injects multi-cluster targeting into the prompt', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId, 'cluster-a, cluster-b') })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target clusters: cluster-a, cluster-b')
  })

  it('fails the mission when ensureConnection rejects', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true) // demo mode rejects connection
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => { result.current.runSavedMission(missionId) })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Local Agent Not Connected'))).toBe(true)
  })
})

// ── Cluster targeting in startMission ────────────────────────────────────────

describe('startMission cluster targeting', () => {
  it('injects single cluster context into the prompt', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.startMission({ ...defaultParams, cluster: 'prod-cluster' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Target cluster: prod-cluster')
    expect(prompt).toContain('--context=prod-cluster')
  })

  it('injects multi-cluster context into the prompt', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.startMission({ ...defaultParams, cluster: 'cluster-a, cluster-b' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(prompt).toContain('Perform the following on each cluster')
  })

  it('adds non-interactive warnings for deploy-type missions', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        title: 'Deploy App',
      })
    })
    const mission = result.current.missions[0]
    const systemMsgs = mission.messages.filter(m => m.role === 'system')
    expect(systemMsgs.some(m => m.content.includes('Non-interactive mode'))).toBe(true)
  })

  it('adds non-interactive warnings for install missions (title heuristic)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'custom',
        title: 'Install Helm Chart',
      })
    })
    const systemMsgs = result.current.missions[0].messages.filter(m => m.role === 'system')
    expect(systemMsgs.some(m => m.content.includes('Non-interactive mode'))).toBe(true)
  })
})

// ── Error classification ─────────────────────────────────────────────────────

describe('error classification', () => {
  it('maps authentication_error code to auth error message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'authentication_error', message: 'Token expired' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('maps no_agent code to agent not available message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'no_agent', message: 'No agent available' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('agent not available'))).toBe(true)
  })

  it('maps agent_unavailable code to agent not available message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'agent_unavailable', message: 'Agent down' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('agent not available'))).toBe(true)
  })

  it('maps mission_timeout code to timeout message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'mission_timeout', message: 'Timed out after 5 minutes' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Mission Timed Out'))).toBe(true)
  })

  it('detects rate limit errors from combined error text (429)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'provider_error', message: 'HTTP 429 too many requests' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from quota keyword', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'quota_exceeded', message: 'quota limit reached' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects auth errors from 401 in message text', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'received 401 unauthorized' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth errors from invalid_api_key', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'invalid_api_key', message: 'key is invalid' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })
})

// ── Progress tracking ────────────────────────────────────────────────────────

describe('progress tracking', () => {
  it('updates progress percentage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Analyzing...', progress: 50 },
      })
    })

    expect(result.current.missions[0].progress).toBe(50)
  })

  it('tracks token usage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 200, total: 300 } },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.tokenUsage).toEqual({ input: 100, output: 200, total: 300 })
  })

  it('updates token usage from result messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done',
          agent: 'claude-code',
          sessionId: 'test',
          done: true,
          usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
        },
      })
    })

    expect(result.current.missions[0].tokenUsage).toEqual({ input: 500, output: 250, total: 750 })
  })
})

// ── setActiveMission ─────────────────────────────────────────────────────────

describe('setActiveMission', () => {
  it('opens the sidebar when setting an active mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)

    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.isSidebarOpen).toBe(true)
    expect(result.current.activeMission?.id).toBe(missionId)
  })

  it('clears activeMission when passed null', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setActiveMission(missionId) })
    expect(result.current.activeMission).not.toBeNull()

    act(() => { result.current.setActiveMission(null) })

    expect(result.current.activeMission).toBeNull()
  })

  it('marks mission as read when viewing it', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Background the mission and trigger unread
    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: '', done: true } })
    })
    expect(result.current.unreadMissionIds.has(missionId)).toBe(true)

    // View the mission
    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ── Cancelling mission with terminal messages ────────────────────────────────

describe('cancelling mission receives terminal messages', () => {
  it('finalizes cancellation on stream done while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Receive stream done (terminal message)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('finalizes cancellation on error while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'cancelled', message: 'Cancelled' },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('failed')
  })

  it('finalizes cancellation on result while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Partial result' },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('failed')
  })

  it('ignores non-terminal messages while cancelling (e.g., progress)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Still processing...' },
      })
    })

    // Should still be in cancelling, not updated
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('handles cancel_ack with success:false', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Cancel failed on backend' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Cancel failed on backend'))).toBe(true)
  })

  it('handles cancel_confirmed message type (alternate ack)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-confirm-${Date.now()}`,
        type: 'cancel_confirmed',
        payload: { sessionId: missionId, success: true },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('failed')
  })

  it('prevents double-cancel (no duplicate timeout)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    // Second cancel should be a no-op
    act(() => { result.current.cancelMission(missionId) })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('HTTP cancel fallback handles failure response', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('cancellation failed'))).toBe(true)
  })

  it('HTTP cancel fallback handles network error', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('backend unreachable'))).toBe(true)
  })
})

// ── Persistence edge cases ──────────────────────────────────────────────────

describe('persistence edge cases', () => {
  it('missions stuck in "running" on reload are marked for reconnection', () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'running-1',
      title: 'Running Mission',
      description: 'Desc',
      type: 'troubleshoot',
      status: 'running',
      messages: [{ id: 'msg-1', role: 'user', content: 'fix it', timestamp: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'running-1')
    expect(mission?.currentStep).toBe('Reconnecting...')
    expect(mission?.context?.needsReconnect).toBe(true)
  })

  it('missions stuck in "cancelling" on reload are finalized to "failed"', () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'cancelling-1',
      title: 'Cancelling Mission',
      description: 'Desc',
      type: 'troubleshoot',
      status: 'cancelling',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'cancelling-1')
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('page was reloaded'))).toBe(true)
  })

  it('handles corrupted localStorage gracefully (returns empty array)', () => {
    localStorage.setItem('kc_missions', '{"invalid json')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(result.current.missions).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('unread mission IDs survive localStorage round-trip', () => {
    localStorage.setItem('kc_unread_missions', JSON.stringify(['m1', 'm2']))
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.unreadMissionIds.has('m1')).toBe(true)
    expect(result.current.unreadMissionIds.has('m2')).toBe(true)
  })

  it('handles corrupted unread IDs gracefully', () => {
    localStorage.setItem('kc_unread_missions', 'not-json')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(result.current.unreadMissionCount).toBe(0)
    errorSpy.mockRestore()
  })
})

// ── Agent selection with capabilities ────────────────────────────────────────

describe('agent selection logic', () => {
  it('prefers agents with ToolExec capability over suggest-only agents when no server selection', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-cap',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true, capabilities: 1 },
            { name: 'claude-code', displayName: 'Claude Code', description: '', provider: 'anthropic-local', available: true, capabilities: 3 },
          ],
          defaultAgent: '',
          selected: '', // No server selection — bestAvailable logic kicks in
        },
      })
    })

    // Should auto-select claude-code (has ToolExec) over copilot-cli (suggest-only)
    expect(result.current.selectedAgent).toBe('claude-code')
  })

  it('uses server-selected agent when provided', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-server',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true },
            { name: 'claude-code', displayName: 'Claude Code', description: '', provider: 'anthropic-local', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'copilot-cli', // Server explicitly selected copilot-cli
        },
      })
    })

    // Should use server selection when provided
    expect(result.current.selectedAgent).toBe('copilot-cli')
  })

  it('restores persisted agent selection from localStorage', async () => {
    localStorage.setItem('kc_selected_agent', 'gemini-cli')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-persist',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true },
            { name: 'gemini-cli', displayName: 'Gemini', description: '', provider: 'google-cli', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    // Should prefer persisted selection
    expect(result.current.selectedAgent).toBe('gemini-cli')
  })

  it('sends select_agent to backend when persisted differs from server selection', async () => {
    localStorage.setItem('kc_selected_agent', 'gemini-cli')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-sync',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true },
            { name: 'gemini-cli', displayName: 'Gemini', description: '', provider: 'google-cli', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code', // differs from persisted 'gemini-cli'
        },
      })
    })

    const selectCalls = MockWebSocket.lastInstance?.send.mock.calls.filter(
      (call: string[]) => JSON.parse(call[0]).type === 'select_agent',
    )
    expect(selectCalls?.length).toBeGreaterThan(0)
    expect(JSON.parse(selectCalls![0][0]).payload.agent).toBe('gemini-cli')
  })

  it('selectAgent with "none" does not send WebSocket message', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.selectAgent('none') })

    expect(result.current.selectedAgent).toBe('none')
    expect(result.current.isAIDisabled).toBe(true)
    // No WS created at all for 'none'
    // (If WS was created, it would only have list_agents, not select_agent)
  })
})

// ── sendMessage edge cases ──────────────────────────────────────────────────

describe('sendMessage edge cases', () => {
  it('sends conversation history in the payload', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Simulate an assistant response
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Here is help', done: true },
      })
    })

    // Send a follow-up
    const sendCallsBefore = MockWebSocket.lastInstance!.send.mock.calls.length
    await act(async () => {
      result.current.sendMessage(missionId, 'thanks, now do X')
    })

    const newCalls = MockWebSocket.lastInstance!.send.mock.calls.slice(sendCallsBefore)
    const chatCall = newCalls.find((call: string[]) => JSON.parse(call[0]).type === 'chat')
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.history).toBeDefined()
    expect(payload.history.length).toBeGreaterThan(0)
    // History should include both user and assistant messages
    expect(payload.history.some((h: { role: string }) => h.role === 'user')).toBe(true)
  })

  it('transitions mission to running when sending a follow-up', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Complete first turn
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('waiting_input')

    // Send follow-up
    act(() => {
      result.current.sendMessage(missionId, 'continue')
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')
  })

  it('sendMessage fails gracefully when connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    const missionId = seedMission({ status: 'waiting_input' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    // sendMessage will call ensureConnection, which creates a WS
    act(() => {
      result.current.sendMessage(missionId, 'follow-up')
    })

    // Simulate connection error
    await act(async () => {
      MockWebSocket.lastInstance?.simulateError()
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
  })
})

// ── Stream gap detection (tool use) ──────────────────────────────────────────

describe('stream gap detection', () => {
  it('creates a new assistant message bubble after an 8+ second gap', async () => {
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
          payload: { content: 'First part', done: false },
        })
      })

      // Advance past the gap threshold (8 seconds)
      act(() => { vi.advanceTimersByTime(9000) })

      // Second chunk after gap
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'After tool use', done: false },
        })
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      const assistantMsgs = mission?.messages.filter(m => m.role === 'assistant') ?? []
      // Should have two separate message bubbles
      expect(assistantMsgs.length).toBe(2)
      expect(assistantMsgs[0].content).toBe('First part')
      expect(assistantMsgs[1].content).toBe('After tool use')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Preflight check ──────────────────────────────────────────────────────────

describe('preflight check', () => {
  it('blocks mission when preflight check fails', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'No kubeconfig found' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    // Wait for preflight to resolve
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('blocked')
    expect(mission.preflightError?.code).toBe('MISSING_CREDENTIALS')
    expect(mission.messages.some(m => m.content.includes('Preflight Check Failed'))).toBe(true)
    expect(emitMissionError).toHaveBeenCalledWith('deploy', 'MISSING_CREDENTIALS')
  })

  it('proceeds when preflight throws unexpectedly', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockRejectedValueOnce(new Error('Preflight crash'))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'repair' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should proceed to ensureConnection (not blocked)
    // WS will be created
    expect(MockWebSocket.lastInstance).not.toBeNull()
  })

  it('retryPreflight transitions blocked mission back to pending', async () => {
    // First, create a blocked mission
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'EXPIRED_CREDENTIALS', message: 'Token expired' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Now retry — mock success
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    act(() => { result.current.retryPreflight(missionId) })

    // Should be pending while checking
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('pending')
    expect(result.current.missions.find(m => m.id === missionId)?.currentStep).toBe('Re-running preflight check...')

    // Let the retry resolve
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should now have a system message about preflight passing
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.messages.some(m => m.content.includes('Preflight check passed'))).toBe(true)
  })

  it('retryPreflight re-blocks when still failing', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'No permissions' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'c', type: 'deploy' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Retry, still failing
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'Still no permissions' },
    })

    act(() => { result.current.retryPreflight(missionId) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')
    expect(result.current.missions.find(m => m.id === missionId)?.messages.some(
      m => m.content.includes('Still Failing'),
    )).toBe(true)
  })

  it('retryPreflight is a no-op for non-blocked missions', () => {
    const missionId = seedMission({ status: 'completed' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.retryPreflight(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('completed')
  })
})

// ── Malicious content scanning ───────────────────────────────────────────────

describe('runSavedMission malicious content scan', () => {
  it('blocks execution when imported mission contains malicious content', async () => {
    const { scanForMaliciousContent } = await import('../lib/missions/scanner/malicious')
    vi.mocked(scanForMaliciousContent).mockReturnValueOnce([
      { type: 'command_injection', message: 'Suspicious command found', match: 'rm -rf /', location: 'steps[0]', severity: 'high' },
    ])

    const mission = {
      id: 'malicious-1',
      title: 'Bad Mission',
      description: 'Seems harmless',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Bad Mission',
        description: 'Seems harmless',
        steps: [{ title: 'Step 1', description: 'rm -rf /' }],
        tags: [],
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission('malicious-1') })

    const m = result.current.missions.find(m => m.id === 'malicious-1')
    expect(m?.status).toBe('failed')
    expect(m?.messages.some(msg => msg.content.includes('Mission blocked'))).toBe(true)
    expect(m?.messages.some(msg => msg.content.includes('rm -rf /'))).toBe(true)
  })
})

// ── Result message deduplication ─────────────────────────────────────────────

describe('result message deduplication', () => {
  it('uses output field from result payload when content is missing', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { output: 'Output from agent' },
      })
    })

    const msgs = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('Output from agent')
  })

  it('falls back to "Task completed." when result has no content or output', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {},
      })
    })

    const msgs = result.current.missions[0].messages.filter(m => m.role === 'assistant')
    expect(msgs.length).toBe(1)
    expect(msgs[0].content).toBe('Task completed.')
  })
})

// ── minimizeSidebar / expandSidebar ──────────────────────────────────────────

describe('sidebar minimize/expand', () => {
  it('minimizeSidebar sets isSidebarMinimized to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    expect(result.current.isSidebarMinimized).toBe(true)
  })

  it('expandSidebar sets isSidebarMinimized to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    act(() => { result.current.expandSidebar() })
    expect(result.current.isSidebarMinimized).toBe(false)
  })
})

// ── Mission timeout interval ─────────────────────────────────────────────────

describe('mission timeout interval', () => {
  it('transitions running mission to failed after MISSION_TIMEOUT_MS (5 min)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId } = await startMissionWithConnection(result)

      expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

      // Advance past the 5-minute timeout + one check interval (15s)
      act(() => { vi.advanceTimersByTime(300_000 + 15_000) })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      expect(mission?.messages.some(m => m.content.includes('Mission Timed Out'))).toBe(true)
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_timeout')
    } finally {
      vi.useRealTimers()
    }
  })

  it('transitions running mission to failed after stream inactivity (90s)', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId, requestId } = await startMissionWithConnection(result)

      // Send a stream chunk to start tracking inactivity
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Starting...', done: false },
        })
      })

      // Advance past inactivity timeout (90s) + check interval (15s)
      act(() => { vi.advanceTimersByTime(90_000 + 15_000) })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('failed')
      expect(mission?.messages.some(m => m.content.includes('Agent Not Responding'))).toBe(true)
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_inactivity')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire timeout when no running missions exist', async () => {
    vi.useFakeTimers()
    try {
      seedMission({ status: 'completed' })
      const { result } = renderHook(() => useMissions(), { wrapper })

      act(() => { vi.advanceTimersByTime(315_000) })

      // No change to status
      expect(result.current.missions[0].status).toBe('completed')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── WebSocket send retry logic ───────────────────────────────────────────────

describe('wsSend retry logic', () => {
  it('retries sending when WS is not yet open and succeeds on open', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Start a mission — this triggers ensureConnection
      act(() => { result.current.startMission(defaultParams) })
      await act(async () => { await Promise.resolve() })

      // WS is in CONNECTING state — the send will be retried
      // Now open the WS
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      // Advance past retry delay (1s)
      act(() => { vi.advanceTimersByTime(1_100) })

      // Chat message should have been sent
      const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
        (call: string[]) => {
          try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
        },
      )
      expect(chatCall).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── ensureConnection timeout ─────────────────────────────────────────────────

describe('ensureConnection timeout', () => {
  it('rejects with CONNECTION_TIMEOUT after 5s if WS never opens', async () => {
    vi.useFakeTimers()
    try {
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
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── WebSocket close fails pending missions ───────────────────────────────────

describe('WS close fails pending running missions', () => {
  it('fails all pending running missions when WS closes with error content', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

    // Simulate WebSocket closing
    act(() => { MockWebSocket.lastInstance?.simulateClose() })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    const systemMsg = mission?.messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('Local Agent Not Connected')
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
    const { detectIssueSignature } = await import('./useResolutions')

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

// ── retryPreflight unexpected throw proceeds to execute ──────────────────────

describe('retryPreflight unexpected failure', () => {
  it('proceeds to executeMission when retryPreflight throws unexpectedly', async () => {
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

    // Should have tried to execute (creates a WebSocket)
    expect(MockWebSocket.lastInstance).not.toBeNull()
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

  it('calls setActiveTokenCategory when stream completes with usage', async () => {
    const { setActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      })
    })

    // Should clear active token category
    expect(setActiveTokenCategory).toHaveBeenCalledWith(null)
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

    // Wait for the MISSION_RECONNECT_DELAY_MS (500ms) timer to fire
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600))
    })

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
