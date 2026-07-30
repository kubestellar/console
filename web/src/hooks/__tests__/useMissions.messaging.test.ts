/**
 * Tests for useMissions.messaging — createMissionMessagingActions
 *
 * Covers stop keywords, pending cancel, HTTP cancel fallback, cancel-ack
 * timeout, chat history deduplication, editAndResend guards, and CLOSING ws.
 * Part of #4189 / #16023.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../useLocalAgent', () => ({
  reportAgentActivity: vi.fn(),
}))

vi.mock('../mcp/agentFetch', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../useTokenUsage', () => ({
  setActiveTokenCategory: vi.fn(),
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({
  discoverKagentiProviderAgent: vi.fn(),
  kagentiProviderChat: vi.fn(),
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
}
))

vi.mock('../useMissions.helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useMissions.helpers')>()
  return {
    ...actual,
    generateMessageId: vi.fn(() => 'mock-msg-id'),
    generateRequestId: vi.fn(() => 'mock-request-id'),
    getMissionMessages: vi.fn((msgs?: unknown[]) => msgs ?? []),
    getSelectedKagentiAgentFromStorage: vi.fn(() => null),
  }
})

vi.mock('../useMissions.constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useMissions.constants')>()
  return {
    ...actual,
    CANCEL_ACK_TIMEOUT_MS: 1_000,
  }
})

import { createMissionMessagingActions } from '../useMissions.messaging'
import { createMissionStateUtils } from '../useMissions.state'
import { agentFetch } from '../mcp/agentFetch'
import { CANCEL_ACK_TIMEOUT_MS } from '../useMissions.constants'
import type { Mission } from '../useMissionTypes'
import type { MissionProviderState } from '../useMissions.state'

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSING = 2
const WS_CLOSED = 3

const STOP_KEYWORDS = ['stop', 'cancel', 'abort', 'halt', 'quit'] as const

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
    selectedAgentRef: { current: 'claude-code' },
    defaultAgentRef: { current: null },
    handleAgentMessageRef: { current: () => {} },
    wsReconnectTimer: { current: null },
    wsReconnectAttempts: { current: 0 },
    connectionEstablished: { current: false },
    toolsInFlight: { current: new Map() },
    streamSplitCounter: { current: new Map() },
    wsOpenEpoch: { current: 0 },
    wsSendRetryTimers: { current: new Set() },
    missionStatusTimers: { current: new Map() },
    observedToolExecutions: { current: new Set() },
    queuedMissionExecutions: { current: [] },
    missionToolLocks: { current: new Map() },
    executingMissions: { current: new Set() },
    selectAgentPending: { current: null },
    ...overrides,
  } as MissionProviderState
}

function makeMission(id: string, overrides: Partial<Mission> = {}): Mission {
  return {
    id,
    title: `Mission ${id}`,
    description: '',
    type: 'custom',
    status: 'waiting_input',
    messages: [
      {
        id: 'msg-user-1',
        role: 'user',
        content: 'Hello agent',
        timestamp: new Date(),
      },
      {
        id: 'msg-assistant-1',
        role: 'assistant',
        content: 'Hi there',
        timestamp: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/** Mirrors React effect: keep missionsRef in sync when setMissions runs. */
function wireMissionsSync(state: MissionProviderState, initialMissions: Mission[]) {
  state.missionsRef.current = initialMissions
  state.setMissions = vi.fn((updater: Mission[] | ((prev: Mission[]) => Mission[])) => {
    state.missionsRef.current = typeof updater === 'function'
      ? updater(state.missionsRef.current)
      : updater
  }) as MissionProviderState['setMissions']
}

function applySetMissions(state: MissionProviderState, missions: Mission[]): Mission[] {
  return vi.mocked(state.setMissions).mock.calls.reduce(
    (current, call) => (call[0] as (prev: Mission[]) => Mission[])(current),
    missions,
  )
}

function createMockWs(readyState: number) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  }
}

function makeConnectionApi(wsSend = vi.fn()) {
  return {
    ensureConnection: vi.fn(() => Promise.resolve()),
    wsSend,
  }
}

function makeMessaging(state: MissionProviderState, connectionApi = makeConnectionApi()) {
  const stateUtils = createMissionStateUtils(state)
  const actions = createMissionMessagingActions(state, stateUtils, connectionApi)
  return { actions, stateUtils, connectionApi }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.mocked(agentFetch).mockResolvedValue({
    ok: true,
    json: async () => ({ cancelled: true }),
  } as Response)

  const MockWebSocket = vi.fn() as unknown as typeof WebSocket
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
})

