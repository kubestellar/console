import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionRated } from '../lib/analytics'
import { resolveRequiredTools } from '../lib/missions/preflightCheck'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
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
  runClusterReadinessCheck: vi.fn().mockResolvedValue({ ok: true }),
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
  localStorage.clear()
  MockWebSocket.lastInstance = null
  vi.clearAllMocks()
  vi.mocked(getDemoMode).mockReturnValue(false)
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

// ── wsSend: partial retry success ────────────────────────────────────────────

describe('sendMessage history dedup', () => {
  it('does not duplicate the current message in history when ref already reflects it', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Complete first turn
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Response here', done: true },
      })
    })

    const sendCallsBefore = MockWebSocket.lastInstance!.send.mock.calls.length

    // Send follow-up
    await act(async () => {
      result.current.sendMessage(missionId, 'next question')
    })

    const newCalls = MockWebSocket.lastInstance!.send.mock.calls.slice(sendCallsBefore)
    const chatCall = newCalls.find((call: string[]) => JSON.parse(call[0]).type === 'chat')
    if (chatCall) {
      const payload = JSON.parse(chatCall[0]).payload
      // The current user message should appear in history at most once
      const userMsgsInHistory = payload.history.filter(
        (h: { role: string; content: string }) => h.role === 'user' && h.content === 'next question',
      )
      expect(userMsgsInHistory.length).toBeLessThanOrEqual(1)
    }
  })
})

// ── cancelMission: double-cancel with existing timeout ──────────────────────

describe('cancelMission double-cancel guard', () => {
  it('second cancelMission call is silently ignored (no duplicate timeouts)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    const sendCountBefore = MockWebSocket.lastInstance!.send.mock.calls.length

    // First cancel
    act(() => { result.current.cancelMission(missionId) })

    const sendCountAfterFirst = MockWebSocket.lastInstance!.send.mock.calls.length
    const cancelCallsFirst = MockWebSocket.lastInstance!.send.mock.calls
      .slice(sendCountBefore)
      .filter((call: string[]) => {
        try { return JSON.parse(call[0]).type === 'cancel_chat' } catch { return false }
      })
    expect(cancelCallsFirst.length).toBe(1)

    // Second cancel — should be a no-op
    act(() => { result.current.cancelMission(missionId) })

    const cancelCallsSecond = MockWebSocket.lastInstance!.send.mock.calls
      .slice(sendCountAfterFirst)
      .filter((call: string[]) => {
        try { return JSON.parse(call[0]).type === 'cancel_chat' } catch { return false }
      })
    // No additional cancel_chat should have been sent
    expect(cancelCallsSecond.length).toBe(0)
  })
})

// ── rateMission: null feedback ──────────────────────────────────────────────

describe('rateMission with null feedback', () => {
  it('records null feedback (clear rating)', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    // First rate positive
    act(() => { result.current.rateMission(missionId, 'positive') })
    expect(result.current.missions.find(m => m.id === missionId)?.feedback).toBe('positive')

    // Clear rating with null
    act(() => { result.current.rateMission(missionId, null) })
    expect(result.current.missions.find(m => m.id === missionId)?.feedback).toBeNull()
    // emitMissionRated should have been called with 'neutral' for null feedback
    expect(emitMissionRated).toHaveBeenCalledWith('troubleshoot', 'neutral')
  })
})

// ── dismissMission: does NOT clear activeMission when different mission ─────

describe('dismissMission does not clear unrelated active mission', () => {
  it('keeps activeMission when dismissing a different mission', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let id1 = ''
    let id2 = ''
    act(() => { id1 = result.current.startMission(defaultParams) })
    act(() => { id2 = result.current.startMission({ ...defaultParams, title: 'Second' }) })

    // Set id1 as active
    act(() => { result.current.setActiveMission(id1) })
    expect(result.current.activeMission?.id).toBe(id1)

    // Dismiss id2
    act(() => { result.current.dismissMission(id2) })

    // id1 should still be active
    expect(result.current.activeMission?.id).toBe(id1)
    // id2 should be gone
    expect(result.current.missions.find(m => m.id === id2)).toBeUndefined()
  })
})

// ── Agent selection: only suggest-only agents available ─────────────────────

describe('agent selection: only suggest-only agents', () => {
  it('falls back to suggest-only agent when no ToolExec agents exist', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-suggest',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true, capabilities: 1 },
          ],
          defaultAgent: '',
          selected: '',
        },
      })
    })

    // Should fall back to the first non-suggest-only agent, but since copilot-cli is
    // suggest-only, it should fall through to the last fallback: first available agent
    expect(result.current.selectedAgent).toBe('copilot-cli')
  })

  it('prefers non-suggest-only agent without ToolExec over suggest-only agent', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-mixed',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true, capabilities: 1 },
            { name: 'custom-agent', displayName: 'Custom', description: '', provider: 'local', available: true, capabilities: 1 },
          ],
          defaultAgent: '',
          selected: '',
        },
      })
    })

    // custom-agent is not in SUGGEST_ONLY_AGENTS, so it should be preferred
    expect(result.current.selectedAgent).toBe('custom-agent')
  })
})

