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


describe('sendMessage connection failure path', () => {
  it('adds system message when sendMessage connection fails', async () => {
    vi.mocked(getDemoMode).mockReturnValue(false)
    const missionId = seedMission({ status: 'waiting_input' })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.sendMessage(missionId, 'follow up') })

    // Simulate connection error
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateError()
      await Promise.resolve()
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Lost connection to local agent'))).toBe(true)
  })
})

// ── retryPreflight unexpected throw re-blocks (fail-closed) ─────────────────


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


describe('token usage tracking', () => {
  it('calls addCategoryTokens on progress message with token delta', async () => {
    const { addCategoryTokens, setActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    expect(setActiveTokenCategory).toHaveBeenCalledWith(missionId, 'diagnose')

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Processing...', tokens: { input: 50, output: 25, total: 75 } },
      })
    })

    expect(addCategoryTokens).toHaveBeenCalledWith(75, 'diagnose')
  })

  it('calls clearActiveTokenCategory when stream completes with usage', async () => {
    const { clearActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      })
    })

    // Should clear active token category for this specific mission (#6016)
    expect(clearActiveTokenCategory).toHaveBeenCalledWith(missionId)
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

    expect(addCategoryTokens).toHaveBeenCalledWith(300, 'diagnose')
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
    await act(async () => {
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
      await Promise.resolve()
    })

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

