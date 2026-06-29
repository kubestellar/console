/**
 * Tests for useMissions.execution — createMissionExecutionApi
 *
 * Covers cancel-before-connect race, deduplication, status timers, preflight
 * blocking, Kagenti paths, unmount safety, and connection failure handling.
 * Part of #4189 / #16019.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../useLocalAgent', () => ({
  reportAgentActivity: vi.fn(),
  useLocalAgent: vi.fn(() => ({ isConnected: false })),
}))

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn(),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

vi.mock('../../lib/missions/preflightCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/missions/preflightCheck')>()
  return {
    ...actual,
    runPreflightCheck: vi.fn(),
    runClusterReadinessCheck: vi.fn(),
    runToolPreflightCheck: vi.fn(),
  }
})

vi.mock('../useMissions.helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useMissions.helpers')>()
  return {
    ...actual,
    generateMessageId: vi.fn(() => 'mock-msg-id'),
    generateRequestId: vi.fn(() => 'mock-request-id'),
    getMissionMessages: vi.fn((msgs?: unknown[]) => msgs ?? []),
  }
})

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

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../useMissions.constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useMissions.constants')>()
  return {
    ...actual,
    STATUS_WAITING_DELAY_MS: 100,
    STATUS_PROCESSING_DELAY_MS: 200,
  }
})

import { createMissionExecutionApi } from '../useMissions.execution'
import { createMissionStateUtils } from '../useMissions.state'
import {
  runToolPreflightCheck,
  runPreflightCheck,
  runClusterReadinessCheck,
} from '../../lib/missions/preflightCheck'
import {
  discoverKagentiProviderAgent,
  kagentiProviderChat,
} from '../../lib/kagentiProviderBackend'
import {
  STATUS_WAITING_DELAY_MS,
  STATUS_PROCESSING_DELAY_MS,
} from '../useMissions.constants'
import { emitMissionError } from '../../lib/analytics'
import type { Mission } from '../useMissionTypes'
import type { MissionProviderState } from '../useMissions.state'
import type { MissionConnectionApi } from '../useMissions.connection'

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
    status: 'pending',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
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

function makeConnectionApi(
  overrides: Partial<Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>> = {},
): Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'> {
  return {
    ensureConnection: vi.fn(() => Promise.resolve()),
    wsSend: vi.fn(),
    ...overrides,
  }
}

function makeExecutionApi(
  state: MissionProviderState,
  connectionApi: Pick<MissionConnectionApi, 'ensureConnection' | 'wsSend'>,
) {
  return createMissionExecutionApi(state, createMissionStateUtils(state), connectionApi)
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(runToolPreflightCheck).mockResolvedValue({ ok: true })
  vi.mocked(runPreflightCheck).mockResolvedValue({ ok: true })
  vi.mocked(runClusterReadinessCheck).mockResolvedValue({ ok: true })
  vi.mocked(discoverKagentiProviderAgent).mockResolvedValue({
    ok: true,
    agent: { namespace: 'default', name: 'kagenti-agent' },
  })
  vi.mocked(kagentiProviderChat).mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('createMissionExecutionApi', () => {
  it('does not send a mission when cancelIntent is set before ensureConnection resolves', async () => {
    let resolveConnection: (() => void) | undefined
    const ensureConnection = vi.fn(() => new Promise<void>(resolve => {
      resolveConnection = resolve
    }))
    const wsSend = vi.fn()
    const state = makeState()
    const api = makeExecutionApi(state, makeConnectionApi({ ensureConnection, wsSend }))

    api.executeMission('mission-1', 'Run task', { type: 'custom' })
    await flushMicrotasks()

    state.cancelIntents.current.add('mission-1')
    resolveConnection?.()
    await flushMicrotasks()

    expect(wsSend).not.toHaveBeenCalled()
    expect(state.executingMissions.current.has('mission-1')).toBe(false)
  })

  it('deduplicates executeMission calls for the same mission id', async () => {
    const wsSend = vi.fn()
    const state = makeState()
    const api = makeExecutionApi(state, makeConnectionApi({ wsSend }))

    api.executeMission('mission-dup', 'First', { type: 'custom' })
    api.executeMission('mission-dup', 'Second', { type: 'custom' })
    await flushMicrotasks()

    expect(wsSend).toHaveBeenCalledTimes(1)
    expect(wsSend.mock.calls[0][0]).toContain('First')
  })

  it('sets waiting status before processing status in order', async () => {
    const mission = makeMission('mission-timers', { status: 'pending' })
    const state = makeState({
      missionsRef: { current: [mission] },
    })
    const api = makeExecutionApi(state, makeConnectionApi())

    api.executeMission('mission-timers', 'Timed task', { type: 'custom' })
    await flushMicrotasks()

    let updated = applySetMissions(state, [mission])
    expect(updated.find(entry => entry.id === 'mission-timers')?.currentStep).toBe('Connecting to agent...')

    vi.advanceTimersByTime(STATUS_WAITING_DELAY_MS)
    updated = applySetMissions(state, updated)
    expect(updated.find(entry => entry.id === 'mission-timers')?.currentStep).toBe('Waiting for response...')

    vi.advanceTimersByTime(STATUS_PROCESSING_DELAY_MS - STATUS_WAITING_DELAY_MS)
    updated = applySetMissions(state, updated)
    expect(updated.find(entry => entry.id === 'mission-timers')?.currentStep).toBe('Processing with claude-code...')
  })

  it('blocks mission execution when required tools are missing from preflight', async () => {
    vi.mocked(runToolPreflightCheck).mockResolvedValue({
      ok: false,
      error: {
        code: 'MISSING_TOOLS',
        message: 'helm is not installed',
        details: { missingTools: ['helm'] },
      },
    })

    const mission = makeMission('mission-tools', { type: 'deploy' })
    const state = makeState({
      missionsRef: { current: [mission] },
    })
    const wsSend = vi.fn()
    const api = makeExecutionApi(state, makeConnectionApi({ wsSend }))

    api.preflightAndExecute('mission-tools', 'Deploy app', {
      type: 'deploy',
      title: 'Deploy',
      description: 'Deploy workload',
      initialPrompt: 'Deploy app',
    })
    await flushMicrotasks()

    const updated = applySetMissions(state, [mission])
    const result = updated.find(entry => entry.id === 'mission-tools')
    expect(result?.status).toBe('blocked')
    expect(result?.currentStep).toBe('Missing required tools')
    expect(wsSend).not.toHaveBeenCalled()
  })

  it('releases executingMissions lock when Kagenti discovery fails', async () => {
    vi.mocked(discoverKagentiProviderAgent).mockResolvedValue({
      ok: false,
      reason: 'provider_unreachable',
    })

    const mission = makeMission('mission-kagenti-fail')
    const state = makeState({
      missionsRef: { current: [mission] },
      selectedAgentRef: { current: 'kagenti' },
    })
    const ensureConnection = vi.fn()
    const api = makeExecutionApi(state, makeConnectionApi({ ensureConnection }))

    api.executeMission('mission-kagenti-fail', 'Kagenti task', { type: 'custom' })
    await flushMicrotasks()

    expect(state.executingMissions.current.has('mission-kagenti-fail')).toBe(false)
    expect(ensureConnection).not.toHaveBeenCalled()
    expect(kagentiProviderChat).not.toHaveBeenCalled()
    expect(emitMissionError).toHaveBeenCalled()

    const updated = applySetMissions(state, [mission])
    expect(updated.find(entry => entry.id === 'mission-kagenti-fail')?.status).toBe('failed')
  })

  it('uses Kagenti HTTP path when WebSocket is unavailable and Kagenti is discovered', async () => {
    const mission = makeMission('mission-kagenti-http')
    const state = makeState({
      missionsRef: { current: [mission] },
      selectedAgentRef: { current: 'kagenti' },
    })
    const ensureConnection = vi.fn()
    const wsSend = vi.fn()
    const api = makeExecutionApi(state, makeConnectionApi({ ensureConnection, wsSend }))

    api.executeMission('mission-kagenti-http', 'HTTP task', { type: 'custom' })
    await flushMicrotasks()

    expect(ensureConnection).not.toHaveBeenCalled()
    expect(wsSend).not.toHaveBeenCalled()
    expect(discoverKagentiProviderAgent).toHaveBeenCalled()
    expect(kagentiProviderChat).toHaveBeenCalledWith(
      'kagenti-agent',
      'default',
      'HTTP task',
      expect.objectContaining({ contextId: 'mission-kagenti-http' }),
    )
  })

  it('does not call wsSend after component unmounts during pending ensureConnection', async () => {
    let resolveConnection: (() => void) | undefined
    const ensureConnection = vi.fn(() => new Promise<void>(resolve => {
      resolveConnection = resolve
    }))
    const wsSend = vi.fn()
    const state = makeState()
    const api = makeExecutionApi(state, makeConnectionApi({ ensureConnection, wsSend }))

    api.executeMission('mission-unmount', 'Unmount task', { type: 'custom' })
    await flushMicrotasks()

    state.unmountedRef.current = true
    resolveConnection?.()
    await flushMicrotasks()

    expect(wsSend).not.toHaveBeenCalled()
    expect(state.executingMissions.current.has('mission-unmount')).toBe(false)
  })

  it('sets isFailed on mission after max consecutive WebSocket errors', async () => {
    const MAX_CONSECUTIVE_WS_ERRORS = 3
    let rejectCount = 0
    const ensureConnection = vi.fn(() => {
      rejectCount += 1
      return Promise.reject(new Error('CONNECTION_FAILED'))
    })

    const missionIds = Array.from(
      { length: MAX_CONSECUTIVE_WS_ERRORS },
      (_, index) => `mission-ws-fail-${index}`,
    )
    const missions = missionIds.map(id => makeMission(id))
    const state = makeState({
      missionsRef: { current: missions },
    })
    const api = makeExecutionApi(state, makeConnectionApi({ ensureConnection }))

    for (const missionId of missionIds) {
      api.executeMission(missionId, 'Fail task', { type: 'custom' })
      await flushMicrotasks()
    }

    expect(rejectCount).toBe(MAX_CONSECUTIVE_WS_ERRORS)

    const lastMissionId = missionIds[missionIds.length - 1]
    const failedMission = applySetMissions(state, missions)
    const lastFailed = failedMission.find(entry => entry.id === lastMissionId)
    expect(lastFailed?.status).toBe('failed')
    expect(lastFailed?.messages.some(message => message.content.includes('Local Agent Not Connected'))).toBe(true)
  })
})
