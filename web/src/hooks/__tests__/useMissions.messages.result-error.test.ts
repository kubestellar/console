/**
 * Tests for useMissions.messages — createMissionMessageHandler
 *
 * Covers the WebSocket message handler factory: agents_list resolution,
 * agent_selected persistence, cancel acknowledgement, progress tracking,
 * stream message assembly, result deduplication, error classification
 * (auth, rate-limit, tool-missing, disconnect), and terminal-state guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── mocks (must be before imports) ──────────────────────────────────────────

vi.mock('../useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  clearActiveTokenCategory: vi.fn(),
}))

vi.mock('../../lib/analytics', () => ({
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionToolMissing: vi.fn(),
}))

vi.mock('../../lib/tokenUsageMissionCategory', () => ({
  getTokenCategoryForMissionType: vi.fn(() => 'custom'),
}))

vi.mock('../useMissions.helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useMissions.helpers')>()
  return {
    ...actual,
    generateMessageId: vi.fn(() => 'mock-msg-id'),
    getMissionMessages: vi.fn((msgs?: unknown[]) => msgs ?? []),
    canAutoCompleteMissionFromResponse: vi.fn(() => false),
  }
})

vi.mock('../useMissionPromptBuilder', () => ({
  stripInteractiveArtifacts: vi.fn((s: string) => s),
}))

import { createMissionMessageHandler } from '../useMissions.messages'
import { canAutoCompleteMissionFromResponse } from '../useMissions.helpers'
import { emitMissionCompleted, emitMissionError, emitMissionToolMissing } from '../../lib/analytics'
import { addCategoryTokens, clearActiveTokenCategory } from '../useTokenUsage'
import type { MissionProviderState, MissionStateUtils } from '../useMissions.state'
import type { Mission, MissionMessage } from '../useMissionTypes'

// ── helpers ─────────────────────────────────────────────────────────────────

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

function makeStateUtils(): MissionStateUtils {
  return {
    finalizeCancellation: vi.fn(),
    markMissionAsUnread: vi.fn(),
    clearWaitingInputTimeout: vi.fn(),
    startWaitingInputTimeout: vi.fn(),
    setMissionStatus: vi.fn(),
  } as unknown as MissionStateUtils
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

/** Extract the updater fn passed to setMissions and apply it to given missions. */
function applySetMissions(state: MissionProviderState, missions: Mission[]): Mission[] {
  const updater = (state.setMissions as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
  if (typeof updater === 'function') return updater(missions)
  return updater ?? missions
}

describe('createMissionMessageHandler', () => {
  let state: MissionProviderState
  let stateUtils: MissionStateUtils
  let handler: ReturnType<typeof createMissionMessageHandler>

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    state = makeState()
    stateUtils = makeStateUtils()
    handler = createMissionMessageHandler(state, stateUtils)
  })

  afterEach(() => {
    localStorage.clear()
  })
  // ── result messages ─────────────────────────────────────────────────────

  describe('result messages', () => {
    it('marks mission as completed on successful result', () => {
      const mission = makeMission('m1', {
        status: 'running',
        messages: [],
        type: 'custom',
      })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'result',
        payload: { content: 'Task completed.', done: true, agent: 'claude-code', sessionId: 's1' },
      })

      const updated = applySetMissions(state, [mission])
      const updatedMission = updated.find(m => m.id === 'm1')
      expect(updatedMission?.status).toBe('completed')
      expect(stateUtils.markMissionAsUnread).toHaveBeenCalledWith('m1')
      expect(stateUtils.clearWaitingInputTimeout).toHaveBeenCalledWith('m1')
    })

    it('marks deploy mission as failed when no tools were executed (false positive)', () => {
      const mission = makeMission('m1', {
        status: 'running',
        messages: [],
        type: 'deploy',
      })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'result',
        payload: { content: 'Done', done: true, agent: 'claude-code', sessionId: 's1' },
      })

      const updated = applySetMissions(state, [mission])
      expect(updated.find(m => m.id === 'm1')?.status).toBe('failed')
      expect(emitMissionError).toHaveBeenCalled()
    })

    it('cleans up tracking state on result', () => {
      state.pendingRequests.current.set('req-1', 'm1')
      state.streamSplitCounter.current.set('m1', 3)
      state.toolsInFlight.current.set('m1', 1)
      state.lastStreamTimestamp.current.set('m1', Date.now())
      state.observedToolExecutions.current.add('m1')

      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.setMissions = vi.fn((updater) => {
        if (typeof updater === 'function') updater([mission])
      })

      handler({
        id: 'req-1',
        type: 'result',
        payload: { content: 'Done', done: true, agent: 'claude-code', sessionId: 's1' },
      })

      expect(state.pendingRequests.current.has('req-1')).toBe(false)
      expect(state.streamSplitCounter.current.has('m1')).toBe(false)
      expect(state.toolsInFlight.current.has('m1')).toBe(false)
      expect(state.lastStreamTimestamp.current.has('m1')).toBe(false)
      expect(state.observedToolExecutions.current.has('m1')).toBe(false)
      expect(clearActiveTokenCategory).toHaveBeenCalledWith('m1')
    })

    it('updates token usage from result payload', () => {
      const mission = makeMission('m1', {
        status: 'running',
        messages: [],
        tokenUsage: { input: 0, output: 0, total: 0 },
      })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'result',
        payload: {
          content: 'Done',
          done: true,
          agent: 'claude-code',
          sessionId: 's1',
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        },
      })

      const updated = applySetMissions(state, [mission])
      expect(updated.find(m => m.id === 'm1')?.tokenUsage).toEqual({
        input: 200,
        output: 100,
        total: 300,
      })
      expect(addCategoryTokens).toHaveBeenCalled()
    })
  })

  // ── error messages ──────────────────────────────────────────────────────

  describe('error messages', () => {
    it('marks mission as failed on error', () => {
      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'error',
        payload: { code: 'server_error', message: 'Internal error' },
      })

      const updated = applySetMissions(state, [mission])
      expect(updated.find(m => m.id === 'm1')?.status).toBe('failed')
      expect(emitMissionError).toHaveBeenCalled()
    })

    it('classifies authentication errors', () => {
      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'error',
        payload: { code: 'authentication_error', message: 'Token has expired' },
      })

      const updated = applySetMissions(state, [mission])
      const errorMsg = updated.find(m => m.id === 'm1')?.messages.at(-1)?.content || ''
      expect(errorMsg).toContain('Authentication Error')
    })

    it('classifies rate limit errors', () => {
      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'error',
        payload: { code: '429', message: 'Too many requests' },
      })

      const updated = applySetMissions(state, [mission])
      const errorMsg = updated.find(m => m.id === 'm1')?.messages.at(-1)?.content || ''
      expect(errorMsg).toContain('Rate Limit')
    })

    it('classifies tool-missing errors for helm', () => {
      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn((updater) => {
        if (typeof updater === 'function') updater([mission])
      })

      handler({
        id: 'req-1',
        type: 'error',
        payload: { message: 'helm: command not found' },
      })

      expect(emitMissionToolMissing).toHaveBeenCalledWith('custom', 'helm', 'helm: command not found')
      const updated = applySetMissions(state, [mission])
      const errorMsg = updated.find(m => m.id === 'm1')?.messages.at(-1)?.content || ''
      expect(errorMsg).toContain('Helm')
    })

    it('cleans up tracking state on error', () => {
      state.pendingRequests.current.set('req-1', 'm1')
      state.streamSplitCounter.current.set('m1', 2)
      state.toolsInFlight.current.set('m1', 1)
      state.lastStreamTimestamp.current.set('m1', Date.now())
      state.observedToolExecutions.current.add('m1')

      const mission = makeMission('m1', { status: 'running', messages: [] })
      state.setMissions = vi.fn((updater) => {
        if (typeof updater === 'function') updater([mission])
      })

      handler({
        id: 'req-1',
        type: 'error',
        payload: { code: 'server_error', message: 'fail' },
      })

      expect(state.pendingRequests.current.has('req-1')).toBe(false)
      expect(state.streamSplitCounter.current.has('m1')).toBe(false)
      expect(state.toolsInFlight.current.has('m1')).toBe(false)
      expect(state.lastStreamTimestamp.current.has('m1')).toBe(false)
      expect(state.observedToolExecutions.current.has('m1')).toBe(false)
    })
  })

  // ── cancelling state ────────────────────────────────────────────────────

  describe('cancelling state', () => {
    it('finalizes cancellation on terminal message when cancel intent is set', () => {
      const mission = makeMission('m1', { status: 'running' })
      state.pendingRequests.current.set('req-1', 'm1')
      state.cancelIntents.current.add('m1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'result',
        payload: { content: 'done' },
      })

      const updated = applySetMissions(state, [mission])
      // The mission mapper should have called finalizeCancellation
      expect(stateUtils.finalizeCancellation).toHaveBeenCalledWith('m1', 'Mission cancelled by user.')
    })

    it('ignores non-terminal messages when mission is in cancelling state', () => {
      const mission = makeMission('m1', { status: 'cancelling', messages: [] })
      state.pendingRequests.current.set('req-1', 'm1')
      state.setMissions = vi.fn()

      handler({
        id: 'req-1',
        type: 'stream',
        payload: { content: 'still going', done: false },
      })

      const updated = applySetMissions(state, [mission])
      // Mission should remain unchanged (cancelling)
      expect(updated.find(m => m.id === 'm1')?.status).toBe('cancelling')
    })
  })
})
