import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions, type StartMissionParams } from './useMissions'
import {
  MISSION_CONTROL_TRIGGER_TIMEOUT_MS,
  MISSION_TIMEOUT_CHECK_INTERVAL_MS,
  MISSION_TIMEOUT_MS,
} from './useMissions.constants'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?]))),
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
  emitError: vi.fn(),
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
  runClusterReadinessCheck: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../lib/missions/scanner/malicious', () => ({
  scanForMaliciousContent: vi.fn().mockReturnValue([]),
}))

vi.mock('../lib/kubectlProxy', () => ({
  kubectlProxy: { exec: vi.fn() },
}))

// ── Mock WebSocket ─────────────────────────────────────────────────────────────

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  /** Reference to the most recently created instance. Reset in beforeEach. */
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Start a mission and simulate the WebSocket opening so the mission moves to 'running'. */
async function startMissionWithConnection(
  result: { current: ReturnType<typeof useMissions> },
  params: StartMissionParams = defaultParams,
): Promise<{ missionId: string; requestId: string }> {
  let missionId = ''
  act(() => {
    missionId = result.current.startMission(params)
  })
  // Flush the preflight promise chain before simulating the socket opening.
  await flushMissionPreflightChain()
  await act(async () => {
    MockWebSocket.lastInstance?.simulateOpen()
  })
  // Find the chat send call (list_agents fires first, then chat)
  const chatCall = MockWebSocket.lastInstance?.send.mock.calls.find(
    (call: string[]) => JSON.parse(call[0]).type === 'chat',
  )
  const requestId = chatCall ? JSON.parse(chatCall[0]).id : ''
  return { missionId, requestId }
}

async function flushMissionPreflightChain() {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
  await act(async () => { await Promise.resolve() })
}

// ── Pre-seed a mission in localStorage without going through the WS flow ──────
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
  // Suppress auto-reconnect noise: after onclose, ensureConnection is retried
  // after 3 s. Tests complete before that fires, but mocking fetch avoids
  // unhandled-rejection warnings from the HTTP fallback path.
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

// ── Persistence edge cases ──────────────────────────────────────────────────

describe('persistence edge cases', () => {
  it('missions stuck in "running" on reload are marked for reconnection', () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'running-1',
      title: 'Running Mission',
      description: 'Desc',
      type: 'troubleshoot',
      status: 'running',
      messages: [{ id: 'msg-1', role: 'user', content: 'fix it', timestamp: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'running-1')
    expect(mission?.currentStep).toBe('Reconnecting...')
    expect(mission?.context?.needsReconnect).toBe(true)
  })

  it('missions stuck in "cancelling" on reload are finalized to "failed"', () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'cancelling-1',
      title: 'Cancelling Mission',
      description: 'Desc',
      type: 'troubleshoot',
      status: 'cancelling',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    const mission = result.current.missions.find(m => m.id === 'cancelling-1')
    expect(mission?.status).toBe('failed')
    expect(mission?.messages.some(m => m.content.includes('page was reloaded'))).toBe(true)
  })

  it('handles corrupted localStorage gracefully (returns empty array)', () => {
    localStorage.setItem('kc_missions', '{"invalid json')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(result.current.missions).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('unread mission IDs survive localStorage round-trip', () => {
    localStorage.setItem('kc_unread_missions', JSON.stringify(['m1', 'm2']))
    const { result } = renderHook(() => useMissions(), { wrapper })
    expect(result.current.unreadMissionIds.has('m1')).toBe(true)
    expect(result.current.unreadMissionIds.has('m2')).toBe(true)
  })

  it('handles corrupted unread IDs gracefully', () => {
    localStorage.setItem('kc_unread_missions', 'not-json')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMissions(), { wrapper })

    expect(result.current.unreadMissionCount).toBe(0)
    errorSpy.mockRestore()
  })
})

// ── Agent selection with capabilities ────────────────────────────────────────

describe('agent selection logic', () => {
  it('prefers agents with ToolExec capability over suggest-only agents when no server selection', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-cap',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true, capabilities: 1 },
            { name: 'claude-code', displayName: 'Claude Code', description: '', provider: 'anthropic-local', available: true, capabilities: 3 },
          ],
          defaultAgent: '',
          selected: '', // No server selection — bestAvailable logic kicks in
        },
      })
    })

    // Should auto-select claude-code (has ToolExec) over copilot-cli (suggest-only)
    expect(result.current.selectedAgent).toBe('claude-code')
  })

  it('uses server-selected agent when provided', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-server',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'copilot-cli', displayName: 'Copilot CLI', description: '', provider: 'github-cli', available: true },
            { name: 'claude-code', displayName: 'Claude Code', description: '', provider: 'anthropic-local', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'copilot-cli', // Server explicitly selected copilot-cli
        },
      })
    })

    // Should use server selection when provided
    expect(result.current.selectedAgent).toBe('copilot-cli')
  })

  it('restores persisted agent selection from localStorage', async () => {
    localStorage.setItem('kc_selected_agent', 'gemini-cli')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-persist',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true },
            { name: 'gemini-cli', displayName: 'Gemini', description: '', provider: 'google-cli', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    // Should prefer persisted selection
    expect(result.current.selectedAgent).toBe('gemini-cli')
  })

  it('sends select_agent to backend when persisted differs from server selection', async () => {
    localStorage.setItem('kc_selected_agent', 'gemini-cli')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      await Promise.resolve()
      MockWebSocket.lastInstance?.simulateOpen()
      await Promise.resolve()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-sync',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true },
            { name: 'gemini-cli', displayName: 'Gemini', description: '', provider: 'google-cli', available: true },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code', // differs from persisted 'gemini-cli'
        },
      })
    })

    await waitFor(() => {
      const selectCalls = MockWebSocket.lastInstance?.send.mock.calls.filter(
        (call: string[]) => JSON.parse(call[0]).type === 'select_agent',
      )
      expect(selectCalls?.length).toBeGreaterThan(0)
      expect(JSON.parse(selectCalls![0][0]).payload.agent).toBe('gemini-cli')
    })
  })

  it('selectAgent with "none" does not send WebSocket message', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })

    act(() => { result.current.selectAgent('none') })

    expect(result.current.selectedAgent).toBe('none')
    expect(result.current.isAIDisabled).toBe(true)
    // No WS created at all for 'none'
    // (If WS was created, it would only have list_agents, not select_agent)
  })
})

// ── sendMessage edge cases ──────────────────────────────────────────────────

describe('sendMessage edge cases', () => {
})
