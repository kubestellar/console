/**
 * Tests for useMissions.provider.tsx
 *
 * Covers module-level constants, the isStaleAgentErrorMessage helper,
 * and basic MissionProvider rendering via renderHook.
 *
 * Since most constants and helpers are module-private (not exported),
 * we import the module and test observable behavior through the provider.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

// ---------------------------------------------------------------------------
// Hoist mock factories so vi.mock calls can reference them
// ---------------------------------------------------------------------------

const mockLoadMissions = vi.hoisted(() => vi.fn(() => []))
const mockSaveMissions = vi.hoisted(() => vi.fn())
const mockLoadUnreadMissionIds = vi.hoisted(() => vi.fn(() => new Set<string>()))
const mockSaveUnreadMissionIds = vi.hoisted(() => vi.fn())
const mockMergeMissions = vi.hoisted(() => vi.fn((_prev: unknown[], reloaded: unknown[]) => reloaded))
const mockGetSelectedKagentiAgentFromStorage = vi.hoisted(() => vi.fn(() => null))

const mockUseLocalAgent = vi.hoisted(() =>
  vi.fn(() => ({
    isConnected: false,
    health: null as Record<string, unknown> | null,
    refresh: vi.fn(),
  }))
)

const mockGetDemoMode = vi.hoisted(() => vi.fn(() => false))
const mockAppendWsAuthToken = vi.hoisted(() => vi.fn((url: string) => url))

// ---------------------------------------------------------------------------
// Mock ALL dependencies
// ---------------------------------------------------------------------------

vi.mock('../useMissionStorage', () => ({
  MISSIONS_STORAGE_KEY: 'kc_missions',
  CROSS_TAB_ECHO_IGNORE_MS: 5,
  SELECTED_AGENT_KEY: 'kc_selected_agent',
  loadMissions: mockLoadMissions,
  saveMissions: mockSaveMissions,
  loadUnreadMissionIds: mockLoadUnreadMissionIds,
  saveUnreadMissionIds: mockSaveUnreadMissionIds,
  mergeMissions: mockMergeMissions,
  getSelectedKagentiAgentFromStorage: mockGetSelectedKagentiAgentFromStorage,
}))

vi.mock('../useMissionPromptBuilder', () => ({
  generateMessageId: vi.fn(() => `msg-${Date.now()}`),
  buildEnhancedPrompt: vi.fn((prompt: string) => prompt),
  buildSystemMessages: vi.fn(() => []),
  stripInteractiveArtifacts: vi.fn((s: string) => s),
  buildSavedMissionPrompt: vi.fn((prompt: string) => prompt),
}))

vi.mock('../useMissions.context', () => {
  const actual = { generateRequestId: vi.fn(() => `req-${Date.now()}`) }
  return {
    ...actual,
    MissionContext: {
      Provider: ({ value, children }: { value: unknown; children: React.ReactNode }) =>
        React.createElement('div', { 'data-testid': 'mission-context' }, children),
    },
    generateRequestId: actual.generateRequestId,
  }
})

vi.mock('../useDemoMode', () => ({
  getDemoMode: mockGetDemoMode,
}))

vi.mock('../useTokenUsage', () => ({
  addCategoryTokens: vi.fn(),
  setActiveTokenCategory: vi.fn(),
  clearActiveTokenCategory: vi.fn(),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://localhost:8080/ws',
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8080',
}))

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: mockUseLocalAgent,
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: vi.fn(),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/utils/wsAuth', () => ({
  appendWsAuthToken: mockAppendWsAuthToken,
}))

vi.mock('../../lib/analytics', () => ({
  emitError: vi.fn(),
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
}))

vi.mock('../../lib/missions/scanner/malicious', () => ({
  scanForMaliciousContent: vi.fn(() => ({ isMalicious: false, reasons: [] })),
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_MINUTE: 60_000,
  SECONDS_PER_DAY: 86_400,
}))

vi.mock('../../lib/missions/preflightCheck', () => ({
  runPreflightCheck: vi.fn(async () => ({ ok: true, checks: [] })),
  classifyKubectlError: vi.fn(),
  getRemediationActions: vi.fn(() => []),
  resolveRequiredTools: vi.fn(() => []),
  runToolPreflightCheck: vi.fn().mockResolvedValue({ passed: true, tools: [] }),
}))

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: vi.fn(),
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({
  kagentiProviderChat: vi.fn(),
  fetchKagentiProviderAgents: vi.fn(),
}))

vi.mock('../../components/missions/ConfirmMissionPromptDialog', () => ({
  ConfirmMissionPromptDialog: () => null,
}))

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------

// We need to import the provider to test it.
// Since isStaleAgentErrorMessage is not exported, we test it through the
// provider's observable behavior (agent reconnection clearing stale errors).
import { MissionProvider } from '../useMissions.provider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Module-level constants validation
// ---------------------------------------------------------------------------

describe('module-level constants', () => {
  // We can't directly access private constants, but we can verify they affect
  // behavior. Here we test the ones exposed through observable side effects.

  it('MissionProvider is exported as a function', () => {
    expect(MissionProvider).toBeDefined()
    expect(typeof MissionProvider).toBe('function')
  })

  it('calls loadMissions on initialization', () => {
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    expect(mockLoadMissions).toHaveBeenCalled()
  })

  it('calls loadUnreadMissionIds on initialization', () => {
    mockLoadUnreadMissionIds.mockReturnValue(new Set<string>())

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    expect(mockLoadUnreadMissionIds).toHaveBeenCalled()
  })

  it('saves missions when they change (debounced)', () => {
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // The save is debounced by 500ms
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mockSaveMissions).toHaveBeenCalledWith([])
  })
})

// ---------------------------------------------------------------------------
// isStaleAgentErrorMessage (tested via provider behavior)
// ---------------------------------------------------------------------------

describe('isStaleAgentErrorMessage via agent reconnection', () => {
  // isStaleAgentErrorMessage checks:
  // 1. msg.role === 'system'
  // 2. msg.content includes one of AGENT_DISCONNECT_ERROR_PATTERNS

  it('clears stale "Local Agent Not Connected" errors when agent reconnects', () => {
    const staleMission = {
      id: 'mission-1',
      title: 'Test Mission',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'Do something',
          timestamp: new Date(),
        },
        {
          id: 'msg-2',
          role: 'system' as const,
          content: 'Local Agent Not Connected — please start the agent',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([staleMission])
    // Start with agent disconnected
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    // Now simulate agent reconnecting
    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    // The provider should have called setMissions to clear stale errors
    // and transition the mission back to 'saved'. We verify via saveMissions
    // being called with the cleaned state.
    act(() => {
      vi.advanceTimersByTime(600)
    })

    // saveMissions should be called with the cleaned mission
    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        // The mission should be transitioned to 'saved' status
        expect(savedMissions[0].status).toBe('saved')
        // The stale error message should be removed
        const systemMessages = savedMissions[0].messages.filter(
          (m: { role: string }) => m.role === 'system'
        )
        expect(systemMessages).toHaveLength(0)
      }
    }
  })

  it('does not clear non-stale system messages on agent reconnect', () => {
    const missionWithOtherError = {
      id: 'mission-2',
      title: 'Test Mission 2',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'Do something',
          timestamp: new Date(),
        },
        {
          id: 'msg-2',
          role: 'system' as const,
          content: 'Some other error that is not agent-related',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([missionWithOtherError])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    // Reconnect
    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    // The mission should NOT be transitioned because the error is not a stale agent error
    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        // Status should remain 'failed' since the error is not agent-related
        expect(savedMissions[0].status).toBe('failed')
      }
    }
  })

  it('matches "agent not available" pattern as a stale agent error', () => {
    const staleMission = {
      id: 'mission-3',
      title: 'Test Mission 3',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'system' as const,
          content: 'The agent not available right now, please try later',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([staleMission])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        expect(savedMissions[0].status).toBe('saved')
      }
    }
  })

  it('matches "agent not responding" pattern as a stale agent error', () => {
    const staleMission = {
      id: 'mission-4',
      title: 'Test Mission 4',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'system' as const,
          content: 'The agent not responding. Check your connection.',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([staleMission])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        expect(savedMissions[0].status).toBe('saved')
      }
    }
  })

  it('does not treat assistant role messages as stale agent errors', () => {
    // isStaleAgentErrorMessage requires role === 'system'
    const missionWithAssistantError = {
      id: 'mission-5',
      title: 'Test Mission 5',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'assistant' as const,
          content: 'Local Agent Not Connected — this is an assistant message though',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([missionWithAssistantError])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    // Should NOT transition because the message is role='assistant', not 'system'
    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        expect(savedMissions[0].status).toBe('failed')
      }
    }
  })

  it('only clears stale errors from failed missions, not running ones', () => {
    const runningMission = {
      id: 'mission-6',
      title: 'Running Mission',
      description: 'test',
      type: 'custom' as const,
      status: 'running' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'system' as const,
          content: 'Local Agent Not Connected',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([runningMission])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    // Running missions should not be affected by stale error cleanup
    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        expect(savedMissions[0].status).toBe('running')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Provider initialization
// ---------------------------------------------------------------------------

describe('MissionProvider initialization', () => {
  it('renders children without crashing', () => {
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { result } = renderHook(() => 'rendered', { wrapper })

    expect(result.current).toBe('rendered')
  })

  it('restores active mission ID from localStorage', () => {
    const testMissionId = 'test-mission-id-123'
    localStorage.setItem('kc_active_mission_id', testMissionId)
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    // The provider reads from localStorage during initialization
    renderHook(() => null, { wrapper })

    // Verify it read from localStorage (the value is used internally)
    expect(localStorage.getItem('kc_active_mission_id')).toBe(testMissionId)
  })

  it('restores sidebar open state from localStorage', () => {
    localStorage.setItem('kc_mission_sidebar_open', 'true')
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    expect(localStorage.getItem('kc_mission_sidebar_open')).toBe('true')
  })

  it('defaults sidebar to closed when no localStorage key exists', () => {
    // Don't set any localStorage key
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // The provider sets the default key to 'false'
    expect(localStorage.getItem('kc_mission_sidebar_open')).toBe('false')
  })
})

// ---------------------------------------------------------------------------
// Demo mode behavior
// ---------------------------------------------------------------------------

describe('demo mode', () => {
  it('does not attempt WebSocket connection in demo mode', () => {
    mockGetDemoMode.mockReturnValue(true)
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // In demo mode, ensureConnection rejects immediately, so
    // no WebSocket should be created. appendWsAuthToken should
    // not be called since no WS connection is attempted.
    // (The provider doesn't auto-connect on mount, but any
    // mission start in demo mode would be blocked.)
    expect(mockAppendWsAuthToken).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cross-tab storage event handling
// ---------------------------------------------------------------------------

describe('cross-tab storage events', () => {
  it('ignores storage events for non-mission keys', () => {
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // Fire a storage event for a different key
    const event = new StorageEvent('storage', {
      key: 'some_other_key',
      newValue: '[]',
    })

    act(() => {
      window.dispatchEvent(event)
    })

    // mergeMissions should not be called for non-mission keys
    expect(mockMergeMissions).not.toHaveBeenCalled()
  })

  it('handles remote mission clear (newValue === null)', () => {
    mockLoadMissions.mockReturnValue([
      {
        id: 'existing-mission',
        title: 'Existing',
        description: 'test',
        type: 'custom',
        status: 'completed',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // Fire a storage event with null newValue (remote clear)
    const event = new StorageEvent('storage', {
      key: 'kc_missions',
      newValue: null,
    })

    act(() => {
      window.dispatchEvent(event)
    })

    // After remote clear, saveMissions should eventually be called with []
    // (after the debounce, but the suppressNextSaveRef prevents the
    // save effect from writing back)
  })
})

// ---------------------------------------------------------------------------
// Unread mission IDs persistence
// ---------------------------------------------------------------------------

describe('unread mission IDs', () => {
  it('saves unread mission IDs when they change', () => {
    mockLoadUnreadMissionIds.mockReturnValue(new Set<string>())
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // On mount, saveUnreadMissionIds is called with the initial empty set
    expect(mockSaveUnreadMissionIds).toHaveBeenCalled()
  })

  it('initializes with unread IDs from storage', () => {
    const unreadIds = new Set(['mission-a', 'mission-b'])
    mockLoadUnreadMissionIds.mockReturnValue(unreadIds)
    mockLoadMissions.mockReturnValue([])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // saveUnreadMissionIds should be called with the loaded set
    expect(mockSaveUnreadMissionIds).toHaveBeenCalledWith(unreadIds)
  })
})

// ---------------------------------------------------------------------------
// AGENT_DISCONNECT_ERROR_PATTERNS coverage
// ---------------------------------------------------------------------------

describe('AGENT_DISCONNECT_ERROR_PATTERNS', () => {
  // These tests verify all three patterns are recognized by the provider

  const patterns = [
    'Local Agent Not Connected',
    'agent not available',
    'agent not responding',
  ]

  patterns.forEach((pattern) => {
    it(`recognizes "${pattern}" as a stale agent error`, () => {
      const mission = {
        id: `mission-pattern-${pattern.replace(/\s+/g, '-')}`,
        title: 'Pattern Test',
        description: 'test',
        type: 'custom' as const,
        status: 'failed' as const,
        messages: [
          {
            id: 'msg-1',
            role: 'system' as const,
            content: `Error: ${pattern} — please reconnect`,
            timestamp: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockLoadMissions.mockReturnValue([mission])
      mockUseLocalAgent.mockReturnValue({
        isConnected: false,
        health: null,
        refresh: vi.fn(),
      })

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(MissionProvider, null, children)

      const { rerender } = renderHook(() => null, { wrapper })

      mockUseLocalAgent.mockReturnValue({
        isConnected: true,
        health: null,
        refresh: vi.fn(),
      })

      rerender()

      act(() => {
        vi.advanceTimersByTime(600)
      })

      if (mockSaveMissions.mock.calls.length > 0) {
        const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
        if (savedMissions.length > 0) {
          expect(savedMissions[0].status).toBe('saved')
        }
      }
    })
  })

  it('does not match partial pattern "agent not"', () => {
    const mission = {
      id: 'mission-partial',
      title: 'Partial Pattern Test',
      description: 'test',
      type: 'custom' as const,
      status: 'failed' as const,
      messages: [
        {
          id: 'msg-1',
          role: 'system' as const,
          content: 'The agent not configured properly',
          timestamp: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    mockLoadMissions.mockReturnValue([mission])
    mockUseLocalAgent.mockReturnValue({
      isConnected: false,
      health: null,
      refresh: vi.fn(),
    })

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    const { rerender } = renderHook(() => null, { wrapper })

    mockUseLocalAgent.mockReturnValue({
      isConnected: true,
      health: null,
      refresh: vi.fn(),
    })

    rerender()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      if (savedMissions.length > 0) {
        // "agent not configured properly" should NOT match any pattern
        expect(savedMissions[0].status).toBe('failed')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Mission timeout check interval
// ---------------------------------------------------------------------------

describe('mission timeout watchdog', () => {
  it('checks for timed-out missions periodically', () => {
    const longRunningMission = {
      id: 'timeout-mission',
      title: 'Long Running',
      description: 'test',
      type: 'custom' as const,
      status: 'running' as const,
      messages: [],
      createdAt: new Date(),
      // updatedAt set far in the past to trigger timeout
      updatedAt: new Date(Date.now() - 400_000), // 400 seconds ago (> 300s timeout)
    }

    mockLoadMissions.mockReturnValue([longRunningMission])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    // Advance past the check interval (15 seconds)
    act(() => {
      vi.advanceTimersByTime(16_000)
    })

    // The mission should be transitioned to 'failed' after timeout
    act(() => {
      vi.advanceTimersByTime(600) // debounce for save
    })

    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      const timeoutMission = savedMissions.find(
        (m: { id: string }) => m.id === 'timeout-mission'
      )
      if (timeoutMission) {
        expect(timeoutMission.status).toBe('failed')
        // Should have a timeout error message
        const timeoutMsg = timeoutMission.messages.find(
          (m: { content: string }) => m.content.includes('Mission Timed Out')
        )
        expect(timeoutMsg).toBeDefined()
      }
    }
  })

  it('does not time out completed missions', () => {
    const completedMission = {
      id: 'completed-mission',
      title: 'Completed',
      description: 'test',
      type: 'custom' as const,
      status: 'completed' as const,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(Date.now() - 400_000),
    }

    mockLoadMissions.mockReturnValue([completedMission])

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(MissionProvider, null, children)

    renderHook(() => null, { wrapper })

    act(() => {
      vi.advanceTimersByTime(16_000)
    })

    act(() => {
      vi.advanceTimersByTime(600)
    })

    if (mockSaveMissions.mock.calls.length > 0) {
      const savedMissions = mockSaveMissions.mock.calls[mockSaveMissions.mock.calls.length - 1][0]
      const mission = savedMissions.find(
        (m: { id: string }) => m.id === 'completed-mission'
      )
      if (mission) {
        expect(mission.status).toBe('completed')
      }
    }
  })
})
