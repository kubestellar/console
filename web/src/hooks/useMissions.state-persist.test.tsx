import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

// ── Streaming messages ────────────────────────────────────────────────────────

describe('WebSocket stream messages', () => {
  it('creates an assistant message on first stream chunk', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: 'Hello', done: false },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].content).toBe('Hello')
  })

  it('appends subsequent stream chunks to the existing assistant message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: 'Hello', done: false } })
    })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: ' World', done: false } })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect(assistantMsgs[0].content).toBe('Hello World')
  })

  it('creates an assistant message on result message type', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: { content: 'Task completed successfully.', done: true },
      })
    })

    const mission = result.current.missions[0]
    const assistantMsgs = mission.messages.filter(m => m.role === 'assistant')
    expect(assistantMsgs.length).toBeGreaterThan(0)
    expect(assistantMsgs[assistantMsgs.length - 1].content).toContain('Task completed successfully.')
  })

  it('updates progress step on progress message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Querying cluster...' },
      })
    })

    expect(result.current.missions[0].currentStep).toBe('Querying cluster...')
  })
})

// ── Unread tracking ───────────────────────────────────────────────────────────

describe('unread tracking', () => {
  it('unreadMissionCount increments when a backgrounded mission gets a stream-done message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)
    // Move the sidebar to a state where this mission is backgrounded (no active mission)
    act(() => {
      result.current.setActiveMission(null)
    })

    expect(result.current.unreadMissionCount).toBe(0)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true },
      })
    })

    expect(result.current.unreadMissionCount).toBeGreaterThan(0)
  })

  it('markMissionAsRead decrements the count and removes from unreadMissionIds', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => { result.current.setActiveMission(null) })
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({ id: requestId, type: 'stream', payload: { content: '', done: true } })
    })
    expect(result.current.unreadMissionCount).toBeGreaterThan(0)

    act(() => {
      result.current.markMissionAsRead(missionId)
    })

    expect(result.current.unreadMissionCount).toBe(0)
    expect(result.current.unreadMissionIds.has(missionId)).toBe(false)
  })
})

// ── Demo mode ─────────────────────────────────────────────────────────────────

describe('demo mode', () => {
  it('does NOT open WebSocket when demo mode is active', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => {
      result.current.startMission(defaultParams)
    })

    expect(MockWebSocket.lastInstance).toBeNull()
  })

  it('returns pre-populated demo missions when localStorage has no data', () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })
    // Demo mode seeds with pre-populated missions so the feature is visible
    expect(result.current.missions.length).toBeGreaterThan(0)
  })

  it('startMission in demo mode transitions mission to failed (no agent)', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const { result } = renderHook(() => useMissions(), { wrapper })

    await act(async () => {
      result.current.startMission(defaultParams)
    })

    expect(result.current.missions[0].status).toBe('failed')
  })
})

// ── Sidebar state ─────────────────────────────────────────────────────────────

describe('sidebar state', () => {
  it('toggleSidebar flips isSidebarOpen from false to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isSidebarOpen).toBe(false)

    act(() => { result.current.toggleSidebar() })

    expect(result.current.isSidebarOpen).toBe(true)
  })

  it('toggleSidebar flips isSidebarOpen from true to false', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.openSidebar() })
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

  it('openSidebar also expands a minimized sidebar', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.minimizeSidebar() })
    expect(result.current.isSidebarMinimized).toBe(true)

    act(() => { result.current.openSidebar() })

    expect(result.current.isSidebarMinimized).toBe(false)
  })

  it('setFullScreen sets isFullScreen to true', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setFullScreen(true) })
    expect(result.current.isFullScreen).toBe(true)
  })

  it('closeSidebar also exits fullscreen', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setFullScreen(true) })
    act(() => { result.current.closeSidebar() })
    expect(result.current.isFullScreen).toBe(false)
  })
})

// ── rateMission ───────────────────────────────────────────────────────────────

describe('rateMission', () => {
  it('records positive feedback on the mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'positive') })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.feedback).toBe('positive')
  })

  it('records negative feedback on the mission', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'negative') })

    const mission = result.current.missions.find(m => m.id === missionId)
    expect(mission?.feedback).toBe('negative')
  })

  it('calls emitMissionRated analytics event', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.rateMission(missionId, 'positive') })

    expect(emitMissionRated).toHaveBeenCalledWith('troubleshoot', 'positive')
  })
})

// ── dismissMission ────────────────────────────────────────────────────────────

describe('dismissMission', () => {
  it('removes the mission from the list', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions).toHaveLength(1)

    act(() => { result.current.dismissMission(missionId) })

    expect(result.current.missions).toHaveLength(0)
  })

  it('clears activeMission when the active mission is dismissed', () => {
    const missionId = seedMission()
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.setActiveMission(missionId) })
    expect(result.current.activeMission?.id).toBe(missionId)

    act(() => { result.current.dismissMission(missionId) })

    expect(result.current.activeMission).toBeNull()
  })
})

