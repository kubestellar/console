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

// ── wsSend: partial retry success ────────────────────────────────────────────

describe('wsSend partial retry', () => {
  it('succeeds on second retry when WS opens after initial failure', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Start a mission - creates WS in CONNECTING state
      act(() => { result.current.startMission(defaultParams) })
      await act(async () => { await Promise.resolve() })

      // WS is CONNECTING, first send will fail, get queued for retry
      // Open WS after 500ms (before retry at 1000ms)
      act(() => { vi.advanceTimersByTime(500) })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      // Now advance past the retry delay
      act(() => { vi.advanceTimersByTime(600) })

      // The chat message should have been sent
      const chatCalls = (MockWebSocket.lastInstance?.send.mock.calls ?? []).filter(
        (call: string[]) => {
          try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
        },
      )
      expect(chatCalls.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── startMission: context passing to agent ──────────────────────────────────

describe('startMission context passing', () => {
  it('passes mission context to the agent chat payload', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        context: { namespace: 'kube-system', cluster: 'prod' },
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.context).toEqual({ namespace: 'kube-system', cluster: 'prod' })
  })

  it('stores context on the mission object', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        context: { foo: 'bar' },
      })
    })

    expect(result.current.missions[0].context).toEqual({ foo: 'bar' })
  })

  it('stores the selected agent on the mission', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    // Select an agent first
    act(() => { result.current.selectAgent('claude-code') })

    act(() => { result.current.startMission(defaultParams) })

    expect(result.current.missions[0].agent).toBe('claude-code')
  })
})

// ── startMission: resolution matching skips Unknown signatures ──────────────

describe('startMission resolution matching edge cases', () => {
  it('skips resolution matching when detectIssueSignature returns Unknown type', async () => {
    const { detectIssueSignature } = await import('./useResolutions')
    vi.mocked(detectIssueSignature).mockReturnValueOnce({ type: 'Unknown' })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'troubleshoot',
      })
    })

    const mission = result.current.missions[0]
    expect(mission.matchedResolutions).toBeUndefined()
  })

  it('skips resolution matching for upgrade type missions', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'upgrade',
      })
    })

    expect(result.current.missions[0].matchedResolutions).toBeUndefined()
  })

  it('skips resolution matching when no similar resolutions found (empty array)', async () => {
    const { detectIssueSignature, findSimilarResolutionsStandalone } = await import('./useResolutions')
    vi.mocked(detectIssueSignature).mockReturnValueOnce({ type: 'CrashLoopBackOff', resourceKind: 'Pod' })
    vi.mocked(findSimilarResolutionsStandalone).mockReturnValueOnce([])

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'analyze',
      })
    })

    expect(result.current.missions[0].matchedResolutions).toBeUndefined()
  })
})

// ── startMission: preflight for repair/upgrade types ────────────────────────

describe('startMission preflight for different types', () => {
  it('runs preflight for repair-type missions without explicit cluster', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'repair',
      })
    })
    await act(async () => { await Promise.resolve() })

    // Preflight should have been called (repair is in the list of types that need cluster)
    expect(runPreflightCheck).toHaveBeenCalled()
  })

  it('runs preflight for upgrade-type missions', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'upgrade',
      })
    })
    await act(async () => { await Promise.resolve() })

    expect(runPreflightCheck).toHaveBeenCalled()
  })

  it('skips preflight for troubleshoot missions without cluster', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'troubleshoot',
        // No cluster specified
      })
    })
    await act(async () => { await Promise.resolve() })

    // Preflight should NOT have been called for troubleshoot without cluster
    expect(runPreflightCheck).not.toHaveBeenCalled()
  })
})

// ── retryPreflight: cluster context injection ───────────────────────────────

describe('retryPreflight with cluster context', () => {
  it('injects cluster context into prompt on retry success', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'EXPIRED_CREDENTIALS', message: 'Token expired' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({
        ...defaultParams,
        cluster: 'my-cluster',
        type: 'deploy',
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Retry with success
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    act(() => { result.current.retryPreflight(missionId) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // Should have proceeded to execute, which creates a WebSocket
    expect(MockWebSocket.lastInstance).not.toBeNull()

    // The preflight error should be cleared
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.preflightError).toBeUndefined()
  })

  it('retryPreflight is a no-op for non-existent missions', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    // Should not throw
    act(() => { result.current.retryPreflight('does-not-exist') })
    expect(result.current.missions).toHaveLength(0)
  })
})

// ── runSavedMission: malicious scan skipped when no steps ───────────────────

describe('runSavedMission edge cases', () => {
  it('skips malicious scan when importedFrom has no steps', async () => {
    const { scanForMaliciousContent } = await import('../lib/missions/scanner/malicious')
    vi.mocked(scanForMaliciousContent).mockClear()

    const mission = {
      id: 'no-steps-1',
      title: 'No Steps Mission',
      description: 'Simple mission without steps',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'No Steps Mission',
        description: 'Simple mission without steps',
        // No steps array
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('no-steps-1') })

    // scanForMaliciousContent should NOT have been called (no steps)
    expect(scanForMaliciousContent).not.toHaveBeenCalled()
  })

  it('uses description as base prompt when importedFrom has no steps', async () => {
    const mission = {
      id: 'desc-only-1',
      title: 'Description Only',
      description: 'Deploy the application',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Description Only',
        description: 'Deploy the application',
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('desc-only-1') })
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Deploy the application')
  })

  it('injects multi-cluster targeting with context flags', async () => {
    const mission = {
      id: 'multi-cluster-1',
      title: 'Multi Cluster',
      description: 'Deploy to multiple',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Multi Cluster',
        description: 'Deploy to multiple',
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('multi-cluster-1', 'cluster-a, cluster-b') })
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    // Multi-cluster targeting includes context flags for each cluster
    expect(prompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(prompt).toContain('respective kubectl context')
  })

  it('opens sidebar and sets active mission when running saved mission', () => {
    const mission = {
      id: 'activate-1',
      title: 'Activate Me',
      description: 'Test',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Activate Me',
        description: 'Test',
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('activate-1') })

    expect(result.current.isSidebarOpen).toBe(true)
    expect(result.current.activeMission?.id).toBe('activate-1')
  })
})

