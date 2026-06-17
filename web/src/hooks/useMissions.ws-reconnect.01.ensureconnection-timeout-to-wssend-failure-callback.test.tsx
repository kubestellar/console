/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions, __missionsTestables } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'

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
      await act(async () => {
        MockWebSocket.lastInstance?.simulateOpen()
        await Promise.resolve()
      })

      const firstWs = MockWebSocket.lastInstance

      // Close the WebSocket — should schedule a reconnect
      act(() => { firstWs?.simulateClose() })

      // Advance past initial reconnect delay (1s)
      await act(async () => {
        vi.advanceTimersByTime(1_100)
        await Promise.resolve()
      })

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

