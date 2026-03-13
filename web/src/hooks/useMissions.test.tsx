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

vi.mock('../lib/constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../lib/analytics', () => ({
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
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

  it('useMissions throws when used outside MissionProvider', () => {
    // Suppress the expected React error boundary output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useMissions())).toThrow(
      'useMissions must be used within a MissionProvider',
    )
    consoleSpy.mockRestore()
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
      expect(mission?.status).toBe('failed')
      const systemMessages = mission?.messages.filter(m => m.role === 'system') ?? []
      expect(systemMessages.some(m => m.content.includes('cancelled'))).toBe(true)
    },
  )
})

// ── cancelMission ─────────────────────────────────────────────────────────────

describe('cancelMission', () => {
  it('sets mission status to failed with a system message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.cancelMission(missionId)
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    const lastMsg = mission?.messages[mission.messages.length - 1]
    expect(lastMsg?.role).toBe('system')
    expect(lastMsg?.content).toContain('Mission cancelled by user.')
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

  it('falls back to HTTP POST when WebSocket is not open', () => {
    const missionId = seedMission({ status: 'running' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => {
      result.current.cancelMission(missionId)
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/cancel-chat'),
      expect.objectContaining({ method: 'POST' }),
    )
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
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
    let missionWriteCount = 0
    const realSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'kc_missions') {
        missionWriteCount++
        if (missionWriteCount === 1) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      }
      return realSetItem.call(this, key, value)
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Mount — loadMissions() then saveMissions() via useEffect
    const { result } = renderHook(() => useMissions(), { wrapper })

    // The pruning path must have retried
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    // All saved (library) missions must still be present
    expect(result.current.missions.some(m => m.id === 'saved-1')).toBe(true)
    expect(result.current.missions.some(m => m.id === 'saved-2')).toBe(true)

    // Active missions must still be present
    expect(result.current.missions.some(m => m.id === 'pending-1')).toBe(true)

    Storage.prototype.setItem = realSetItem
    warnSpy.mockRestore()
  })

  it('detects QuotaExceededError via legacy numeric code 22', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    let missionWriteCount = 0
    const realSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
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
      return realSetItem.call(this, key, value)
    }

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })

    // The pruning branch should have fired (retry = missionWriteCount >= 2)
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    Storage.prototype.setItem = realSetItem
    warnSpy.mockRestore()
  })

  it('logs the error and clears storage when pruning still exceeds quota', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    const realSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'kc_missions') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return realSetItem.call(this, key, value)
    }

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

    Storage.prototype.setItem = realSetItem
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
})
