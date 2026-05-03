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
  emitError: vi.fn(),
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
    expect(emitMissionError).toHaveBeenCalledWith('deploy', 'MISSING_CREDENTIALS', expect.anything())
  })

  it('blocks mission when preflight throws unexpectedly (#5846)', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockRejectedValueOnce(new Error('Preflight crash'))

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'repair' })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should be blocked (fail-closed) — not proceed to WS connection (#5846)
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('blocked')
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
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_timeout', expect.anything())
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
      expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'mission_inactivity', expect.anything())
    } finally {
      vi.useRealTimers()
    }
  })

  it('progress events reset inactivity timer so long-running tools do not timeout', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId, requestId } = await startMissionWithConnection(result)

      // Send a stream chunk to start tracking inactivity
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Installing Drasi...', done: false },
        })
      })

      // Advance 60s — within 90s window, still alive
      act(() => { vi.advanceTimersByTime(60_000) })

      // Send a progress event (heartbeat from tool execution)
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'progress',
          payload: { step: 'Still working...' },
        })
      })

      // Advance another 60s — 120s total, but only 60s since last progress event
      act(() => { vi.advanceTimersByTime(60_000) })

      // Mission should still be running (progress reset the timer)
      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('running')
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
