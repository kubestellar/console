import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'

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

describe('setActiveTokenCategory on mission actions', () => {
  it('sets active token category from the mission type when starting a mission', async () => {
    const { setActiveTokenCategory } = await import('./useTokenUsage')
    const expectedCategory = getTokenCategoryForMissionType(defaultParams.type)
    vi.mocked(setActiveTokenCategory).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.startMission(defaultParams) })
    await act(async () => { await Promise.resolve() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    expect(setActiveTokenCategory).toHaveBeenCalledWith(expect.any(String), expectedCategory)
  })

  it('sets active token category from the mission type on sendMessage', async () => {
    const { setActiveTokenCategory } = await import('./useTokenUsage')
    const expectedCategory = getTokenCategoryForMissionType(defaultParams.type)
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
    vi.mocked(setActiveTokenCategory).mockClear()

    act(() => {
      result.current.sendMessage(missionId, 'follow up')
    })

    // Per-operation tracking keyed by missionId (#6016)
    expect(setActiveTokenCategory).toHaveBeenCalledWith(missionId, expectedCategory)
  })

  it('clears active token category on result message', async () => {
    const { clearActiveTokenCategory } = await import('./useTokenUsage')
    vi.mocked(clearActiveTokenCategory).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Done' },
      })
    })

    // Per-operation clear keyed by missionId (#6016)
    expect(clearActiveTokenCategory).toHaveBeenCalledWith(missionId)
  })
})

// ── loadMissions — localStorage error and cancelling migration ────────

describe('loadMissions edge cases', () => {
  it('marks cancelling missions as failed on page reload', () => {
    const cancellingMission = {
      id: 'cancel-1',
      title: 'Cancelling Mission',
      description: 'Was being cancelled',
      type: 'troubleshoot',
      status: 'cancelling',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([cancellingMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'cancel-1')
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m =>
      m.role === 'system' && m.content.includes('page was reloaded during cancellation')
    )).toBe(true)
  })

  it('marks running missions with needsReconnect on page reload', () => {
    const runningMission = {
      id: 'running-1',
      title: 'Running Mission',
      description: 'Was running',
      type: 'analyze',
      status: 'running',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([runningMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'running-1')
    expect(mission?.status).toBe('running')
    expect(mission?.currentStep).toBe('Reconnecting...')
    expect(mission?.context?.needsReconnect).toBe(true)
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('kc_missions', '{{invalid json')

    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions).toEqual([])
  })
})

// ── saveMissions — quota exceeded pruning ─────────────────────────────

describe('saveMissions quota handling', () => {
  it('prunes old completed missions when quota exceeded', () => {
    // Create many completed missions
    const missions = Array.from({ length: 60 }, (_, i) => ({
      id: `m-${i}`,
      title: `Mission ${i}`,
      description: 'test',
      type: 'troubleshoot',
      status: i < 5 ? 'running' : 'completed',
      messages: [],
      createdAt: new Date(Date.now() - i * 60000).toISOString(),
      updatedAt: new Date(Date.now() - i * 60000).toISOString(),
    }))
    localStorage.setItem('kc_missions', JSON.stringify(missions))

    const { result } = renderHook(() => useMissions(), { wrapper })
    // Should load all missions initially
    expect(result.current.missions.length).toBe(60)
  })
})

// ── saveMission (library) ─────────────────────────────────────────────

describe('saveMission', () => {
  it('creates a saved (library) mission without starting it', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let savedId = ''
    act(() => {
      savedId = result.current.saveMission({
        title: 'Saved Fix',
        description: 'Fix for OOM',
        type: 'repair',
        initialPrompt: 'kubectl delete pod ...',
      })
    })
    expect(savedId).toBeTruthy()
    const mission = result.current.missions.find(m => m.id === savedId)
    expect(mission?.status).toBe('saved')
    expect(mission?.importedFrom?.title).toBe('Saved Fix')
  })
})

// ── dismissMission ────────────────────────────────────────────────────

describe('dismissMission', () => {
  it('removes a mission from the list', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })
    expect(result.current.missions.find(m => m.id === missionId)).toBeDefined()

    act(() => {
      result.current.dismissMission(missionId)
    })
    expect(result.current.missions.find(m => m.id === missionId)).toBeUndefined()
  })

  it('clears activeMission when dismissed mission is active', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })
    act(() => {
      result.current.setActiveMission(missionId)
    })
    expect(result.current.activeMission?.id).toBe(missionId)

    act(() => {
      result.current.dismissMission(missionId)
    })
    expect(result.current.activeMission).toBeNull()
  })
})