describe('createMissionMessagingActions', () => {
  it('treats "stop", "cancel", "abort", "halt", "quit" as cancellation commands', async () => {
    for (const keyword of STOP_KEYWORDS) {
      const mission = makeMission(`mission-stop-${keyword}`, { status: 'running' })
      const state = makeState()
      wireMissionsSync(state, [mission])
      state.wsRef.current = createMockWs(WS_OPEN) as unknown as WebSocket

      const { actions } = makeMessaging(state)
      actions.sendMessage(`mission-stop-${keyword}`, keyword)
      await flushMicrotasks()

      const updated = applySetMissions(state, [mission])
      const result = updated.find(entry => entry.id === `mission-stop-${keyword}`)
      expect(result?.status).toBe('cancelling')
      expect(state.cancelIntents.current.has(`mission-stop-${keyword}`)).toBe(true)
    }
  })

  it('cancels a pending mission without calling the backend', () => {
    const mission = makeMission('mission-pending', { status: 'pending', messages: [] })
    const state = makeState()
    wireMissionsSync(state, [mission])
    state.wsRef.current = createMockWs(WS_OPEN) as unknown as WebSocket

    const wsSend = vi.fn()
    const { actions } = makeMessaging(state, makeConnectionApi(wsSend))

    actions.cancelMission('mission-pending')

    expect(agentFetch).not.toHaveBeenCalled()
    expect(state.wsRef.current?.send).not.toHaveBeenCalled()
    expect(wsSend).not.toHaveBeenCalled()

    const updated = applySetMissions(state, [mission])
    expect(updated.find(entry => entry.id === 'mission-pending')?.status).toBe('cancelled')
  })

  it('falls back to HTTP cancel when WebSocket is already closed', async () => {
    const mission = makeMission('mission-http-cancel', { status: 'running' })
    const state = makeState()
    wireMissionsSync(state, [mission])
    state.wsRef.current = createMockWs(WS_CLOSED) as unknown as WebSocket

    const { actions } = makeMessaging(state)
    actions.cancelMission('mission-http-cancel')
    await flushMicrotasks()

    expect(agentFetch).toHaveBeenCalledWith(
      expect.stringContaining('/cancel-chat'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'mission-http-cancel' }),
      }),
    )
    expect(state.wsRef.current?.send).not.toHaveBeenCalled()
  })

  it('sets cancel acknowledgement timeout and finalizes mission on timeout expiry', () => {
    const mission = makeMission('mission-timeout', { status: 'running' })
    const state = makeState()
    wireMissionsSync(state, [mission])
    state.wsRef.current = createMockWs(WS_OPEN) as unknown as WebSocket

    const { actions } = makeMessaging(state)
    actions.cancelMission('mission-timeout')

    expect(state.cancelTimeouts.current.has('mission-timeout')).toBe(true)

    vi.advanceTimersByTime(CANCEL_ACK_TIMEOUT_MS)

    const updated = applySetMissions(state, [mission])
    const result = updated.find(entry => entry.id === 'mission-timeout')
    expect(result?.status).toBe('cancelled')
    expect(result?.messages.some(message =>
      message.content.includes('backend did not confirm cancellation in time'),
    )).toBe(true)
    expect(state.cancelTimeouts.current.has('mission-timeout')).toBe(false)
  })

  it('clears cancel acknowledgement timeout when ack is received before expiry', () => {
    const mission = makeMission('mission-ack', { status: 'running' })
    const state = makeState()
    wireMissionsSync(state, [mission])
    state.wsRef.current = createMockWs(WS_OPEN) as unknown as WebSocket

    const stateUtils = createMissionStateUtils(state)
    const finalizeSpy = vi.spyOn(stateUtils, 'finalizeCancellation')
    const actions = createMissionMessagingActions(state, stateUtils, makeConnectionApi())

    actions.cancelMission('mission-ack')
    expect(state.cancelTimeouts.current.has('mission-ack')).toBe(true)

    stateUtils.finalizeCancellation('mission-ack', 'Mission cancelled by user.')
    expect(state.cancelTimeouts.current.has('mission-ack')).toBe(false)

    vi.advanceTimersByTime(CANCEL_ACK_TIMEOUT_MS)

    expect(finalizeSpy).toHaveBeenCalledTimes(1)
    expect(finalizeSpy).toHaveBeenCalledWith('mission-ack', 'Mission cancelled by user.')
  })

  it('builds chat history without duplicating the latest user message', async () => {
    const mission = makeMission('mission-history', {
      status: 'waiting_input',
      messages: [
        { id: 'u1', role: 'user', content: 'Earlier question', timestamp: new Date() },
        { id: 'a1', role: 'assistant', content: 'Sure', timestamp: new Date() },
      ],
    })
    const state = makeState()
    wireMissionsSync(state, [mission])

    const wsSend = vi.fn()
    const connectionApi = makeConnectionApi(wsSend)
    const { actions } = makeMessaging(state, connectionApi)

    actions.sendMessage('mission-history', 'Follow up')
    await flushMicrotasks()

    expect(wsSend).toHaveBeenCalledTimes(1)
    const payload = JSON.parse(wsSend.mock.calls[0][0] as string)
    const userEntries = payload.payload.history.filter(
      (entry: { role: string; content: string }) => entry.role === 'user' && entry.content === 'Follow up',
    )
    expect(userEntries).toHaveLength(1)
  })

  it('does not send editAndResend when the target message index does not exist', () => {
    const mission = makeMission('mission-edit', { status: 'waiting_input' })
    const state = makeState()
    wireMissionsSync(state, [mission])

    const wsSend = vi.fn()
    const { actions } = makeMessaging(state, makeConnectionApi(wsSend))

    const removed = actions.editAndResend('mission-edit', 'missing-message-id')

    expect(removed).toBeNull()
    expect(wsSend).not.toHaveBeenCalled()
    expect(state.missionsRef.current[0].messages).toHaveLength(mission.messages.length)
  })

  it('does not crash sendMessage when WebSocket is in CLOSING state', async () => {
    const mission = makeMission('mission-closing', { status: 'waiting_input' })
    const state = makeState()
    wireMissionsSync(state, [mission])
    state.wsRef.current = createMockWs(WS_CLOSING) as unknown as WebSocket

    const wsSend = vi.fn()
    const connectionApi = makeConnectionApi(wsSend)
    const { actions } = makeMessaging(state, connectionApi)

    expect(() => {
      actions.sendMessage('mission-closing', 'Continue please')
    }).not.toThrow()

    await flushMicrotasks()
    expect(connectionApi.ensureConnection).toHaveBeenCalled()
    expect(wsSend).toHaveBeenCalled()
  })
})
