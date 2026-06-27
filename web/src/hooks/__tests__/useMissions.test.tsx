import React from 'react'
/**
 * Tests for the useMissions hook and MissionProvider.
 *
 * Covers:
 * - useMissions fallback when rendered outside MissionProvider
 * - MissionProvider context propagation (default state)
 * - isActiveMission / INACTIVE_MISSION_STATUSES type utilities
 * - Re-exported testables surface area
 *
 * Fixes #17404
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

/* ── Heavy dependency mocks (must be before any import that touches them) ── */

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => false),
  isDemoModeForced: false,
  default: vi.fn(() => false),
}))

vi.mock('../useLocalAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useLocalAgent')>()
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

vi.mock('../../lib/utils/wsAuth', () => ({
  getWsAuthParams: vi.fn((url: string) => Promise.resolve({ url, protocols: [] })),
}))

vi.mock('../useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  setActiveTokenCategory: vi.fn(),
  clearActiveTokenCategory: vi.fn(),
  getActiveTokenCategories: vi.fn(() => []),
}))

vi.mock('../useResolutions', () => ({
  detectIssueSignature: vi.fn(() => ({ type: 'Unknown' })),
  findSimilarResolutionsStandalone: vi.fn(() => []),
  generateResolutionPromptContext: vi.fn(() => ''),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_WS_URL: 'ws://localhost:8585/ws',
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  }
})

vi.mock('../../lib/analytics', () => ({
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
  emitMissionToolMissing: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../components/missions/ConfirmMissionPromptDialog', () => ({
  ConfirmMissionPromptDialog: () => null,
}))

/* ── Imports (after mocks) ── */

const { useMissions, MissionProvider } = await import('../useMissions.provider')
const {
  isActiveMission,
  INACTIVE_MISSION_STATUSES,
  __missionsTestables,
} = await import('../useMissions')
const { SELECTED_AGENT_KEY } = await import('../useMissions.state')

/* ── Helpers ── */

function wrapper({ children }: { children: ReactNode }) {
  return <MissionProvider>{children}</MissionProvider>
}

/* ── Test suites ── */

describe('useMissions (outside provider)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns a safe fallback when called outside MissionProvider', () => {
    const { result } = renderHook(() => useMissions())

    expect(result.current.missions).toEqual([])
    expect(result.current.activeMission).toBeNull()
    expect(result.current.isSidebarOpen).toBe(false)
    expect(result.current.isSidebarMinimized).toBe(false)
    expect(result.current.isFullScreen).toBe(false)
    expect(result.current.unreadMissionCount).toBe(0)
    expect(result.current.unreadMissionIds.size).toBe(0)
    expect(result.current.agents).toEqual([])
    expect(result.current.selectedAgent).toBeNull()
    expect(result.current.defaultAgent).toBeNull()
    expect(result.current.agentsLoading).toBe(false)
    expect(result.current.isAIDisabled).toBe(true)
    expect(result.current.pendingReview).toBeNull()
    expect(result.current.pendingReviewQueue).toEqual([])
  })

  it('fallback action methods are callable no-ops', () => {
    const { result } = renderHook(() => useMissions())

    // These should not throw — they are safe no-ops
    expect(() => result.current.toggleSidebar()).not.toThrow()
    expect(() => result.current.openSidebar()).not.toThrow()
    expect(() => result.current.closeSidebar()).not.toThrow()
    expect(() => result.current.minimizeSidebar()).not.toThrow()
    expect(() => result.current.expandSidebar()).not.toThrow()
    expect(() => result.current.setFullScreen(true)).not.toThrow()
    expect(() => result.current.cancelMission('x')).not.toThrow()
    expect(() => result.current.dismissMission('x')).not.toThrow()
    expect(() => result.current.sendMessage('x', 'hi')).not.toThrow()
    expect(() => result.current.setActiveMission(null)).not.toThrow()
    expect(() => result.current.markMissionAsRead('x')).not.toThrow()
    expect(() => result.current.selectAgent('test')).not.toThrow()
    expect(() => result.current.connectToAgent()).not.toThrow()
    expect(() => result.current.confirmPendingReview('ok')).not.toThrow()
    expect(() => result.current.cancelPendingReview()).not.toThrow()
  })

  it('fallback startMission returns a string', () => {
    const { result } = renderHook(() => useMissions())
    const returnValue = result.current.startMission({
      title: 'test',
      description: 'test',
      type: 'custom',
      initialPrompt: 'hello',
    })
    expect(typeof returnValue).toBe('string')
  })

  it('fallback saveMission returns a string', () => {
    const { result } = renderHook(() => useMissions())
    const returnValue = result.current.saveMission({
      title: 'test',
      description: 'test',
      type: 'custom',
    })
    expect(typeof returnValue).toBe('string')
  })
})

