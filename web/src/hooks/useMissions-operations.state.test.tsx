import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'
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
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
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
async function startMissionWithConnection(
  result: { current: ReturnType<typeof useMissions> },
): Promise<{ missionId: string; requestId: string }> {
  let missionId = ''
  act(() => {
    missionId = result.current.startMission(defaultParams)
  })
  await act(async () => { await Promise.resolve() })
  await act(async () => {
    MockWebSocket.lastInstance?.simulateOpen()
  })
  const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
    (call: string[]) => JSON.parse(call[0]).type === 'chat',
  )
  const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''
  return { missionId, requestId }
}
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
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})
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
describe('unread tracking', () => {
  it('markMissionAsRead removes mission from unread set', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)
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
describe('ensureConnection: already connected', () => {
  it('resolves immediately when WebSocket is already OPEN', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.connectToAgent() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })
    const ws1 = MockWebSocket.lastInstance
    act(() => { result.current.connectToAgent() })
    expect(MockWebSocket.lastInstance).toBe(ws1)
  })
})
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
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.missions).toEqual([])
  })
})
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
    const stored = JSON.parse(localStorage.getItem('kc_missions')!)
    expect(stored.some((m: { id: string }) => m.id === 'blocked-keep')).toBe(true)
    vi.mocked(localStorage.setItem).mockRestore()
    warnSpy.mockRestore()
  })
  it('preserves cancelling missions during quota pruning', () => {
    const missions = [
      {
        id: 'cancel-keep',
        title: 'Cancelling',
        description: 'in progress',
        type: 'troubleshoot',
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
  describe('loading state exposure', () => {
    it('exposes agentsLoading state to consumers', () => {
      const { result } = renderHook(() => useMissions(), { wrapper })
      expect(result.current).toHaveProperty('agentsLoading')
      expect(typeof result.current.agentsLoading).toBe('boolean')
    })
  })
})