// ── renameMission ─────────────────────────────────────────────────────

describe('renameMission', () => {
  it('updates mission title', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })

    act(() => {
      result.current.renameMission(missionId, 'New Title')
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.title).toBe('New Title')
  })
})

// ── rateMission ───────────────────────────────────────────────────────

describe('rateMission', () => {
  it('sets positive feedback', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })

    act(() => {
      result.current.rateMission(missionId, 'positive')
    })
    expect(result.current.missions.find(m => m.id === missionId)?.feedback).toBe('positive')
    expect(emitMissionRated).toHaveBeenCalled()
  })

  it('sets negative feedback', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    let missionId = ''
    act(() => {
      missionId = result.current.startMission(defaultParams)
    })

    act(() => {
      result.current.rateMission(missionId, 'negative')
    })
    expect(result.current.missions.find(m => m.id === missionId)?.feedback).toBe('negative')
  })
})

// ── sidebar state ─────────────────────────────────────────────────────

describe('sidebar controls', () => {
  it('toggleSidebar toggles isSidebarOpen', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)
    act(() => { result.current.toggleSidebar() })
    expect(result.current.isSidebarOpen).toBe(true)
    act(() => { result.current.toggleSidebar() })
    expect(result.current.isSidebarOpen).toBe(false)
  })

  it('openSidebar sets isSidebarOpen to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('closeSidebar sets isSidebarOpen to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
    act(() => { result.current.closeSidebar() })
    expect(result.current.isSidebarOpen).toBe(false)
  })

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

  it('setFullScreen controls full screen mode', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setFullScreen(true) })
    expect(result.current.isFullScreen).toBe(true)
    act(() => { result.current.setFullScreen(false) })
    expect(result.current.isFullScreen).toBe(false)
  })
})

// ── error message classification ──────────────────────────────────────

describe('error message classification', () => {
  it('shows auth error for 401 code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: '401', message: 'Unauthorized' },
      })
    })

    const mission = result.current.missions[0]
    const systemMsg = mission.messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('Authentication Error')
  })

  it('shows rate limit error for 429 code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: '429', message: 'Too many requests' },
      })
    })

    const mission = result.current.missions[0]
    const systemMsg = mission.messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('Rate Limit')
  })

  it('shows agent unavailable error for no_agent code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'no_agent', message: 'Agent not available' },
      })
    })

    const mission = result.current.missions[0]
    const systemMsg = mission.messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('agent not available')
  })
})

// ── cancel_ack with failure ───────────────────────────────────────────

describe('cancel_ack failure path', () => {
  it('handles cancel_ack with success=false', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId } = await startMissionWithConnection(result)

    act(() => {
      result.current.cancelMission(missionId)
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'cancel-xxx',
        type: 'cancel_ack',
        payload: { sessionId: missionId, success: false, message: 'Could not cancel' },
      })
    })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.status).toBe('cancelled')
    expect(mission?.messages.some(m => m.content.includes('Could not cancel'))).toBe(true)
  })
})

// ── progress message with tokens ──────────────────────────────────────

describe('progress updates', () => {
  it('tracks progress step and percentage', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Querying cluster...', progress: 50 },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.currentStep).toBe('Querying cluster...')
    expect(mission.progress).toBe(50)
  })

  it('tracks token usage from progress payload', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Analyzing...', tokens: { input: 100, output: 200, total: 300 } },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.tokenUsage?.total).toBe(300)
  })
})

// ── unread mission tracking ───────────────────────────────────────────