// ── Persistence ───────────────────────────────────────────────────────────────

describe('persistence', () => {
  it('missions loaded from localStorage appear in state', () => {
    seedMission({ id: 'persisted-1', title: 'Persisted Mission' })
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions.some(m => m.id === 'persisted-1')).toBe(true)
  })

  it('missions are saved to localStorage when state changes', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.startMission(defaultParams) })
    // Flush the 500ms debounced save timer (#9617)
    act(() => { vi.advanceTimersByTime(600) })
    const stored = localStorage.getItem('kc_missions')
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('state is preserved across re-renders (context value stability)', () => {
    const { result, rerender } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.startMission(defaultParams) })
    const missionsBefore = result.current.missions.length

    rerender()

    expect(result.current.missions.length).toBe(missionsBefore)
  })
})

// ── Quota / pruning ─────────────────────────────────────────────────────────

describe('localStorage quota handling', () => {
  /**
   * Helper: build a minimal serialised mission object.
   */
  function makeMission(overrides: Partial<{
    id: string; status: string; updatedAt: string
  }> = {}) {
    return {
      id: overrides.id ?? `m-${Math.random()}`,
      title: 'M',
      description: 'D',
      type: 'troubleshoot',
      status: overrides.status ?? 'completed',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    }
  }

  it('prunes completed/failed missions but preserves saved (library) missions on QuotaExceededError', () => {
    // Seed a mix of saved (library), completed, and active missions
    const saved1 = makeMission({ id: 'saved-1', status: 'saved' })
    const saved2 = makeMission({ id: 'saved-2', status: 'saved' })
    const completed1 = makeMission({ id: 'completed-1', status: 'completed', updatedAt: '2020-01-01T00:00:00Z' })
    const completed2 = makeMission({ id: 'completed-2', status: 'completed', updatedAt: '2025-01-01T00:00:00Z' })
    const failed1 = makeMission({ id: 'failed-1', status: 'failed', updatedAt: '2019-01-01T00:00:00Z' })
    const pending1 = makeMission({ id: 'pending-1', status: 'pending' })

    localStorage.setItem('kc_missions', JSON.stringify([
      saved1, saved2, completed1, completed2, failed1, pending1,
    ]))

    // Intercept setItem: throw QuotaExceededError on the FIRST kc_missions
    // write (the save triggered by useEffect), then allow the retry.
    // NOTE: In Vitest 4 / jsdom, localStorage.setItem is a direct own property,
    // not inherited from Storage.prototype, so we must patch the instance directly.
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

    // Mount — loadMissions() then saveMissions() via useEffect (debounced 500ms)
    renderHook(() => useMissions(), { wrapper })
    act(() => { vi.advanceTimersByTime(600) })

    // The pruning path must have retried
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    // Verify pruned data was saved (second write succeeded)
    const stored = JSON.parse(localStorage.getItem('kc_missions')!)
    // All saved (library) missions must still be present
    expect(stored.some((m: { id: string }) => m.id === 'saved-1')).toBe(true)
    expect(stored.some((m: { id: string }) => m.id === 'saved-2')).toBe(true)
    // Active missions must still be present
    expect(stored.some((m: { id: string }) => m.id === 'pending-1')).toBe(true)

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('detects QuotaExceededError via legacy numeric code 22', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    let missionWriteCount = 0
    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        missionWriteCount++
        if (missionWriteCount === 1) {
          // Simulate legacy code-22 DOMException (no named exception)
          const err = new DOMException('quota exceeded')
          Object.defineProperty(err, 'code', { value: 22 })
          Object.defineProperty(err, 'name', { value: '' })
          throw err
        }
      }
      return realSetItem(key, value)
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })
    act(() => { vi.advanceTimersByTime(600) })

    // The pruning branch should have fired (retry = missionWriteCount >= 2)
    expect(missionWriteCount).toBeGreaterThanOrEqual(2)
    expect(warnSpy).toHaveBeenCalledWith('[Missions] localStorage quota exceeded, pruning old missions')

    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })

  it('logs the error and clears storage when pruning still exceeds quota', () => {
    const completed1 = makeMission({ id: 'c1', status: 'completed' })
    localStorage.setItem('kc_missions', JSON.stringify([completed1]))

    const realSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return realSetItem(key, value)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => useMissions(), { wrapper })
    act(() => { vi.advanceTimersByTime(600) })

    // Should log the inner retry error (not silently swallow it)
    expect(errorSpy).toHaveBeenCalledWith(
      '[Missions] localStorage still full after stripping messages, clearing missions',
    )

    // Storage should have been cleared as a last resort
    expect(localStorage.getItem('kc_missions')).toBeNull()

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
