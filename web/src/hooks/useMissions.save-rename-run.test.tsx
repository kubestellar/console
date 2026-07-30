import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'

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
async function _startMissionWithConnection(
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
    await flushMissionPreflightChain()
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
    await flushMissionPreflightChain()
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
    await flushMissionPreflightChain()
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target cluster: cluster-a')
    expect(payload.prompt).toContain('--context=cluster-a')
    expect(payload.prompt).toContain('CRITICAL VERIFICATION REQUIREMENTS')
    expect(payload.prompt).toContain('kubectl get pods -n <namespace> and helm ls -n <namespace>')
  })

  it('injects multi-cluster targeting into the prompt', async () => {
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.runSavedMission(missionId, 'cluster-a, cluster-b') })
    await flushMissionPreflightChain()
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
      (call: string[]) => JSON.parse(call[0]).type === 'chat',
    )
    expect(chatCall).toBeDefined()
    const payload = JSON.parse(chatCall![0]).payload
    expect(payload.prompt).toContain('Target clusters: cluster-a, cluster-b')
    expect(payload.prompt).toContain('CRITICAL VERIFICATION REQUIREMENTS')
  })

  it('fails the mission when ensureConnection rejects', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true) // demo mode rejects connection
    const missionId = seedSavedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => { result.current.runSavedMission(missionId) })
    await flushMissionPreflightChain()

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('Local Agent Not Connected'))).toBe(true)
  })
})

// ── Cluster targeting in startMission ────────────────────────────────────────