// ── Agent selection: persisted agent no longer available ─────────────────────

describe('agent selection: persisted agent unavailable', () => {
  it('falls back to server selection when persisted agent is no longer available', async () => {
    localStorage.setItem('kc_selected_agent', 'old-agent')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-fallback',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true },
            // Note: 'old-agent' is NOT in the available agents list
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    // Should NOT use 'old-agent' (unavailable), should use server selection
    expect(result.current.selectedAgent).toBe('claude-code')
  })
})

// ── Stream done: clears lastStreamTimestamp ──────────────────────────────────

describe('stream done cleanup', () => {
  it('clears stream timestamp tracker on stream done', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      let missionId = ''
      act(() => { missionId = result.current.startMission(defaultParams) })
      await act(async () => { await Promise.resolve() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
        (call: string[]) => JSON.parse(call[0]).type === 'chat',
      )
      const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''

      // Stream a chunk (sets timestamp). Use interactive content so the
      // mission remains in waiting_input after stream-done cleanup instead of
      // auto-completing from a terminal streamed response.
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'What would you like to do next?', done: false },
        })
      })

      // Stream done (should clear timestamp)
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: '', done: true },
        })
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('waiting_input')

      // Advance past inactivity timeout - should NOT fail the mission since
      // stream is complete and timestamp was cleared
      act(() => { vi.advanceTimersByTime(90_000 + 15_000) })

      const missionAfter = result.current.missions.find(m => m.id === missionId)
      // Should still be waiting_input, not failed (stream tracker was cleaned up)
      expect(missionAfter?.status).toBe('waiting_input')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Result message: interactive follow-up handling ───────────────────────────

describe('interactive result transitions', () => {
  it('keeps a retried mission in waiting_input when the latest result asks what to do next', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'rollback_failed', message: 'Rollback failed partway through' },
      })
    })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('failed')

    const sendCallCount = MockWebSocket.lastInstance?.send.mock.calls.length ?? 0
    await act(async () => {
      result.current.sendMessage(missionId, 'Retry the rollback and tell me what to do next')
      await Promise.resolve()
    })

    const retryChatCall = (MockWebSocket.lastInstance?.send.mock.calls ?? [])
      .slice(sendCallCount)
      .find((call: string[]) => JSON.parse(call[0]).type === 'chat')
    expect(retryChatCall).toBeDefined()
    const retryRequestId = JSON.parse(retryChatCall![0]).id

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: retryRequestId,
        type: 'result',
        payload: {
          content: [
            'Rollback completed successfully. What would you like to do next?',
            '',
            '1. Verify the workload',
            '2. Close the mission',
          ].join('\n'),
          isError: true,
          toolsExecuted: true,
        },
      })
    })

    await waitFor(() => {
      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('waiting_input')
      expect(mission?.messages[mission.messages.length - 1]?.content).toContain('Rollback completed successfully')
    })
  })
})

// ── Result message: token usage from result without prior progress ──────────

describe('result message token usage without prior progress', () => {
  it('sets token usage from result when no prior progress was received', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Answer',
          usage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
        },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.tokenUsage).toEqual({ input: 400, output: 200, total: 600 })
  })

  it('preserves token usage when result has no usage field', async () => {
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

    // Result without usage
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Done' },
      })
    })

    // Should preserve the prior token usage
    expect(result.current.missions[0].tokenUsage).toEqual({ input: 100, output: 50, total: 150 })
  })
})

// ── Stream: empty content chunk is not added as new message ─────────────────

describe('stream: empty content handling', () => {
  it('does not create a new assistant message for empty non-done stream chunk', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Stream with empty content and done=false
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: false },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    // No assistant message should have been created for empty content
    expect(assistantMsgs.length).toBe(0)
  })
})

// ── Unread tracking: sidebar open does not mark as unread ───────────────────

describe('unread tracking: active mission not marked unread', () => {
  it('does not mark active mission as unread when sidebar is open', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Mission is active and sidebar is open (startMission opens sidebar)
    expect(result.current.isSidebarOpen).toBe(true)
    expect(result.current.activeMission?.id).toBe(missionId)

    // Stream done on the ACTIVE mission while sidebar is open
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    // Should NOT be marked as unread since it's the active mission
    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
    expect(result.current.unreadMissionCount).toBe(0)
  })
})

// ── WebSocket close: fails pending missions, clears pendingRequests ─────────