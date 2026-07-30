import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions, type StartMissionParams } from './useMissions'
import {
  MISSION_CONTROL_TRIGGER_TIMEOUT_MS,
  MISSION_TIMEOUT_CHECK_INTERVAL_MS,
  MISSION_TIMEOUT_MS,
} from './useMissions.constants'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?]))),
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
  emitError: vi.fn(),
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
  params: StartMissionParams = defaultParams,
): Promise<{ missionId: string; requestId: string }> {
  let missionId = ''
  act(() => {
    missionId = result.current.startMission(params)
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

// ── Persistence edge cases ──────────────────────────────────────────────────

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
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'MISSING_CREDENTIALS', message: 'No kubeconfig found' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    await flushMissionPreflightChain()

    const mission = result.current.missions[0]
    expect(mission.status).toBe('blocked')
    expect(mission.preflightError?.code).toBe('MISSING_CREDENTIALS')
    // PreflightFailure component renders the error; no duplicate system message (#13464)
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

  it('continues AI cluster creation missions when local tools are missing', async () => {
    const { runPreflightCheck, runToolPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: kubectl, helm',
        details: { missingTools: ['kubectl', 'helm'] },
      },
      tools: [],
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        description: 'AI-guided cluster creation across any provider',
        context: {
          allowMissingLocalTools: true,
          skipClusterPreflight: true,
        },
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    const mission = result.current.missions[0]
    expect(mission.status).not.toBe('blocked')
    expect(mission.messages.some(m => m.content.includes('Tool availability warning'))).toBe(true)
    expect(runPreflightCheck).not.toHaveBeenCalled()
    expect(MockWebSocket.lastInstance).not.toBeNull()
  })

  it('blocks AI-assisted missions when the prompt requires missing optional tools', async () => {
    const { runPreflightCheck, runToolPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()
    vi.mocked(runToolPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'Required tools not found: gh, helm',
        details: { missingTools: ['gh', 'helm'] },
      },
      tools: [],
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        initialPrompt: 'Use gh to open the pull request and helm to install the release.',
        context: {
          allowMissingLocalTools: true,
          skipClusterPreflight: true,
        },
      })
    })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    const mission = result.current.missions[0]
    expect(runToolPreflightCheck).toHaveBeenCalledWith(
      'http://localhost:8585',
      expect.arrayContaining(['gh', 'helm']),
      expect.any(Function),
    )
    expect(mission.status).toBe('blocked')
    expect(mission.preflightError?.message).toContain('installed locally before it can run')
    expect(runPreflightCheck).not.toHaveBeenCalled()
    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('retryPreflight transitions blocked mission back to pending', async () => {
    // First, create a blocked mission
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'EXPIRED_CREDENTIALS', message: 'Token expired' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'my-cluster', type: 'deploy' })
    })
    await flushMissionPreflightChain()
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Now retry — mock success
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    act(() => { result.current.retryPreflight(missionId) })

    // Should be pending while checking
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('pending')
    expect(result.current.missions.find(m => m.id === missionId)?.currentStep).toBe('Re-running preflight check...')

    // Let the retry resolve
    await flushMissionPreflightChain()

    // Should now have a system message about preflight passing
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.messages.some(m => m.content.includes('Preflight check passed'))).toBe(true)
  })

  it('retryPreflight re-blocks when still failing', async () => {
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'No permissions' },
    })

    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission({ ...defaultParams, cluster: 'c', type: 'deploy' })
    })
    await flushMissionPreflightChain()

    // Retry, still failing
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({
      ok: false,
      error: { code: 'RBAC_DENIED', message: 'Still no permissions' },
    })

    act(() => { result.current.retryPreflight(missionId) })
    await flushMissionPreflightChain()

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')
    // PreflightFailure component renders the error; no duplicate system message (#13464)
    expect(result.current.missions.find(m => m.id === missionId)?.preflightError?.code).toBe('RBAC_DENIED')
  })

  it('retryPreflight is a no-op for non-blocked missions', () => {
    const missionId = seedMission({ status: 'completed' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.retryPreflight(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('completed')
  })
})

// ── Malicious content scanning ───────────────────────────────────────────────

