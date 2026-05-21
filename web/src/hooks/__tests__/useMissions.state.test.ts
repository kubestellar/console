/**
 * Tests for useMissions.state — createMissionStateUtils
 *
 * Tests the 5 utility factory functions without needing React or a full hook mount.
 * The utils operate on a plain MissionProviderState-shaped object so we can drive
 * them purely through mock refs and spy on the setter calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/analytics', () => ({
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
}))

vi.mock('../useMissions.helpers', () => ({
  canAutoCompleteMissionFromResponse: vi.fn(({
    content,
    messages,
    type,
    toolsExecuted,
  }: {
    content?: string
    messages?: Array<{ role?: string; content?: string }>
    type: string
    toolsExecuted?: boolean
  }) => {
    const assistantMessages = (messages ?? []).filter((message: { role?: string }) => message.role === 'assistant')
    const lastAssistant = assistantMessages[assistantMessages.length - 1] as { content?: string } | undefined
    const finalContent = (content && typeof content === 'string' && content.trim().length > 0)
      ? content.trim()
      : (lastAssistant?.content?.trim() || '')
    const missionRequiresTools = ['deploy', 'maintain', 'repair', 'upgrade'].includes(type)
    return finalContent.length > 0 && (!missionRequiresTools || !!toolsExecuted)
  }),
  getMissionMessages: vi.fn((msgs?: unknown[]) => msgs ?? []),
  generateMessageId: vi.fn(() => 'mock-msg-id'),
}))

vi.mock('../useMissions.constants', () => ({
  WAITING_INPUT_TIMEOUT_MS: 100,
}))

vi.mock('../useMissionStorage', () => ({
  loadMissions: vi.fn(() => []),
  loadUnreadMissionIds: vi.fn(() => new Set()),
  MISSIONS_STORAGE_KEY: 'kc_missions',
  CROSS_TAB_ECHO_IGNORE_MS: 500,
  SELECTED_AGENT_KEY: 'kc_selected_agent',
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
}))

import { createMissionStateUtils } from '../useMissions.state'
import { emitMissionCompleted, emitMissionError } from '../../lib/analytics'
import type { Mission } from '../useMissionTypes'
import type { MissionProviderState } from '../useMissions.state'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function makeMission(id: string, status: Mission['status'] = 'running'): Mission {
  return {
    id,
    title: `Mission ${id}`,
    description: '',
    type: 'custom',
    status,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// Extract the updater fn passed to setMissions and apply it to missions array
function applySetMissions(
  state: MissionProviderState,
  missions: Mission[],
  callIndex = 0,
): Mission[] {
  const call = vi.mocked(state.setMissions).mock.calls[callIndex]
  if (!call) throw new Error('setMissions not called')
  return (call[0] as (prev: Mission[]) => Mission[])(missions)
}

// ─── markMissionAsUnread ─────────────────────────────────────────────────────

describe('markMissionAsUnread', () => {
  it('adds missionId when it is not the active mission', () => {
    const state = makeState({
      activeMissionIdRef: { current: 'other-mission' },
      isSidebarOpenRef: { current: true },
    })
    createMissionStateUtils(state).markMissionAsUnread('mission-1')

    expect(state.setUnreadMissionIds).toHaveBeenCalledOnce()
    const updater = vi.mocked(state.setUnreadMissionIds).mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>
    const result = updater(new Set())
    expect(result.has('mission-1')).toBe(true)
  })

  it('adds missionId when sidebar is closed even if mission is active', () => {
    const state = makeState({
      activeMissionIdRef: { current: 'mission-1' },
      isSidebarOpenRef: { current: false },
    })
    createMissionStateUtils(state).markMissionAsUnread('mission-1')

    expect(state.setUnreadMissionIds).toHaveBeenCalledOnce()
  })

  it('does not add when mission is active and sidebar is open', () => {
    const state = makeState({
      activeMissionIdRef: { current: 'mission-1' },
      isSidebarOpenRef: { current: true },
    })
    createMissionStateUtils(state).markMissionAsUnread('mission-1')

    expect(state.setUnreadMissionIds).not.toHaveBeenCalled()
  })

  it('preserves existing unread ids when adding new one', () => {
    const state = makeState({
      activeMissionIdRef: { current: null },
      isSidebarOpenRef: { current: false },
    })
    createMissionStateUtils(state).markMissionAsUnread('mission-1')

    const updater = vi.mocked(state.setUnreadMissionIds).mock.calls[0][0] as (
      prev: Set<string>,
    ) => Set<string>
    const prev = new Set(['existing-id'])
    const result = updater(prev)
    expect(result.has('existing-id')).toBe(true)
    expect(result.has('mission-1')).toBe(true)
  })
})

// ─── clearMissionStatusTimers ─────────────────────────────────────────────────

describe('clearMissionStatusTimers', () => {
  it('does nothing when no timers exist for mission', () => {
    const state = makeState()
    expect(() => createMissionStateUtils(state).clearMissionStatusTimers('mission-1')).not.toThrow()
  })

  it('calls clearTimeout for every stored timer handle', () => {
    const state = makeState()
    const handle1 = setTimeout(() => {}, 60_000)
    const handle2 = setTimeout(() => {}, 60_000)
    state.missionStatusTimers.current.set('mission-1', new Set([handle1, handle2]))

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    createMissionStateUtils(state).clearMissionStatusTimers('mission-1')

    expect(clearSpy).toHaveBeenCalledWith(handle1)
    expect(clearSpy).toHaveBeenCalledWith(handle2)
    clearSpy.mockRestore()
    clearTimeout(handle1)
    clearTimeout(handle2)
  })

  it('removes the mission entry from the map', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.missionStatusTimers.current.set('mission-1', new Set([handle]))

    createMissionStateUtils(state).clearMissionStatusTimers('mission-1')

    expect(state.missionStatusTimers.current.has('mission-1')).toBe(false)
    clearTimeout(handle)
  })

  it('does not affect timers registered for other missions', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.missionStatusTimers.current.set('mission-2', new Set([handle]))

    createMissionStateUtils(state).clearMissionStatusTimers('mission-1')

    expect(state.missionStatusTimers.current.has('mission-2')).toBe(true)
    clearTimeout(handle)
  })
})

// ─── clearWaitingInputTimeout ─────────────────────────────────────────────────

describe('clearWaitingInputTimeout', () => {
  it('does nothing when no timeout exists for mission', () => {
    const state = makeState()
    expect(() =>
      createMissionStateUtils(state).clearWaitingInputTimeout('mission-1'),
    ).not.toThrow()
  })

  it('calls clearTimeout with the stored handle', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.waitingInputTimeouts.current.set('mission-1', handle)

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    createMissionStateUtils(state).clearWaitingInputTimeout('mission-1')

    expect(clearSpy).toHaveBeenCalledWith(handle)
    clearSpy.mockRestore()
  })

  it('removes the mission entry from the map', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.waitingInputTimeouts.current.set('mission-1', handle)

    createMissionStateUtils(state).clearWaitingInputTimeout('mission-1')

    expect(state.waitingInputTimeouts.current.has('mission-1')).toBe(false)
    clearTimeout(handle)
  })

  it('does not clear timeouts for other missions', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.waitingInputTimeouts.current.set('mission-2', handle)

    createMissionStateUtils(state).clearWaitingInputTimeout('mission-1')

    expect(state.waitingInputTimeouts.current.has('mission-2')).toBe(true)
    clearTimeout(handle)
  })
})

// ─── startWaitingInputTimeout ─────────────────────────────────────────────────

describe('startWaitingInputTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores a timeout handle in waitingInputTimeouts', () => {
    const state = makeState()
    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')

    expect(state.waitingInputTimeouts.current.has('mission-1')).toBe(true)
  })

  it('clears any previous timeout before setting a new one', () => {
    const state = makeState()
    const utils = createMissionStateUtils(state)

    utils.startWaitingInputTimeout('mission-1')
    const first = state.waitingInputTimeouts.current.get('mission-1')

    utils.startWaitingInputTimeout('mission-1')
    const second = state.waitingInputTimeouts.current.get('mission-1')

    expect(second).not.toBe(first)
  })

  it('on timeout: removes the waiting timeout entry', () => {
    const state = makeState()
    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')

    vi.runAllTimers()

    expect(state.waitingInputTimeouts.current.has('mission-1')).toBe(false)
  })

  it('on timeout: removes pendingRequests mapped to mission, leaves others', () => {
    const state = makeState()
    state.pendingRequests.current.set('req-a', 'mission-1')
    state.pendingRequests.current.set('req-b', 'mission-2')

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    expect(state.pendingRequests.current.has('req-a')).toBe(false)
    expect(state.pendingRequests.current.has('req-b')).toBe(true)
  })

  it('on timeout: deletes lastStreamTimestamp for mission', () => {
    const state = makeState()
    state.lastStreamTimestamp.current.set('mission-1', Date.now())

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    expect(state.lastStreamTimestamp.current.has('mission-1')).toBe(false)
  })

  it('on timeout: sets mission status to failed when status is waiting_input', () => {
    const mission = makeMission('mission-1', 'waiting_input')
    const state = makeState()

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    const result = applySetMissions(state, [mission])
    expect(result[0].status).toBe('failed')
    expect(result[0].currentStep).toBeUndefined()
  })

  it('on timeout: appends a system message explaining the timeout', () => {
    const mission = makeMission('mission-1', 'waiting_input')
    const state = makeState()

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    const result = applySetMissions(state, [mission])
    const lastMsg = result[0].messages[result[0].messages.length - 1]
    expect(lastMsg.role).toBe('system')
    expect(lastMsg.content).toContain('timed out waiting for input')
  })

  it('on timeout: auto-completes a deploy mission when the final assistant response is already complete', () => {
    const mission = {
      ...makeMission('mission-1', 'waiting_input'),
      type: 'deploy' as const,
      messages: [
        {
          id: 'assistant-final',
          role: 'assistant' as const,
          content: 'All workloads are deployed and running successfully.',
          timestamp: new Date(),
        },
      ],
    }
    const state = makeState()
    state.observedToolExecutions.current.add('mission-1')

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    const result = applySetMissions(state, [mission])
    expect(result[0].status).toBe('completed')
    expect(result[0].messages).toHaveLength(1)
    expect(emitMissionCompleted).toHaveBeenCalledWith('deploy', expect.any(Number))
    expect(emitMissionError).not.toHaveBeenCalled()
  })

  it('on timeout: does not change missions with a non-waiting_input status', () => {
    const mission = makeMission('mission-1', 'running')
    const state = makeState()

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    const result = applySetMissions(state, [mission])
    expect(result[0].status).toBe('running')
    expect(result[0].messages).toHaveLength(0)
  })

  it('on timeout: calls emitMissionError with mission type', () => {
    const mission = makeMission('mission-1', 'waiting_input')
    const state = makeState()

    createMissionStateUtils(state).startWaitingInputTimeout('mission-1')
    vi.runAllTimers()

    // emitMissionError fires inside the setMissions updater
    applySetMissions(state, [mission])

    expect(emitMissionError).toHaveBeenCalledWith(
      mission.type,
      'waiting_input_timeout',
      expect.stringContaining('timeout_after_'),
    )
  })
})

// ─── finalizeCancellation ─────────────────────────────────────────────────────

describe('finalizeCancellation', () => {
  it('clears the cancel timeout and removes the cancel intent', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.cancelTimeouts.current.set('mission-1', handle)
    state.cancelIntents.current.add('mission-1')

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    createMissionStateUtils(state).finalizeCancellation('mission-1', 'Cancelled')

    expect(clearSpy).toHaveBeenCalledWith(handle)
    expect(state.cancelTimeouts.current.has('mission-1')).toBe(false)
    expect(state.cancelIntents.current.has('mission-1')).toBe(false)
    clearSpy.mockRestore()
  })

  it('removes pendingRequests for the mission only', () => {
    const state = makeState()
    state.pendingRequests.current.set('req-a', 'mission-1')
    state.pendingRequests.current.set('req-b', 'mission-2')

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')

    expect(state.pendingRequests.current.has('req-a')).toBe(false)
    expect(state.pendingRequests.current.has('req-b')).toBe(true)
  })

  it('clears lastStreamTimestamp, streamSplitCounter, toolsInFlight for mission', () => {
    const state = makeState()
    state.lastStreamTimestamp.current.set('mission-1', 12345)
    state.streamSplitCounter.current.set('mission-1', 3)
    state.toolsInFlight.current.set('mission-1', 2)

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')

    expect(state.lastStreamTimestamp.current.has('mission-1')).toBe(false)
    expect(state.streamSplitCounter.current.has('mission-1')).toBe(false)
    expect(state.toolsInFlight.current.has('mission-1')).toBe(false)
  })

  it('sets mission to cancelled with the provided message', () => {
    const mission = makeMission('mission-1', 'running')
    const state = makeState()

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'Mission cancelled by user')
    const result = applySetMissions(state, [mission])

    expect(result[0].status).toBe('cancelled')
    expect(result[0].currentStep).toBeUndefined()
    expect(result[0].messages).toHaveLength(1)
    expect(result[0].messages[0].role).toBe('system')
    expect(result[0].messages[0].content).toBe('Mission cancelled by user')
  })

  it('does not change a mission already in completed status', () => {
    const mission = makeMission('mission-1', 'completed')
    const state = makeState()

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')
    const result = applySetMissions(state, [mission])

    expect(result[0].status).toBe('completed')
  })

  it('does not change a mission already in failed status', () => {
    const mission = makeMission('mission-1', 'failed')
    const state = makeState()

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')
    const result = applySetMissions(state, [mission])

    expect(result[0].status).toBe('failed')
  })

  it('does not change a mission already in cancelled status', () => {
    const mission = makeMission('mission-1', 'cancelled')
    const state = makeState()

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')
    const result = applySetMissions(state, [mission])

    expect(result[0].status).toBe('cancelled')
    expect(result[0].messages).toHaveLength(0)
  })

  it('does not affect other missions in the list', () => {
    const m1 = makeMission('mission-1', 'running')
    const m2 = makeMission('mission-2', 'running')
    const state = makeState()

    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')
    const result = applySetMissions(state, [m1, m2])

    expect(result[1].id).toBe('mission-2')
    expect(result[1].status).toBe('running')
  })

  it('clears the waitingInputTimeout for the mission', () => {
    const state = makeState()
    const handle = setTimeout(() => {}, 60_000)
    state.waitingInputTimeouts.current.set('mission-1', handle)

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    createMissionStateUtils(state).finalizeCancellation('mission-1', 'done')

    expect(clearSpy).toHaveBeenCalledWith(handle)
    expect(state.waitingInputTimeouts.current.has('mission-1')).toBe(false)
    clearSpy.mockRestore()
  })
})
