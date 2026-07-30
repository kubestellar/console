import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { fetchMissionContent, missionCache } from '../lib/missions/missionCache'

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
}))
vi.mock('./useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
  isAgentUnavailable: vi.fn(() => false),
  isAgentConnected: vi.fn(() => false),
  reportAgentActivity: vi.fn(),
  reportAgentDataSuccess: vi.fn(),
  reportAgentDataError: vi.fn(),
}))

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

vi.mock('../lib/missions/missionCache', () => ({
  missionCache: {
    installers: [],
  },
  fetchMissionContent: vi.fn(async mission => ({
    mission,
    raw: JSON.stringify(mission),
  })),
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
  missionCache.installers = []
  vi.clearAllMocks()
  vi.mocked(getDemoMode).mockReturnValue(false)
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

// ── saveMission ───────────────────────────────────────────────────────────────

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
    expect(prompt).toContain('Perform the following on EACH cluster')
  })

  it('auto-loads validated install missions for free-form install prompts', async () => {
    const installer = {
      version: 'kc-mission-v1',
      name: 'install-kuberay',
      title: 'Install KubeRay',
      description: 'Validated install guide',
      type: 'deploy' as const,
      tags: ['kuberay'],
      missionClass: 'install',
      cncfProject: 'kuberay',
      steps: [],
      metadata: { source: 'fixes/cncf-install/install-kuberay.json' },
    }

    missionCache.installers = [installer]
    vi.mocked(fetchMissionContent).mockResolvedValue({
      mission: {
        ...installer,
        steps: [{
          title: 'Install KubeRay operator',
          description: 'Apply the validated KubeRay manifests',
          command: 'kubectl apply -f kuberay.yaml',
        }],
      },
      raw: JSON.stringify(installer),
    })

    const { result } = renderHook(() => useMissions(), { wrapper })

    let missionId = ''
    await act(async () => {
      missionId = result.current.startMission({
        title: 'Install request',
        description: 'User asked to install KubeRay',
        type: 'deploy',
        initialPrompt: 'install kuberay',
        skipReview: true,
      })
    })

    await flushMissionPreflightChain()
    await waitFor(() => {
      expect(MockWebSocket.lastInstance).not.toBeNull()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateOpen()
    })

    const mission = result.current.missions.find(candidate => candidate.id === missionId)
    expect(mission?.messages.some(message => (
      message.role === 'system'
        && message.content.includes('Auto-loaded `install-kuberay.json` from console-kb')
    ))).toBe(true)
    expect(fetchMissionContent).toHaveBeenCalledWith(installer)
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