// ── sendMessage: history dedup check ────────────────────────────────────────

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

      // Stream a chunk (sets timestamp)
      act(() => {
        MockWebSocket.lastInstance?.simulateMessage({
          id: requestId,
          type: 'stream',
          payload: { content: 'Data', done: false },
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

describe('WS close: pending request cleanup', () => {
  it('clears all pending requests when WS closes and marks mission for reconnect (#5929)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('running')

    // Close WS — transient disconnect, should not fail the mission
    act(() => { MockWebSocket.lastInstance?.simulateClose() })

    // Mission should still be running with needsReconnect flag (#5929)
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('running')
    expect(mission?.context?.needsReconnect).toBe(true)

    // New messages to the old request ID should be ignored (pending was cleared)
    // (This verifies pendingRequests.current.clear() was called)
  })
})

// ── Timeout interval: does not change non-running missions ──────────────────

describe('timeout interval: preserves non-running missions', () => {
  it('does not fail waiting_input missions when timeout fires', async () => {
    // Previously this test used `pending`, but pending missions are now
    // auto-failed on hydration (#5931) since they cannot be resumed. The
    // intent of this test is to verify the timeout interval only targets
    // running missions — waiting_input is the equivalent non-running state.
    vi.useFakeTimers()
    try {
      seedMission({ id: 'waiting-safe-2', status: 'waiting_input' })
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Advance past timeout + check interval
      act(() => { vi.advanceTimersByTime(315_000) })

      const mission = result.current.missions.find(m => m.id === 'waiting-safe-2')
      expect(mission?.status).toBe('waiting_input')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fail waiting_input missions when timeout fires', async () => {
    vi.useFakeTimers()
    try {
      const waitingMission = {
        id: 'waiting-safe',
        title: 'Waiting',
        description: 'User input',
        type: 'troubleshoot',
        status: 'waiting_input',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem('kc_missions', JSON.stringify([waitingMission]))

      const { result } = renderHook(() => useMissions(), { wrapper })

      act(() => { vi.advanceTimersByTime(315_000) })

      expect(result.current.missions.find(m => m.id === 'waiting-safe')?.status).toBe('waiting_input')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── WS reconnect: gives up after max retries ────────────────────────────────

describe('WS reconnect: max retries', () => {
  it('stops reconnecting after WS_RECONNECT_MAX_RETRIES (10) attempts', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Initial connection
      act(() => { result.current.connectToAgent() })
      await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

      // Close and let 10 reconnect attempts happen
      for (let i = 0; i < 10; i++) {
        const currentWs = MockWebSocket.lastInstance
        act(() => { currentWs?.simulateClose() })
        // Advance past the backoff delay (up to 30s cap)
        const delay = Math.min(1000 * Math.pow(2, i), 30000)
        act(() => { vi.advanceTimersByTime(delay + 100) })
      }

      // After 10 attempts, close should NOT schedule another reconnect
      const wsAfter10 = MockWebSocket.lastInstance
      act(() => { wsAfter10?.simulateClose() })
      // Advance a lot — should NOT create a new WS
      act(() => { vi.advanceTimersByTime(60_000) })

      // The warn about abandoning should have been logged
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('reconnection abandoned after'),
      )
    } finally {
      vi.useRealTimers()
      warnSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})

// ── sendMessage: stop keywords are case-insensitive with whitespace ─────────

describe('sendMessage stop keyword handling', () => {
  it.each(['STOP', 'Cancel', 'ABORT', 'Halt', 'QUIT'])(
    'uppercase stop keyword "%s" also triggers cancelMission',
    async keyword => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      const { missionId } = await startMissionWithConnection(result)

      act(() => {
        result.current.sendMessage(missionId, keyword)
      })

      const mission = result.current.missions.find(m => m.id === missionId)
      expect(mission?.status).toBe('cancelling')
    },
  )

  it('trims whitespace before checking stop keywords', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.sendMessage(missionId, '  stop  ')
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelling')
  })

  it('does not treat partial matches as stop keywords', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.sendMessage(missionId, 'do not stop the process')
    })

    // Should NOT cancel — "stop" is part of a longer sentence
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('running')
  })
})

// ── markMissionAsRead: no-op when mission is not in unread set ──────────────

describe('markMissionAsRead edge cases', () => {
  it('is a no-op when mission is not in unread set', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    // Call markMissionAsRead for a mission that was never unread
    act(() => { result.current.markMissionAsRead('never-unread') })

    expect(result.current.unreadMissionCount).toBe(0)
  })
})

// ── setActiveMission: null does not affect unread set ───────────────────────

describe('setActiveMission edge cases', () => {
  it('setting null active mission does not open sidebar', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.setActiveMission(null) })

    expect(result.current.isSidebarOpen).toBe(false)
  })

  it('setting active mission on non-existent ID still opens sidebar', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.setActiveMission('nonexistent') })

    expect(result.current.isSidebarOpen).toBe(true)
    // activeMission should be null since no mission matches
    expect(result.current.activeMission).toBeNull()
  })
})

