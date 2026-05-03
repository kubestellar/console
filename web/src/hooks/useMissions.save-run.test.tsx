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

  it('stores importedFrom metadata with steps and tags', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => {
      result.current.saveMission({
        title: 'CNCF Mission',
        description: 'Deploy Istio',
        type: 'deploy',
        missionClass: 'service-mesh',
        cncfProject: 'istio',
        steps: [
          { title: 'Install', description: 'Install Istio via Helm' },
          { title: 'Verify', description: 'Verify pods are running' },
        ],
        tags: ['cncf', 'istio'],
        initialPrompt: 'deploy istio',
      })
    })
    const mission = result.current.missions[0]
    expect(mission.importedFrom).toBeDefined()
    expect(mission.importedFrom?.missionClass).toBe('service-mesh')
    expect(mission.importedFrom?.cncfProject).toBe('istio')
    expect(mission.importedFrom?.steps).toHaveLength(2)
    expect(mission.importedFrom?.tags).toEqual(['cncf', 'istio'])
  })

  it('returns a unique mission ID', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let id1 = ''
    let id2 = ''
    act(() => {
      id1 = result.current.saveMission({ title: 'A', description: 'A', type: 'deploy', initialPrompt: 'a' })
    })
    act(() => {
      id2 = result.current.saveMission({ title: 'B', description: 'B', type: 'deploy', initialPrompt: 'b' })
    })
    expect(id1).not.toBe(id2)
    expect(id1.startsWith('mission-')).toBe(true)
  })
})

// ── renameMission ────────────────────────────────────────────────────────────

describe('renameMission', () => {
  it('updates the mission title', () => {
    const missionId = seedMission({ title: 'Old Title' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, 'New Title') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('New Title')
  })

  it('trims whitespace from the new title', () => {
    const missionId = seedMission({ title: 'Original' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, '  Trimmed  ') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('Trimmed')
  })

  it('is a no-op when the new title is empty or whitespace-only', () => {
    const missionId = seedMission({ title: 'Keep Me' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.renameMission(missionId, '   ') })
    expect(result.current.missions.find(m => m.id === missionId)?.title).toBe('Keep Me')
  })

  it('updates the updatedAt timestamp', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    const before = result.current.missions.find(m => m.id === missionId)?.updatedAt
    act(() => { result.current.renameMission(missionId, 'Renamed') })
    const after = result.current.missions.find(m => m.id === missionId)?.updatedAt
    expect(after!.getTime()).toBeGreaterThanOrEqual(before!.getTime())
  })
})

// ── runSavedMission ──────────────────────────────────────────────────────────

describe('runSavedMission', () => {
  function seedSavedMission(overrides: Partial<{
    id: string; steps: Array<{ title: string; description: string }>; tags: string[]
  }> = {}) {
    const mission = {
      id: overrides.id ?? 'saved-mission-1',
      title: 'Saved Mission',
      description: 'Deploy something',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      importedFrom: {
        title: 'Saved Mission',
        description: 'Deploy something',
        steps: overrides.steps,
        tags: overrides.tags,
      },
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))
    return mission.id
  }

  it('transitions a saved mission to pending and then running', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId) })
    // Should have a user message now
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.messages.some(m => m.role === 'user')).toBe(true)
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    // Should transition to running when WS opens
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
    const updated = result.current.missions.find(m => m.id === missionId)
    expect(updated?.status).toBe('running')
  })

  it('is a no-op for a non-saved mission', () => {
    const missionId = seedMission({ status: 'completed' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    const before = result.current.missions.find(m => m.id === missionId)?.status
    act(() => { result.current.runSavedMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe(before)
  })

  it('is a no-op for a non-existent mission', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.runSavedMission('nonexistent-id') })
    expect(result.current.missions).toHaveLength(0)
  })

  it('builds prompt from steps when importedFrom has steps', async () => {
    const missionId = seedSavedMission({
      steps: [
        { title: 'Step 1', description: 'First step' },
        { title: 'Step 2', description: 'Second step' },
      ],
    })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId) })
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Step 1')
    expect(payload.prompt).toContain('Step 2')
  })

  it('injects single cluster targeting into the prompt', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId, 'cluster-a') })
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target cluster: cluster-a')
    expect(payload.prompt).toContain('--context=cluster-a')
  })

  it('injects multi-cluster targeting into the prompt', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId, 'cluster-a, cluster-b') })
    // Flush microtask queue so the preflight .then() chain resolves
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target clusters: cluster-a, cluster-b')
  })

  it('fails the mission when ensureConnection rejects', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true) // demo mode rejects connection
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => { result.current.runSavedMission(missionId) })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Local Agent Not Connected'))).toBe(true)
  })
})

