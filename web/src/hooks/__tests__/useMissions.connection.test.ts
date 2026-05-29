/**
 * Tests for useMissions.connection — createMissionConnectionApi
 *
 * Covers WebSocket lifecycle: demo rejection, auth URL injection, reconnect
 * age guards, wsSend retry timer cleanup, unmount safety, and close handling.
 * Part of #4189 / #16017.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  isDemoModeForced: false,
  default: vi.fn(() => false),
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/analytics', () => ({
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionStarted: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws' }
})

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: vi.fn(async (url: string) => `${url}?token=test-auth`),
}))

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import { getDemoMode } from '../useDemoMode'
import { appendWsAuthToken } from '../../lib/utils/wsAuth'
import { createMissionConnectionApi } from '../useMissions.connection'
import { createMissionStateUtils } from '../useMissions.state'
import {
  MISSION_RECONNECT_DELAY_MS,
  MISSION_RECONNECT_MAX_AGE_MS,
} from '../useMissions.constants'
import type { Mission } from '../useMissionTypes'
import type { MissionProviderState } from '../useMissions.state'

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

/** Delay used by wsSend while socket is CONNECTING (defined inline in source). */
const WS_SEND_CONNECTING_RETRY_DELAY_MS_LOCAL = 250

type WsEventHandler = (event?: Event | MessageEvent) => void

interface MockWs {
  onopen: WsEventHandler | null
  onmessage: WsEventHandler | null
  onerror: WsEventHandler | null
  onclose: WsEventHandler | null
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
  url: string
  _triggerOpen: () => void
  _triggerClose: () => void
}

function createMockWs(url = 'ws://localhost:8585/ws?token=test-auth'): MockWs {
  const ws: MockWs = {
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn(function(this: MockWs) {
      this.readyState = WS_CLOSED
      this.onclose?.(new Event('close'))
    }),
    readyState: WS_CONNECTING,
    url,
    _triggerOpen() {
      this.readyState = WS_OPEN
      this.onopen?.(new Event('open'))
    },
    _triggerClose() {
      this.readyState = WS_CLOSED
      this.onclose?.(new Event('close'))
    },
  }
  return ws
}

let wsInstances: MockWs[] = []
let latestWs: MockWs | null = null

function makeState(overrides: Partial<MissionProviderState> = {}): MissionProviderState {
  return {
    missions: [],
    setMissions: vi.fn(),
    isAgentConnected: false,
    activeMissionId: null,
    setActiveMissionId: vi.fn(),
    isSidebarOpen: false,
    setIsSidebarOpen: vi.fn(),
    isSidebarMinimized: false,
    setIsSidebarMinimized: vi.fn(),
    isFullScreen: false,
    setIsFullScreen: vi.fn(),
    pendingReviewQueue: [],
    setPendingReviewQueue: vi.fn(),
    unreadMissionIds: new Set(),
    setUnreadMissionIds: vi.fn(),
    agents: [],
    setAgents: vi.fn(),
    selectedAgent: null,
    setSelectedAgent: vi.fn(),
    defaultAgent: null,
    setDefaultAgent: vi.fn(),
    agentsLoading: false,
    setAgentsLoading: vi.fn(),
    unmountedRef: { current: false },
    lastWrittenAtRef: { current: 0 },
    suppressNextSaveRef: { current: false },
    wsRef: { current: null },
    pendingRequests: { current: new Map() },
    lastStreamTimestamp: { current: new Map() },
    cancelTimeouts: { current: new Map() },
    cancelIntents: { current: new Set() },
    waitingInputTimeouts: { current: new Map() },
    missionsRef: { current: [] },
    activeMissionIdRef: { current: null },
    isSidebarOpenRef: { current: false },
    selectedAgentRef: { current: null },
    defaultAgentRef: { current: null },
    handleAgentMessageRef: { current: () => {} },
    wsReconnectTimer: { current: null },
    wsReconnectAttempts: { current: 0 },
    connectionEstablished: { current: false },
    toolsInFlight: { current: new Map() },
    streamSplitCounter: { current: new Map() },
    wsOpenEpoch: { current: 0 },
    wsSendRetryTimers: { current: new Set<ReturnType<typeof setTimeout>>() },
    missionStatusTimers: { current: new Map() },
    observedToolExecutions: { current: new Set() },
    queuedMissionExecutions: { current: [] },
    missionToolLocks: { current: new Map() },
    executingMissions: { current: new Set() },
    selectAgentPending: { current: null },
    ...overrides,
  } as MissionProviderState
}