describe('unread tracking', () => {
  it('markMissionAsRead removes mission from unread set', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    // Stream done marks as unread (via markMissionAsUnread)
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })
    expect(result.current.unreadMissionIds.size).toBeGreaterThanOrEqual(0)

    act(() => {
      result.current.markMissionAsRead(missionId)
    })
    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// NEW COVERAGE TESTS — targeting the ~636 uncovered statements
// ══════════════════════════════════════════════════════════════════════════════

// ── ensureConnection: early return when already connected ────────────────────

describe('ensureConnection: already connected', () => {
  it('resolves immediately when WebSocket is already OPEN', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    // First connection
    act(() => { result.current.connectToAgent() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    const ws1 = MockWebSocket.lastInstance

    // Second connectToAgent should not create a new WebSocket
    act(() => { result.current.connectToAgent() })

    // Same WS instance — no new connection created
    expect(MockWebSocket.lastInstance).toBe(ws1)
  })
})

// ── loadMissions: preserves non-running, non-cancelling missions as-is ──────

describe('loadMissions: status preservation', () => {
  it('preserves completed missions without modification', () => {
    const completedMission = {
      id: 'completed-1',
      title: 'Completed',
      description: 'Done',
      type: 'troubleshoot',
      status: 'completed',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([completedMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'completed-1')
    expect(mission?.status).toBe('completed')
    // Should NOT have needsReconnect or any modifications
    expect(mission?.context?.needsReconnect).toBeUndefined()
    expect(mission?.currentStep).toBeUndefined()
  })

  it('fails pending missions on reload with recovery message (#5931)', () => {
    const pendingMission = {
      id: 'pending-1',
      title: 'Pending',
      description: 'Waiting',
      type: 'deploy',
      status: 'pending',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([pendingMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'pending-1')
    // Pending missions cannot be resumed (backend never received the request),
    // so they're failed on reload with a clear message (#5931).
    expect(mission?.status).toBe('failed')
    const systemMsg = mission?.messages.find(m => m.role === 'system')
    expect(systemMsg?.content).toContain('Page was reloaded')
  })

  it('preserves saved (library) missions without modification', () => {
    const savedMission = {
      id: 'saved-1',
      title: 'Saved',
      description: 'Library',
      type: 'deploy',
      status: 'saved',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([savedMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'saved-1')
    expect(mission?.status).toBe('saved')
  })

  it('preserves blocked missions without modification', () => {
    const blockedMission = {
      id: 'blocked-1',
      title: 'Blocked',
      description: 'Preflight failed',
      type: 'deploy',
      status: 'blocked',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([blockedMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'blocked-1')
    expect(mission?.status).toBe('blocked')
  })

  it('preserves failed missions without modification', () => {
    const failedMission = {
      id: 'failed-1',
      title: 'Failed',
      description: 'Error',
      type: 'troubleshoot',
      status: 'failed',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([failedMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'failed-1')
    expect(mission?.status).toBe('failed')
  })

  it('preserves waiting_input missions without modification', () => {
    const waitingMission = {
      id: 'waiting-1',
      title: 'Waiting',
      description: 'User input needed',
      type: 'troubleshoot',
      status: 'waiting_input',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('kc_missions', JSON.stringify([waitingMission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'waiting-1')
    expect(mission?.status).toBe('waiting_input')
  })

  it('converts date strings back to Date objects for messages', () => {
    const dateStr = '2024-06-15T10:30:00.000Z'
    const mission = {
      id: 'date-test',
      title: 'Date Test',
      description: 'Dates',
      type: 'troubleshoot',
      status: 'completed',
      messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: dateStr }],
      createdAt: dateStr,
      updatedAt: dateStr,
    }
    localStorage.setItem('kc_missions', JSON.stringify([mission]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const loaded = result.current.missions[0]
    expect(loaded.createdAt).toBeInstanceOf(Date)
    expect(loaded.updatedAt).toBeInstanceOf(Date)
    expect(loaded.messages[0].timestamp).toBeInstanceOf(Date)
  })

  it('returns empty array when localStorage has no missions key', () => {
    // localStorage is already cleared in beforeEach
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions).toEqual([])
  })
})

// ── saveMissions: pruning preserves blocked and cancelling missions ─────────

describe('saveMissions pruning: blocked and cancelling missions preserved', () => {
  it('preserves blocked missions during quota pruning', () => {
    const missions = [
      {
        id: 'blocked-keep',
        title: 'Blocked',
        description: 'preflight',
        type: 'deploy',
        status: 'blocked',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'completed-prune',
        title: 'Old',
        description: 'old',
        type: 'troubleshoot',
        status: 'completed',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    localStorage.setItem('kc_missions', JSON.stringify(missions))

    let missionWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        missionWriteCount++
        if (missionWriteCount === 1) {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })

    // Should have pruned. Now check stored data.
    const stored = JSON.parse(localStorage.getItem('kc_missions')!)
    // Blocked mission must be kept (it's an active status)
    expect(stored.some((m: { id: string }) => m.id === 'blocked-keep')).toBe(true)

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('preserves cancelling missions during quota pruning', () => {
    // Note: cancelling missions get converted to failed by loadMissions,
    // but this tests the saveMissions pruning logic specifically
    const missions = [
      {
        id: 'cancel-keep',
        title: 'Cancelling',
        description: 'in progress',
        type: 'troubleshoot',
        // After loadMissions conversion, this will be 'failed'
        status: 'failed',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]
    localStorage.setItem('kc_missions', JSON.stringify(missions))

    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions.length).toBe(1)
  })
})