// ── Cluster targeting in startMission ────────────────────────────────────────

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

describe('progress tracking', () => {
  it('updates progress percentage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Analyzing...', progress: 50 },
      })
    })

    expect(result.current.missions[0].progress).toBe(50)
  })

  it('tracks token usage from progress messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 200, total: 300 } },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.tokenUsage).toEqual({ input: 100, output: 200, total: 300 })
  })

  it('updates token usage from result messages', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done',
          agent: 'claude-code',
          sessionId: 'test',
          done: true,
          usage: { inputTokens: 500, outputTokens: 250, totalTokens: 750 },
        },
      })
    })

    expect(result.current.missions[0].tokenUsage).toEqual({ input: 500, output: 250, total: 750 })
  })
})

// ── setActiveMission ─────────────────────────────────────────────────────────

describe('setActiveMission', () => {
  it('opens the sidebar when setting an active mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)

    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.isSidebarOpen).toBe(true)
    expect(result.current.activeMission?.id).toBe(missionId)
  })

  it('clears activeMission when passed null', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setActiveMission(missionId) })
    expect(result.current.activeMission).not.toBeNull()

    act(() => { result.current.setActiveMission(null) })

    expect(result.current.activeMission).toBeNull()
  })

  it('marks mission as read when viewing it', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Background the mission and trigger unread
    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: '', done: true } })
    })
    expect(result.current.unreadMissionIds.has(missionId)).toBe(true)

    // View the mission
    act(() => { result.current.setActiveMission(missionId) })

    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ── Cancelling mission with terminal messages ────────────────────────────────

describe('cancelling mission receives terminal messages', () => {
  it('finalizes cancellation on cancel_ack while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend sends cancel_ack confirming the cancellation
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('finalizes cancellation on cancel_ack with failure while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    // Backend sends cancel_ack with failure
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Cancelled with error' },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  it('finalizes cancellation on cancel_confirmed while cancelling', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    // Backend sends cancel_confirmed (alternative ack type)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-confirmed-${Date.now()}`,
        type: 'cancel_confirmed',
        payload: { sessionId: missionId, success: true },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  // #8106 — The Go backend's handleCancelChat actually emits
  // `type: "result"` with `{cancelled, sessionId}`. The frontend must accept
  // this shape as a cancel acknowledgement; otherwise the mission stays stuck
  // in `cancelling` until the client-side fallback timeout fires.
  it('finalizes cancellation on result message with cancelled:true (handleCancelChat shape)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend replies with the real handleCancelChat shape: a `result`
    // message carrying `{cancelled, sessionId}` and keyed by the cancel
    // request's own id (which is NOT in pendingRequests).
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: true, sessionId: missionId },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('finalizes cancellation on result message with cancelled:false as failure', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: false, sessionId: missionId, message: 'no active session' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancellation failed') || m.content.includes('no active session'))).toBe(true)
  })

  it('ignores non-terminal messages while cancelling (e.g., progress)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Still processing...' },
      })
    })

    // Should still be in cancelling, not updated
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('handles cancel_ack with success:false', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-ack-${Date.now()}`,
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Cancel failed on backend' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('Cancel failed on backend'))).toBe(true)
  })

  it('handles cancel_confirmed message type (alternate ack)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-confirm-${Date.now()}`,
        type: 'cancel_confirmed',
        payload: { sessionId: missionId, success: true },
      })
    })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelled')
  })

  // #9477 — When the backend sends `{type: "result", payload: {cancelled: true}}`
  // WITHOUT a `sessionId` field, the hook should resolve the mission ID from
  // the active cancel intents and still finalize the cancellation instead of
  // leaving the UI stuck on "Cancelling..." forever.
  it('finalizes cancellation on result with cancelled:true but no sessionId (#9477)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')

    // Backend replies with cancelled:true but omits sessionId entirely
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: `cancel-${Date.now()}`,
        type: 'result',
        payload: { cancelled: true },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancelled by user'))).toBe(true)
  })

  it('prevents double-cancel (no duplicate timeout)', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => { result.current.cancelMission(missionId) })
    // Second cancel should be a no-op
    act(() => { result.current.cancelMission(missionId) })

    expect(result.current.missions.find(m => m.id === missionId)?.status).toBe('cancelling')
  })

  it('HTTP cancel fallback handles failure response', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('cancellation failed'))).toBe(true)
  })

  it('HTTP cancel fallback handles network error', async () => {
    const missionId = seedMission({ status: 'running' })
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.cancelMission(missionId) })

    await act(async () => { await Promise.resolve() })
    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('backend unreachable'))).toBe(true)
  })
})