function makeMission(
  id: string,
  overrides: Partial<Mission> = {},
): Mission {
  return {
    id,
    title: `Mission ${id}`,
    description: '',
    type: 'custom',
    status: 'running',
    messages: [
      {
        id: `msg-user-${id}`,
        role: 'user',
        content: 'Do something',
        timestamp: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    context: { needsReconnect: true },
    ...overrides,
  }
}

function applySetMissions(
  state: MissionProviderState,
  missions: Mission[],
  callIndex = -1,
): Mission[] {
  const calls = vi.mocked(state.setMissions).mock.calls
  const call = callIndex === -1 ? calls[calls.length - 1] : calls[callIndex]
  if (!call) throw new Error('setMissions not called')
  return (call[0] as (prev: Mission[]) => Mission[])(missions)
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  wsInstances = []
  latestWs = null
  vi.useFakeTimers()
  vi.mocked(getDemoMode).mockReturnValue(false)
  vi.mocked(appendWsAuthToken).mockImplementation(async (url: string) => `${url}?token=test-auth`)

  const MockWebSocket = vi.fn(function(this: unknown, url: string) {
    const ws = createMockWs(url)
    wsInstances.push(ws)
    latestWs = ws
    return ws
  }) as unknown as typeof WebSocket

  Object.defineProperties(MockWebSocket, {
    CONNECTING: { value: WS_CONNECTING },
    OPEN: { value: WS_OPEN },
    CLOSING: { value: WS_CLOSING },
    CLOSED: { value: WS_CLOSED },
  })

  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('createMissionConnectionApi', () => {
  it('rejects ensureConnection in demo mode without opening a WebSocket', async () => {
    vi.mocked(getDemoMode).mockReturnValue(true)
    const state = makeState()
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    await expect(api.ensureConnection()).rejects.toThrow('Agent unavailable in demo mode')
    expect(WebSocket).not.toHaveBeenCalled()
    expect(state.setAgentsLoading).not.toHaveBeenCalled()
  })

  it('clears wsSend retry timers when the socket closes unexpectedly', async () => {
    const state = makeState()
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    void api.ensureConnection().catch(() => {})
    await flushMicrotasks()
    expect(latestWs).not.toBeNull()

    // Leave socket CONNECTING so wsSend queues retry timers
    api.wsSend(JSON.stringify({ type: 'chat', payload: { prompt: 'hello' } }))
    expect(state.wsSendRetryTimers.current.size).toBeGreaterThan(0)

    latestWs!._triggerClose()

    expect(state.wsSendRetryTimers.current.size).toBe(0)
  })

  it('marks stale reconnect missions as failed after max reconnect age', async () => {
    const staleUpdatedAt = new Date(Date.now() - MISSION_RECONNECT_MAX_AGE_MS - 1_000)
    const staleMission = makeMission('stale-mission', {
      updatedAt: staleUpdatedAt,
      status: 'running',
      context: { needsReconnect: true },
    })
    const state = makeState({
      missionsRef: { current: [staleMission] },
    })
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    const connectPromise = api.ensureConnection()
    await flushMicrotasks()
    latestWs!._triggerOpen()
    await connectPromise

    const updated = applySetMissions(state, [staleMission])
    const result = updated.find(mission => mission.id === 'stale-mission')
    expect(result?.status).toBe('failed')
    expect(result?.context?.needsReconnect).toBe(false)
    expect(result?.messages.some(message => message.content.includes('Mission session expired'))).toBe(true)
  })

  it('does not resend reconnect history after component unmounts', async () => {
    const mission = makeMission('resume-mission', {
      status: 'running',
      context: { needsReconnect: true },
      updatedAt: new Date(),
    })
    const state = makeState({
      missionsRef: { current: [mission] },
    })
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    const connectPromise = api.ensureConnection()
    await flushMicrotasks()
    latestWs!._triggerOpen()
    await connectPromise

    // Mark unmounted before reconnect delay fires
    state.unmountedRef.current = true
    vi.advanceTimersByTime(MISSION_RECONNECT_DELAY_MS + 1)

    expect(latestWs!.send).not.toHaveBeenCalledWith(
      expect.stringContaining('"isResume":true'),
    )
  })

  it('appends auth token to the WebSocket URL before connecting', async () => {
    const state = makeState()
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    const connectPromise = api.ensureConnection()
    await flushMicrotasks()

    expect(appendWsAuthToken).toHaveBeenCalledWith('ws://localhost:8585/ws')
    expect(latestWs?.url).toContain('token=test-auth')

    latestWs!._triggerOpen()
    await connectPromise
  })

  it('resolves ensureConnection immediately if socket is already OPEN', async () => {
    const openWs = createMockWs()
    openWs.readyState = WS_OPEN
    const state = makeState({
      wsRef: { current: openWs as unknown as WebSocket },
    })
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    await expect(api.ensureConnection()).resolves.toBeUndefined()
    expect(WebSocket).not.toHaveBeenCalled()
    expect(state.setAgentsLoading).not.toHaveBeenCalled()
  })

  it('queues wsSend calls while connection is CONNECTING and flushes on open', async () => {
    const state = makeState()
    const api = createMissionConnectionApi(state, createMissionStateUtils(state))

    const connectPromise = api.ensureConnection()
    await flushMicrotasks()
    expect(latestWs!.readyState).toBe(WS_CONNECTING)

    const payload = JSON.stringify({ type: 'chat', payload: { prompt: 'queued' } })
    api.wsSend(payload)
    expect(latestWs!.send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(WS_SEND_CONNECTING_RETRY_DELAY_MS_LOCAL)
    expect(latestWs!.send).not.toHaveBeenCalled()

    latestWs!._triggerOpen()
    await connectPromise

    vi.advanceTimersByTime(WS_SEND_CONNECTING_RETRY_DELAY_MS_LOCAL)
    expect(latestWs!.send).toHaveBeenCalledWith(payload)
  })

  it('calls onDisconnect callback exactly once per close event', async () => {
    const mission = makeMission('pending-mission', {
      status: 'running',
      context: { needsReconnect: false },
    })
    const state = makeState({
      missionsRef: { current: [mission] },
    })
    state.pendingRequests.current.set('req-1', 'pending-mission')

    const api = createMissionConnectionApi(state, createMissionStateUtils(state))
    const connectPromise = api.ensureConnection()
    await flushMicrotasks()
    latestWs!._triggerOpen()
    await connectPromise

    vi.mocked(state.setAgentsLoading).mockClear()
    vi.mocked(state.setMissions).mockClear()

    latestWs!._triggerClose()

    expect(state.setAgentsLoading).toHaveBeenCalledTimes(1)
    expect(state.setAgentsLoading).toHaveBeenCalledWith(false)
    expect(state.setMissions).toHaveBeenCalledTimes(1)
  })
})
