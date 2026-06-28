import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { resolveRequiredTools } from '../lib/missions/preflightCheck'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('./useDemoMode', () => ({
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

describe('tool overlap queueing', () => {
  it('queues missions until conflicting tools are released', async () => {
    vi.mocked(resolveRequiredTools).mockReturnValue(['helm'])
    const { result } = renderHook(() => useMissions(), { wrapper })

    const first = await startMissionWithConnection(result)

    let secondMissionId = ''
    act(() => {
      secondMissionId = result.current.startMission({
        ...defaultParams,
        title: 'Second Mission',
        initialPrompt: 'Install another chart',
      })
    })
    await act(async () => { await Promise.resolve() })

    const chatCallsBeforeCompletion = (MockWebSocket.lastInstance?.send.mock.calls ?? []).filter(
      (call: string[]) => {
        try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
      },
    )
    expect(chatCallsBeforeCompletion).toHaveLength(1)
    expect(result.current.missions.find(m => m.id === secondMissionId)?.currentStep)
      .toContain('Waiting for tools: helm')

    await act(async () => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: first.requestId,
        type: 'result',
        payload: { content: 'done', toolsExecuted: true },
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      const chatCallsAfterCompletion = (MockWebSocket.lastInstance?.send.mock.calls ?? []).filter(
        (call: string[]) => {
          try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
        },
      )
      expect(chatCallsAfterCompletion).toHaveLength(2)
      expect(result.current.missions.find(m => m.id === secondMissionId)?.status).toBe('running')
    })
  })
})

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
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'upgrade',
      })
    })
    await flushMissionPreflightChain()

    expect(runClusterReadinessCheck).toHaveBeenCalled()
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

  it('skips cluster preflight for AI cluster creation missions', async () => {
    const { runPreflightCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runPreflightCheck).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.startMission({
        ...defaultParams,
        type: 'deploy',
        context: {
          allowMissingLocalTools: true,
          skipClusterPreflight: true,
        },
      })
    })
    await act(async () => { await Promise.resolve() })

    expect(runPreflightCheck).not.toHaveBeenCalled()
  })
})

// ── retryPreflight: cluster context injection ───────────────────────────────

describe('retryPreflight with cluster context', () => {
  it('injects cluster context into prompt on retry success', async () => {
    const { runPreflightCheck, runClusterReadinessCheck } = await import('../lib/missions/preflightCheck')
    vi.mocked(runClusterReadinessCheck).mockResolvedValueOnce({ ok: true })
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
    await flushMissionPreflightChain()
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('blocked')

    // Retry with success
    vi.mocked(runPreflightCheck).mockResolvedValueOnce({ ok: true })

    act(() => { result.current.retryPreflight(missionId) })
    await flushMissionPreflightChain()

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
    await flushMissionPreflightChain()
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    expect(prompt).toContain('Deploy the application')
    expect(prompt).toContain('CRITICAL VERIFICATION REQUIREMENTS')
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
    await flushMissionPreflightChain()
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const prompt = JSON.parse(chatCall![0]).payload.prompt
    // Multi-cluster targeting includes context flags for each cluster
    expect(prompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(prompt).toContain('respective kubectl context')
    expect(prompt).toContain('CRITICAL VERIFICATION REQUIREMENTS')
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