describe('MissionProvider context propagation', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('provides default empty state through context', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(result.current.missions).toEqual([])
    expect(result.current.activeMission).toBeNull()
    expect(result.current.isSidebarOpen).toBe(false)
    expect(result.current.isSidebarMinimized).toBe(false)
    expect(result.current.isFullScreen).toBe(false)
    expect(result.current.unreadMissionCount).toBe(0)
    expect(result.current.agents).toEqual([])
    expect(result.current.agentsLoading).toBe(false)
    expect(result.current.pendingReview).toBeNull()
    expect(result.current.pendingReviewQueue).toEqual([])
  })

  it('marks AI as disabled when no agent is selected', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.isAIDisabled).toBe(true)
  })

  it('exposes action methods as functions', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(typeof result.current.startMission).toBe('function')
    expect(typeof result.current.saveMission).toBe('function')
    expect(typeof result.current.runSavedMission).toBe('function')
    expect(typeof result.current.updateSavedMission).toBe('function')
    expect(typeof result.current.sendMessage).toBe('function')
    expect(typeof result.current.editAndResend).toBe('function')
    expect(typeof result.current.retryPreflight).toBe('function')
    expect(typeof result.current.cancelMission).toBe('function')
    expect(typeof result.current.dismissMission).toBe('function')
    expect(typeof result.current.renameMission).toBe('function')
    expect(typeof result.current.rateMission).toBe('function')
    expect(typeof result.current.setActiveMission).toBe('function')
    expect(typeof result.current.markMissionAsRead).toBe('function')
    expect(typeof result.current.selectAgent).toBe('function')
    expect(typeof result.current.connectToAgent).toBe('function')
    expect(typeof result.current.toggleSidebar).toBe('function')
    expect(typeof result.current.openSidebar).toBe('function')
    expect(typeof result.current.closeSidebar).toBe('function')
    expect(typeof result.current.minimizeSidebar).toBe('function')
    expect(typeof result.current.expandSidebar).toBe('function')
    expect(typeof result.current.setFullScreen).toBe('function')
    expect(typeof result.current.confirmPendingReview).toBe('function')
    expect(typeof result.current.cancelPendingReview).toBe('function')
  })

  it('persists selectedAgent key used by SELECTED_AGENT_KEY', () => {
    // Verify the constant is the expected value used in localStorage
    expect(typeof SELECTED_AGENT_KEY).toBe('string')
    expect(SELECTED_AGENT_KEY.length).toBeGreaterThan(0)
  })
})

describe('isActiveMission', () => {
  it('returns true for pending missions', () => {
    expect(isActiveMission({ status: 'pending' })).toBe(true)
  })

  it('returns true for running missions', () => {
    expect(isActiveMission({ status: 'running' })).toBe(true)
  })

  it('returns true for waiting_input missions', () => {
    expect(isActiveMission({ status: 'waiting_input' })).toBe(true)
  })

  it('returns true for blocked missions', () => {
    expect(isActiveMission({ status: 'blocked' })).toBe(true)
  })

  it('returns true for cancelling missions', () => {
    expect(isActiveMission({ status: 'cancelling' })).toBe(true)
  })

  it('returns false for completed missions', () => {
    expect(isActiveMission({ status: 'completed' })).toBe(false)
  })

  it('returns false for failed missions', () => {
    expect(isActiveMission({ status: 'failed' })).toBe(false)
  })

  it('returns false for cancelled missions', () => {
    expect(isActiveMission({ status: 'cancelled' })).toBe(false)
  })

  it('returns false for saved missions', () => {
    expect(isActiveMission({ status: 'saved' })).toBe(false)
  })
})

