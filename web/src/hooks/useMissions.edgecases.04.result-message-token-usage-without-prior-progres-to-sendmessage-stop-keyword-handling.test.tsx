/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { resolveRequiredTools } from '../lib/missions/preflightCheck'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
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

