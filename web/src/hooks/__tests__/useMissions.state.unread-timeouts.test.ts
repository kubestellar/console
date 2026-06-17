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
