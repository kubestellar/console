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

})
