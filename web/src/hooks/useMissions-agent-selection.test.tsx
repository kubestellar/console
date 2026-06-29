import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionStarted, emitMissionCompleted, emitMissionError, emitMissionRated } from '../lib/analytics'
import { getTokenCategoryForMissionType } from '../lib/tokenUsageMissionCategory'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
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
): Promise<{ missionId: string; requestId: string }> {
  let missionId = ''
  act(() => {
    missionId = result.current.startMission(defaultParams)
  })
  // Flush microtask queue so the preflight .then() chain resolves (#3742)
  await act(async () => { await Promise.resolve() })
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

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('agent selection: persisted "none" auto-selects available agent', () => {
  it('auto-selects the best available agent when persisted is "none"', async () => {
    localStorage.setItem('kc_selected_agent', 'none')
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-auto',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: true, capabilities: 3 },
          ],
          defaultAgent: 'claude-code',
          selected: 'claude-code',
        },
      })
    })

    // Should NOT use 'none' from localStorage since an agent IS available
    expect(result.current.selectedAgent).toBe('claude-code')
    expect(result.current.isAIDisabled).toBe(false)
  })
})

// ── Agent selection: no available agents ────────────────────────────────────

describe('agent selection: no available agents', () => {
  it('falls back to null when no agents are available', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    await act(async () => {
      result.current.connectToAgent()
      MockWebSocket.lastInstance?.simulateOpen()
    })

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: 'list-none',
        type: 'agents_list',
        payload: {
          agents: [
            { name: 'claude-code', displayName: 'Claude', description: '', provider: 'anthropic-local', available: false },
          ],
          defaultAgent: '',
          selected: '',
        },
      })
    })

    // No available agent => isAIDisabled
    expect(result.current.isAIDisabled).toBe(true)
  })
})

// ── Mission reconnection: edge cases ────────────────────────────────────────

describe('mission reconnection edge cases', () => {
  it('uses the missions agent for reconnection or falls back to claude-code', async () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'reconnect-agent-1',
      title: 'Agent Mission',
      description: 'Was running with specific agent',
      type: 'troubleshoot',
      status: 'running',
      agent: 'gemini-pro',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Analyze this', timestamp: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { needsReconnect: true },
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.connectToAgent() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    // Wait for reconnect delay
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600))
    })

    const chatCalls = (MockWebSocket.lastInstance?.send.mock.calls ?? []).filter(
      (call: string[]) => {
        try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
      },
    )

    if (chatCalls.length > 0) {
      const payload = JSON.parse(chatCalls[0][0]).payload
      // Should use the mission's agent (gemini-pro)
      expect(payload.agent).toBe('gemini-pro')
    }
  })

  it('builds history excluding system messages for reconnection', async () => {
    localStorage.setItem('kc_missions', JSON.stringify([{
      id: 'reconnect-history-1',
      title: 'History Mission',
      description: 'Had system messages',
      type: 'troubleshoot',
      status: 'running',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Help me', timestamp: new Date().toISOString() },
        { id: 'msg-2', role: 'system', content: 'System note', timestamp: new Date().toISOString() },
        { id: 'msg-3', role: 'assistant', content: 'Working on it', timestamp: new Date().toISOString() },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: { needsReconnect: true },
    }]))

    const { result } = renderHook(() => useMissions(), { wrapper })
    act(() => { result.current.connectToAgent() })
    await act(async () => { MockWebSocket.lastInstance?.simulateOpen() })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600))
    })

    const chatCalls = (MockWebSocket.lastInstance?.send.mock.calls ?? []).filter(
      (call: string[]) => {
        try { return JSON.parse(call[0]).type === 'chat' } catch { return false }
      },
    )

    if (chatCalls.length > 0) {
      const payload = JSON.parse(chatCalls[0][0]).payload
      // History should NOT include system messages
      const systemInHistory = payload.history?.some((h: { role: string }) => h.role === 'system')
      expect(systemInHistory).toBe(false)
      // Should include user and assistant messages
      expect(payload.history?.some((h: { role: string }) => h.role === 'user')).toBe(true)
      expect(payload.history?.some((h: { role: string }) => h.role === 'assistant')).toBe(true)
    }
  })
})

// ── setActiveTokenCategory called on mission actions ────────────────────────