describe('INACTIVE_MISSION_STATUSES', () => {
  it('contains exactly four statuses', () => {
    expect(INACTIVE_MISSION_STATUSES.size).toBe(4)
  })

  it('includes saved, completed, failed, and cancelled', () => {
    expect(INACTIVE_MISSION_STATUSES.has('saved')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('completed')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('failed')).toBe(true)
    expect(INACTIVE_MISSION_STATUSES.has('cancelled')).toBe(true)
  })

  it('does not include active statuses', () => {
    expect(INACTIVE_MISSION_STATUSES.has('pending')).toBe(false)
    expect(INACTIVE_MISSION_STATUSES.has('running')).toBe(false)
    expect(INACTIVE_MISSION_STATUSES.has('waiting_input')).toBe(false)
    expect(INACTIVE_MISSION_STATUSES.has('blocked')).toBe(false)
    expect(INACTIVE_MISSION_STATUSES.has('cancelling')).toBe(false)
  })
})

describe('__missionsTestables surface area', () => {
  it('exports generateRequestId as a function', () => {
    expect(typeof __missionsTestables.generateRequestId).toBe('function')
  })

  it('generateRequestId returns unique strings', () => {
    const id1 = __missionsTestables.generateRequestId()
    const id2 = __missionsTestables.generateRequestId()
    expect(typeof id1).toBe('string')
    expect(id1.length).toBeGreaterThan(0)
    expect(id1).not.toBe(id2)
  })

  it('exports isStaleAgentErrorMessage as a function', () => {
    expect(typeof __missionsTestables.isStaleAgentErrorMessage).toBe('function')
  })

  it('isStaleAgentErrorMessage returns false for a normal message', () => {
    const normalMessage = {
      id: 'msg-1',
      role: 'assistant' as const,
      content: 'Hello, how can I help?',
      timestamp: new Date(),
    }
    expect(__missionsTestables.isStaleAgentErrorMessage(normalMessage)).toBe(false)
  })

  it('exports timeout and interval constants as positive numbers', () => {
    expect(__missionsTestables.MISSION_TIMEOUT_MS).toBeGreaterThan(0)
    expect(__missionsTestables.MISSION_TIMEOUT_CHECK_INTERVAL_MS).toBeGreaterThan(0)
    expect(__missionsTestables.MISSION_INACTIVITY_TIMEOUT_MS).toBeGreaterThan(0)
    expect(__missionsTestables.CANCEL_ACK_TIMEOUT_MS).toBeGreaterThan(0)
    expect(__missionsTestables.WAITING_INPUT_TIMEOUT_MS).toBeGreaterThan(0)
    expect(__missionsTestables.WS_RECONNECT_INITIAL_DELAY_MS).toBeGreaterThan(0)
    expect(__missionsTestables.WS_RECONNECT_MAX_DELAY_MS).toBeGreaterThan(0)
    expect(__missionsTestables.WS_RECONNECT_MAX_RETRIES).toBeGreaterThan(0)
    expect(__missionsTestables.WS_CONNECTION_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('exports cancel message type constants as strings', () => {
    expect(typeof __missionsTestables.CANCEL_ACK_MESSAGE_TYPE).toBe('string')
    expect(typeof __missionsTestables.CANCEL_CONFIRMED_MESSAGE_TYPE).toBe('string')
  })

  it('exports AGENT_DISCONNECT_ERROR_PATTERNS as a non-empty array', () => {
    expect(Array.isArray(__missionsTestables.AGENT_DISCONNECT_ERROR_PATTERNS)).toBe(true)
    expect(__missionsTestables.AGENT_DISCONNECT_ERROR_PATTERNS.length).toBeGreaterThan(0)
  })

  it('exports getMissionTimeoutMs as a function', () => {
    expect(typeof __missionsTestables.getMissionTimeoutMs).toBe('function')
  })

  it('exports isInteractiveContent as a function', () => {
    expect(typeof __missionsTestables.isInteractiveContent).toBe('function')
  })
})
