import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MissionProvider, useMissions } from './useMissions'
import { getDemoMode } from './useDemoMode'
import { emitMissionError } from '../lib/analytics'

// ── External module mocks ─────────────────────────────────────────────────────

vi.mock('./mcp/agentFetch', () => ({
  agentFetch: vi.fn((...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?]))),
}))

vi.mock('./useDemoMode', () => ({
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

vi.mock('../lib/analytics', () => ({
  emitMissionStarted: vi.fn(),
  emitMissionCompleted: vi.fn(),
  emitMissionError: vi.fn(),
  emitMissionRated: vi.fn(),
  emitAgentTokenFailure: vi.fn(),
  emitWsAuthMissing: vi.fn(),
  emitSseAuthFailure: vi.fn(),
  emitSessionRefreshFailure: vi.fn(),
}))

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
  vi.useFakeTimers()
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
  vi.useRealTimers()
})

describe('non-quota localStorage save errors', () => {
  it('logs error when setItem throws a non-quota error during missions save', () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const realSetItem = localStorage.setItem.bind(localStorage)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_missions') {
        throw new Error('Generic storage error')
      }
      return realSetItem(key, value)
    })

    // Trigger a save by changing missions state
    act(() => { result.current.startMission(defaultParams) })
    // Flush the 500ms debounced save timer (#9617)
    act(() => { vi.advanceTimersByTime(600) })

    expect(errorSpy).toHaveBeenCalledWith('Failed to save missions to localStorage:', expect.any(Error))

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })

  it('logs error when saving unread IDs fails', () => {
    const realSetItem = localStorage.setItem.bind(localStorage)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'kc_unread_missions') {
        throw new Error('Storage error for unread')
      }
      return realSetItem(key, value)
    })

    // Mount provider — it will try to save initial unread state
    const { result } = renderHook(() => useMissions(), { wrapper })

    // Trigger unread save by starting and completing a mission
    // The provider saves unread IDs on mount if they exist
    expect(result.current.unreadMissionCount).toBe(0)

    vi.mocked(localStorage.setItem).mockRestore()
    errorSpy.mockRestore()
  })
})

describe('token usage tracking', () => {
  it('calls addCategoryTokens on progress message with token delta', async () => {
    const { addCategoryTokens, setActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    expect(setActiveTokenCategory).toHaveBeenCalledWith(missionId, 'diagnose')

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'Processing...', tokens: { input: 50, output: 25, total: 75 } },
      })
    })

    expect(addCategoryTokens).toHaveBeenCalledWith(75, 'diagnose')
  })

  it('calls clearActiveTokenCategory when stream completes with usage', async () => {
    const { clearActiveTokenCategory } = await import('./useTokenUsage')
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { missionId, requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
      })
    })

    // Should clear active token category for this specific mission (#6016)
    expect(clearActiveTokenCategory).toHaveBeenCalledWith(missionId)
  })

  it('tracks token delta on stream-done with usage', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'stream',
        payload: { content: '', done: true, usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 } },
      })
    })

    expect(addCategoryTokens).toHaveBeenCalledWith(300, 'diagnose')
  })
})

describe('error classification edge cases', () => {
  it('detects auth error from "403" in message text', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'HTTP 403 Forbidden' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "permission_error" code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'permission_error', message: 'Insufficient permissions' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "oauth token" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'provider_error', message: 'OAuth token expired, please re-authenticate' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "token has expired" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'auth', message: 'The token has expired' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "invalid x-api-key" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'invalid x-api-key header value' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects auth error from "failed to authenticate"', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'connection', message: 'failed to authenticate with provider' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(true)
  })

  it('detects rate limit from "rate limit" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'rate limit exceeded for this model' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "rate_limit" code', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'rate_limit', message: 'Throttled' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "too many requests" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api_error', message: 'too many requests, slow down' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "resource_exhausted"', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'resource_exhausted', message: 'Quota depleted' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "tokens per min" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'exceeded tokens per min limit' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('detects rate limit from "requests per min" in message', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'api', message: 'exceeded requests per min' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(true)
  })

  it('shows generic error message for unrecognized error codes', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: { code: 'some_novel_error', message: 'Something completely new went wrong' },
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    // Should contain the raw error message, not the auth/rate-limit template
    expect(mission.messages.some(m => m.content.includes('Something completely new went wrong'))).toBe(true)
    expect(mission.messages.some(m => m.content.includes('Authentication Error'))).toBe(false)
    expect(mission.messages.some(m => m.content.includes('Rate Limit'))).toBe(false)
  })

  it('handles error message with missing code and message (fallback to "Unknown error")', async () => {
    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'error',
        payload: {},
      })
    })

    const mission = result.current.missions[0]
    expect(mission.status).toBe('failed')
    expect(mission.messages.some(m => m.content.includes('Unknown error'))).toBe(true)
    // The "missing message" path explicitly passes `undefined` as the
    // 3rd arg — toHaveBeenCalledWith requires an exact match for that
    // arg, and expect.anything() does NOT match undefined.
    expect(emitMissionError).toHaveBeenCalledWith('troubleshoot', 'unknown', undefined)
  })
})

// ── Token usage tracking: progressive delta ─────────────────────────────────

describe('token usage delta tracking', () => {
  it('calculates delta from previous total on progress messages', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // First progress: total=100
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 80, output: 20, total: 100 } },
      })
    })
    expect(addCategoryTokens).toHaveBeenCalledWith(100, 'diagnose')

    vi.mocked(addCategoryTokens).mockClear()

    // Second progress: total=250, delta should be 150
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 200, output: 50, total: 250 } },
      })
    })
    expect(addCategoryTokens).toHaveBeenCalledWith(150, 'diagnose')
  })

  it('does not call addCategoryTokens when progress has no tokens', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { step: 'No tokens here' },
      })
    })

    expect(addCategoryTokens).not.toHaveBeenCalled()
  })

  it('does not call addCategoryTokens when delta is zero', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Set initial total
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 50, output: 50, total: 100 } },
      })
    })
    vi.mocked(addCategoryTokens).mockClear()

    // Same total again — delta is 0
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 50, output: 50, total: 100 } },
      })
    })
    expect(addCategoryTokens).not.toHaveBeenCalled()
  })

  it('tracks token delta from result message with usage data', async () => {
    const { addCategoryTokens } = await import('./useTokenUsage')
    vi.mocked(addCategoryTokens).mockClear()

    const { result } = renderHook(() => useMissions(), { wrapper })
    const { requestId } = await startMissionWithConnection(result)

    // Set initial tokens via progress
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'progress',
        payload: { tokens: { input: 100, output: 50, total: 150 } },
      })
    })
    vi.mocked(addCategoryTokens).mockClear()

    // Result with higher total
    act(() => {
      MockWebSocket.lastInstance?.simulateMessage({
        id: requestId,
        type: 'result',
        payload: {
          content: 'Done',
          agent: 'claude-code',
          sessionId: 'test',
          done: true,
          usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300 },
        },
      })
    })

    // Delta: 300 - 150 = 150
    expect(addCategoryTokens).toHaveBeenCalledWith(150, 'diagnose')
  })
})