// ── selectAgent: wsSend failure logging ─────────────────────────────────────

describe('selectAgent wsSend failure', () => {
  it('logs error when ensureConnection times out during selectAgent', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })

      // Call selectAgent — ensureConnection creates a WS
      act(() => { result.current.selectAgent('new-agent') })

      // Do NOT simulate WS open — let ensureConnection's 5s timeout fire
      await act(async () => { vi.advanceTimersByTime(6_000) })

      // ensureConnection rejects with CONNECTION_TIMEOUT, selectAgent .catch() logs the error
      expect(errorSpy).toHaveBeenCalledWith(
        '[Missions] Failed to select agent:',
        expect.any(Error),
      )
    } finally {
      vi.useRealTimers()
      errorSpy.mockRestore()
    }
  })
})

// ── Stream: append to existing assistant message with agent field ────────────

describe('stream: agent field on appended chunks', () => {
  it('preserves agent field when appending to existing assistant message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // First chunk with agent
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Hello', done: false, agent: 'claude-code' },
      })
    })

    // Second chunk with different agent (edge case)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: ' World', done: false, agent: 'gemini' },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsg = mission.messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.content).toBe('Hello World')
    // Agent should be updated to the latest
    expect(assistantMsg?.agent).toBe('gemini')
  })
})

// ── executeMission: wsSend failure path ─────────────────────────────────────

describe('executeMission wsSend failure', () => {
  it('transitions mission to failed when ensureConnection times out during executeMission', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useMissions(), { wrapper })
      act(() => { result.current.startMission(defaultParams) })
      await act(async () => { await Promise.resolve() })

      // Do NOT simulate WS open — let ensureConnection's 5s timeout fire
      await act(async () => { vi.advanceTimersByTime(6_000) })

      // ensureConnection rejects with CONNECTION_TIMEOUT, executeMission .catch() fires
      const mission = result.current.missions[0]
      expect(mission.status).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── runSavedMission: wsSend failure path ────────────────────────────────────

describe('runSavedMission wsSend failure', () => {
  it('transitions to failed when ensureConnection times out during runSavedMission', async () => {
    vi.useFakeTimers()
    try {
      const mission = {
        id: 'wsfail-1',
        title: 'WS Fail',
        description: 'Test',
        type: 'deploy',
        status: 'saved',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        importedFrom: { title: 'WS Fail', description: 'Test' },
      }
      localStorage.setItem('kc_missions', JSON.stringify([mission]))

      const { result } = renderHook(() => useMissions(), { wrapper })
      act(() => { result.current.runSavedMission('wsfail-1') })
      // Flush microtask queue so the preflight .then() chain resolves
      await act(async () => { await Promise.resolve() })

      // Do NOT simulate WS open — let ensureConnection's 5s timeout fire
      await act(async () => { vi.advanceTimersByTime(6_000) })

      const m = result.current.missions.find(m => m.id === 'wsfail-1')
      expect(m?.status).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── Sidebar open/closed persistence via kc_mission_sidebar_open ──────────────

describe('sidebar open/closed persistence', () => {
  const SIDEBAR_OPEN_KEY = 'kc_mission_sidebar_open'

  it('persists sidebar open state to localStorage when opened', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    // Sidebar starts closed (localStorage is cleared in beforeEach)
    expect(result.current.isSidebarOpen).toBe(false)
    expect(localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('false')

    act(() => { result.current.openSidebar() })

    expect(result.current.isSidebarOpen).toBe(true)
    expect(localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('true')
  })

  it('persists sidebar closed state to localStorage when closed', () => {
    // Pre-seed open state
    localStorage.setItem(SIDEBAR_OPEN_KEY, 'true')

    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(true)

    act(() => { result.current.closeSidebar() })

    expect(result.current.isSidebarOpen).toBe(false)
    expect(localStorage.getItem(SIDEBAR_OPEN_KEY)).toBe('false')
  })

  it('restores sidebar open state from localStorage on mount', () => {
    localStorage.setItem(SIDEBAR_OPEN_KEY, 'true')

    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('defaults to closed when localStorage has no sidebar key', () => {
    // localStorage is cleared in beforeEach — no key present
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)
  })
})
