/**
 * Tests for useMissions.actions — createMissionActions
 *
 * Covers dismissMission cleanup, selectAgent coalescing, pending review
 * confirm/cancel, and rateMission persistence.
 * Part of #4189 / #16025.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockIsLocalAgentSuppressed, mockAreOptionalPollersSuppressed } = vi.hoisted(() => ({
  mockIsLocalAgentSuppressed: vi.fn(() => false),
  mockAreOptionalPollersSuppressed: vi.fn(() => false),
}))

const mockStartMission = vi.fn(() => 'started-mission-id')
const mockCancelMission = vi.fn()

vi.mock('../useMissions.start', () => ({
  createMissionStartActions: vi.fn(() => ({
    startMission: mockStartMission,
    saveMission: vi.fn(),
    runSavedMission: vi.fn(),
    retryPreflight: vi.fn(),
  })),
}))

vi.mock('../useMissions.messaging', () => ({
  createMissionMessagingActions: vi.fn(() => ({
    sendMessage: vi.fn(),
    editAndResend: vi.fn(),
    cancelMission: mockCancelMission,
  })),
}))

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  emitMissionRated: vi.fn(),
}
))

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/constants/network')>()
  return {
    ...actual,
    isLocalAgentSuppressed: mockIsLocalAgentSuppressed,
    areOptionalPollersSuppressed: mockAreOptionalPollersSuppressed,
  }
})

import { createMissionActions } from '../useMissions.actions'
import { createMissionStateUtils, NONE_AGENT, SELECTED_AGENT_KEY } from '../useMissions.state'
import { emitMissionRated } from '../../lib/analytics'
import { logger } from '../../lib/logger'
import type { Mission, StartMissionParams } from '../useMissionTypes'
import type { MissionProviderState } from '../useMissions.state'

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
    status: 'running',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function applySetMissions(state: MissionProviderState, missions: Mission[]): Mission[] {
  return vi.mocked(state.setMissions).mock.calls.reduce(
    (current, call) => (call[0] as (prev: Mission[]) => Mission[])(current),
    missions,
  )
}

function applySetPendingReviewQueue(
  state: MissionProviderState,
  queue: Array<{ params: StartMissionParams; missionId: string }> = [],
) {
  const call = vi.mocked(state.setPendingReviewQueue).mock.calls.at(-1)
  if (!call) throw new Error('setPendingReviewQueue not called')
  return (call[0] as (prev: typeof queue) => typeof queue)(queue)
}

function makeActions(state: MissionProviderState, connectionApi = makeConnectionApi()) {
  const stateUtils = createMissionStateUtils(state)
  const executionApi = {
    executeMission: vi.fn(),
    preflightAndExecute: vi.fn(),
  }
  const actions = createMissionActions(state, stateUtils, connectionApi, executionApi)
  return { actions, stateUtils, connectionApi }
}

function makeConnectionApi(ensureConnection = vi.fn(() => Promise.resolve())) {
  return {
    ensureConnection,
    wsSend: vi.fn(),
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsLocalAgentSuppressed.mockReturnValue(false)
  mockAreOptionalPollersSuppressed.mockReturnValue(false)
  localStorage.clear()
  mockStartMission.mockReturnValue('started-mission-id')
})

afterEach(() => {
  localStorage.clear()
})

describe('createMissionActions', () => {
  it('dismissMission clears pending requests and status timers', () => {
    const mission = makeMission('mission-dismiss')
    const state = makeState({
      missions: [mission],
      activeMissionId: 'other-mission',
    })
    const timerHandle = setTimeout(() => {}, 60_000)
    state.missionStatusTimers.current.set('mission-dismiss', new Set([timerHandle]))
    state.pendingRequests.current.set('req-1', 'mission-dismiss')
    state.lastStreamTimestamp.current.set('mission-dismiss', Date.now())
    state.streamSplitCounter.current.set('mission-dismiss', 1)
    state.toolsInFlight.current.set('mission-dismiss', 2)
    state.observedToolExecutions.current.add('mission-dismiss')

    const stateUtils = createMissionStateUtils(state)
    const clearSpy = vi.spyOn(stateUtils, 'clearMissionStatusTimers')
    const executionApi = { executeMission: vi.fn(), preflightAndExecute: vi.fn() }
    const actions = createMissionActions(
      state,
      stateUtils,
      makeConnectionApi(),
      executionApi,
    )

    actions.dismissMission('mission-dismiss')

    expect(mockCancelMission).toHaveBeenCalledWith('mission-dismiss')
    expect(state.pendingRequests.current.has('req-1')).toBe(false)
    expect(state.lastStreamTimestamp.current.has('mission-dismiss')).toBe(false)
    expect(state.streamSplitCounter.current.has('mission-dismiss')).toBe(false)
    expect(state.toolsInFlight.current.has('mission-dismiss')).toBe(false)
    expect(state.observedToolExecutions.current.has('mission-dismiss')).toBe(false)
    expect(clearSpy).toHaveBeenCalledWith('mission-dismiss')

    const remaining = applySetMissions(state, [mission])
    expect(remaining.find(entry => entry.id === 'mission-dismiss')).toBeUndefined()
  })

  it('dismissMission clears activeMissionId when dismissing the currently active mission', () => {
    const mission = makeMission('mission-active')
    const state = makeState({
      missions: [mission],
      activeMissionId: 'mission-active',
    })
    const { actions } = makeActions(state)

    actions.dismissMission('mission-active')

    expect(state.setActiveMissionId).toHaveBeenCalledWith(null)
  })

  it('dismissMission does not clear activeMissionId when dismissing a non-active mission', () => {
    const mission = makeMission('mission-other')
    const state = makeState({
      missions: [mission],
      activeMissionId: 'mission-active',
    })
    const { actions } = makeActions(state)

    actions.dismissMission('mission-other')

    expect(state.setActiveMissionId).not.toHaveBeenCalled()
  })

  it('selectAgent coalesces pending selections while connection is in-flight', async () => {
    let resolveConnection: (() => void) | undefined
    const ensureConnection = vi.fn(() => new Promise<void>(resolve => {
      resolveConnection = resolve
    }))
    const wsSend = vi.fn()
    const connectionApi = { ensureConnection, wsSend }
    const state = makeState()
    const { actions } = makeActions(state, connectionApi)

    actions.selectAgent('claude-code')
    actions.selectAgent('gemini')
    expect(ensureConnection).toHaveBeenCalledTimes(1)

    resolveConnection?.()
    await flushMicrotasks()

    expect(wsSend).toHaveBeenCalledTimes(1)
    const payload = JSON.parse((wsSend.mock.calls[0] as [string])[0])
    expect(payload.type).toBe('select_agent')
    expect(payload.payload.agent).toBe('gemini')
    expect(state.selectAgentPending.current).toBeNull()
  })

  it('selectAgent does not open a connection when selecting NONE_AGENT', () => {
    const ensureConnection = vi.fn(() => Promise.resolve())
    const state = makeState()
    const { actions, connectionApi } = makeActions(state, makeConnectionApi(ensureConnection))

    actions.selectAgent(NONE_AGENT)

    expect(state.setSelectedAgent).toHaveBeenCalledWith(NONE_AGENT)
    expect(localStorage.getItem(SELECTED_AGENT_KEY)).toBe(NONE_AGENT)
    expect(connectionApi.ensureConnection).not.toHaveBeenCalled()
    expect(connectionApi.wsSend).not.toHaveBeenCalled()
  })

  it('selectAgent treats deployment-unavailable agents as expected when suppressed', async () => {
    mockIsLocalAgentSuppressed.mockReturnValue(true)
    const ensureConnection = vi.fn(() => Promise.reject(new Error('Agent unavailable in this deployment')))
    const state = makeState()
    const { actions } = makeActions(state, makeConnectionApi(ensureConnection))

    actions.selectAgent('claude-code')
    await flushMicrotasks()

    expect(state.selectAgentPending.current).toBeNull()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith('[Missions] Agent selection skipped because the agent is unavailable in this deployment')
  })

  it('connectToAgent treats deployment-unavailable agents as expected when suppressed', async () => {
    mockAreOptionalPollersSuppressed.mockReturnValue(true)
    const ensureConnection = vi.fn(() => Promise.reject(new Error('Agent unavailable in this deployment')))
    const state = makeState()
    state.wsReconnectAttempts.current = 3
    const { actions } = makeActions(state, makeConnectionApi(ensureConnection))

    actions.connectToAgent()
    await flushMicrotasks()

    expect(state.wsReconnectAttempts.current).toBe(0)
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.debug).toHaveBeenCalledWith('[Missions] Agent connection skipped because the agent is unavailable in this deployment')
  })

  it('connectToAgent still logs unexpected connection failures', async () => {
    const error = new Error('CONNECTION_FAILED')
    const ensureConnection = vi.fn(() => Promise.reject(error))
    const state = makeState()
    const { actions } = makeActions(state, makeConnectionApi(ensureConnection))

    actions.connectToAgent()
    await flushMicrotasks()

    expect(logger.error).toHaveBeenCalledWith('[Missions] Failed to connect to agent:', error)
  })

  it('confirmPendingReview preserves the pregenerated mission id from pendingReview', () => {
    const pendingParams: StartMissionParams = {
      title: 'Review mission',
      description: 'Needs approval',
      type: 'troubleshoot',
      initialPrompt: 'Original prompt',
      skipReview: false,
      context: { allowMissingLocalTools: true },
    }
    const state = makeState({
      pendingReviewQueue: [{ params: pendingParams, missionId: 'mission-pregen-42' }],
    })
    const { actions } = makeActions(state)

    actions.confirmPendingReview('Edited prompt')

    expect(applySetPendingReviewQueue(state)).toHaveLength(0)
    expect(mockStartMission).toHaveBeenCalledWith({
      ...pendingParams,
      initialPrompt: 'Edited prompt',
      skipReview: true,
      context: {
        allowMissingLocalTools: true,
        __preGeneratedMissionId: 'mission-pregen-42',
      },
    })
  })

  it('cancelPendingReview removes the pending review without starting a mission', () => {
    const state = makeState({
      pendingReviewQueue: [{
        params: {
          title: 'Queued',
          description: 'Desc',
          type: 'custom',
          initialPrompt: 'Prompt',
        },
        missionId: 'mission-queue-1',
      }],
    })
    const { actions } = makeActions(state)

    actions.cancelPendingReview()

    expect(applySetPendingReviewQueue(state)).toHaveLength(0)
    expect(mockStartMission).not.toHaveBeenCalled()
  })

  it('rateMission persists the rating to the missions state', () => {
    const mission = makeMission('mission-rate', { feedback: null })
    const state = makeState({ missions: [mission] })
    const { actions } = makeActions(state)

    actions.rateMission('mission-rate', 'positive')

    const updated = applySetMissions(state, [mission])
    expect(updated.find(entry => entry.id === 'mission-rate')?.feedback).toBe('positive')
    expect(emitMissionRated).toHaveBeenCalledWith('custom', 'positive')
  })
})
