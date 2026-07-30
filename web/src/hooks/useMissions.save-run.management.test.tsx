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

  describe('loading state exposure', () => {
    it('exposes agentsLoading state to consumers', () => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      expect(result.current).toHaveProperty('agentsLoading')
      expect(typeof result.current.agentsLoading).toBe('boolean')
    })
  })
})
