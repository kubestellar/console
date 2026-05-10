import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only dependencies, never the hook under test
// ---------------------------------------------------------------------------

vi.mock('../useLocalAgent', () => ({
  useLocalAgent: vi.fn(() => ({ status: 'disconnected' })),
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
    STORAGE_KEY_TOKEN: 'kc-auth-token',
  }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10000 }
})

const mockFetchKagentStatus = vi.fn()
const mockFetchKagentAgents = vi.fn()
const mockFetchKagentiProviderStatus = vi.fn()
const mockFetchKagentiProviderAgents = vi.fn()

vi.mock('../../lib/kagentBackend', () => ({
  fetchKagentStatus: (...args: unknown[]) => mockFetchKagentStatus(...args),
  fetchKagentAgents: (...args: unknown[]) => mockFetchKagentAgents(...args),
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({
  fetchKagentiProviderStatus: (...args: unknown[]) =>
    mockFetchKagentiProviderStatus(...args),
  fetchKagentiProviderAgents: (...args: unknown[]) =>
    mockFetchKagentiProviderAgents(...args),
}))

import { useKagentBackend, __resetForTest, __testables } from '../useKagentBackend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kagentAgent(name: string, namespace = 'default') {
  return {
    name,
    namespace,
    description: `Agent ${name}`,
    framework: 'kagent',
    tools: [],
  }
}

function kagentiAgent(name: string, namespace = 'default') {
  return {
    name,
    namespace,
    description: `Agent ${name}`,
    framework: 'kagenti',
    tools: [],
  }
}

function setupBothUnavailable() {
  mockFetchKagentStatus.mockResolvedValue({
    available: false,
    reason: 'not installed',
  })
  mockFetchKagentiProviderStatus.mockResolvedValue({
    available: false,
    reason: 'not installed',
  })
  mockFetchKagentAgents.mockResolvedValue([])
  mockFetchKagentiProviderAgents.mockResolvedValue([])
}

function setupKagentAvailable(agents = [kagentAgent('agent-1')]) {
  mockFetchKagentStatus.mockResolvedValue({
    available: true,
    url: 'http://kagent:8080',
  })
  mockFetchKagentAgents.mockResolvedValue(agents)
  mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
  mockFetchKagentiProviderAgents.mockResolvedValue([])
}

function setupKagentiAvailable(agents = [kagentiAgent('agent-i')]) {
  mockFetchKagentStatus.mockResolvedValue({ available: false })
  mockFetchKagentAgents.mockResolvedValue([])
  mockFetchKagentiProviderStatus.mockResolvedValue({
    available: true,
    url: 'http://kagenti:9090',
  })
  mockFetchKagentiProviderAgents.mockResolvedValue(agents)
}

function setupBothAvailable() {
  mockFetchKagentStatus.mockResolvedValue({ available: true })
  mockFetchKagentAgents.mockResolvedValue([kagentAgent('k-agent')])
  mockFetchKagentiProviderStatus.mockResolvedValue({ available: true })
  mockFetchKagentiProviderAgents.mockResolvedValue([kagentiAgent('ki-agent')])
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetForTest()
  vi.clearAllMocks()
  localStorage.clear()
  setupBothUnavailable()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useKagentBackend', () => {
  it('returns all expected properties', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current).toHaveProperty('kagentAvailable')
    expect(result.current).toHaveProperty('kagentStatus')
    expect(result.current).toHaveProperty('kagentAgents')
    expect(result.current).toHaveProperty('selectedKagentAgent')
    expect(result.current).toHaveProperty('selectKagentAgent')
    expect(result.current).toHaveProperty('kagentiAvailable')
    expect(result.current).toHaveProperty('kagentiStatus')
    expect(result.current).toHaveProperty('kagentiAgents')
    expect(result.current).toHaveProperty('selectedKagentiAgent')
    expect(result.current).toHaveProperty('selectKagentiAgent')
    expect(result.current).toHaveProperty('preferredBackend')
    expect(result.current).toHaveProperty('setPreferredBackend')
    expect(result.current).toHaveProperty('activeBackend')
    expect(result.current).toHaveProperty('refresh')
    unmount()
  })

  it('starts with kagent and kagenti unavailable', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.kagentAvailable).toBe(false)
    expect(result.current.kagentiAvailable).toBe(false)
    expect(result.current.kagentAgents).toEqual([])
    expect(result.current.kagentiAgents).toEqual([])
    expect(result.current.selectedKagentAgent).toBeNull()
    expect(result.current.selectedKagentiAgent).toBeNull()
    unmount()
  })

  it('defaults preferredBackend to kc-agent when no localStorage', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.preferredBackend).toBe('kc-agent')
    unmount()
  })

  it('restores preferredBackend=kagent from localStorage', () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.preferredBackend).toBe('kagent')
    unmount()
  })

  it('restores preferredBackend=kagenti from localStorage', () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.preferredBackend).toBe('kagenti')
    unmount()
  })

  it('defaults to kc-agent when localStorage has invalid value', () => {
    localStorage.setItem('kc_agent_backend_preference', 'invalid-backend')
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.preferredBackend).toBe('kc-agent')
    unmount()
  })

  it('fetches kagent status on mount and populates agents', async () => {
    setupKagentAvailable([kagentAgent('test-agent', 'ns-1')])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(result.current.kagentAgents).toHaveLength(1)
    expect(result.current.kagentAgents[0].name).toBe('test-agent')
    expect(mockFetchKagentStatus).toHaveBeenCalled()
    expect(mockFetchKagentAgents).toHaveBeenCalled()
    unmount()
  })

  it('does not fetch agents when kagent is unavailable', async () => {
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(mockFetchKagentStatus).toHaveBeenCalled())
    expect(mockFetchKagentAgents).not.toHaveBeenCalled()
    expect(result.current.kagentAgents).toEqual([])
    unmount()
  })

  it('fetches kagenti status and populates agents when available', async () => {
    setupKagentiAvailable([kagentiAgent('prov-agent', 'ns-2')])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAvailable).toBe(true))
    expect(result.current.kagentiAgents).toHaveLength(1)
    expect(result.current.kagentiAgents[0].name).toBe('prov-agent')
    unmount()
  })

  it('clears kagenti agents when kagenti becomes unavailable', async () => {
    setupKagentiAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAvailable).toBe(true))

    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentiAvailable).toBe(false))
    expect(result.current.kagentiAgents).toEqual([])
    unmount()
  })

  it('selects a kagent agent and persists to localStorage', async () => {
    const agent = kagentAgent('my-agent', 'my-ns')
    setupKagentAvailable([agent])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAgents).toHaveLength(1))
    act(() => result.current.selectKagentAgent(agent))
    expect(result.current.selectedKagentAgent).toEqual(agent)
    expect(localStorage.getItem('kc_kagent_selected_agent')).toBe(
      'my-ns/my-agent',
    )
    unmount()
  })

  it('restores selected kagent agent from localStorage on mount', async () => {
    const agent = kagentAgent('saved-agent', 'prod')
    localStorage.setItem('kc_kagent_selected_agent', 'prod/saved-agent')
    setupKagentAvailable([agent])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.selectedKagentAgent).not.toBeNull())
    expect(result.current.selectedKagentAgent?.name).toBe('saved-agent')
    expect(result.current.selectedKagentAgent?.namespace).toBe('prod')
    unmount()
  })

  it('does not restore kagent agent if saved name does not match any agent', async () => {
    localStorage.setItem('kc_kagent_selected_agent', 'ns/nonexistent-agent')
    setupKagentAvailable([kagentAgent('other-agent', 'ns')])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAgents).toHaveLength(1))
    expect(result.current.selectedKagentAgent).toBeNull()
    unmount()
  })

  it('selects a kagenti agent and persists to localStorage', async () => {
    const agent = kagentiAgent('ki-agent', 'ki-ns')
    setupKagentiAvailable([agent])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAgents).toHaveLength(1))
    act(() => result.current.selectKagentiAgent(agent))
    expect(result.current.selectedKagentiAgent).toEqual(agent)
    expect(localStorage.getItem('kc_kagenti_selected_agent')).toBe(
      'ki-ns/ki-agent',
    )
    unmount()
  })

  it('restores selected kagenti agent from localStorage on mount', async () => {
    const agent = kagentiAgent('restored-agent', 'staging')
    localStorage.setItem('kc_kagenti_selected_agent', 'staging/restored-agent')
    setupKagentiAvailable([agent])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() =>
      expect(result.current.selectedKagentiAgent).not.toBeNull(),
    )
    expect(result.current.selectedKagentiAgent?.name).toBe('restored-agent')
    unmount()
  })

  it('updates preferredBackend and persists to localStorage', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    act(() => result.current.setPreferredBackend('kagent'))
    expect(result.current.preferredBackend).toBe('kagent')
    expect(localStorage.getItem('kc_agent_backend_preference')).toBe('kagent')
    act(() => result.current.setPreferredBackend('kagenti'))
    expect(result.current.preferredBackend).toBe('kagenti')
    expect(localStorage.getItem('kc_agent_backend_preference')).toBe('kagenti')
    unmount()
  })

  it('returns kc-agent as activeBackend when nothing is available', async () => {
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(mockFetchKagentStatus).toHaveBeenCalled())
    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('returns kagent as activeBackend when preferred=kagent and available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    setupKagentAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(result.current.activeBackend).toBe('kagent')
    unmount()
  })

  it('falls back to kc-agent when preferred=kagent but not available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    // Issue 9246: `activeBackend` starts equal to `preferredBackend` and only
    // snaps to 'kc-agent' after `hasPolled` flips true. Waiting for the mock
    // to have been CALLED is insufficient — the state commit happens in a
    // later microtask. Wait for `hasPolled` (or the final value) instead.
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('returns kagenti as activeBackend when preferred=kagenti and available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupKagentiAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAvailable).toBe(true))
    expect(result.current.activeBackend).toBe('kagenti')
    unmount()
  })

  it('falls back to kc-agent when preferred=kagenti but not available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    // Issue 9246: same race as the 'kagent' fallback test above — wait for
    // `hasPolled` instead of the mock call, so `activeBackend` has settled.
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('returns kc-agent as activeBackend when kc-agent is preferred even with both available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kc-agent')
    setupBothAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('polls on an interval', async () => {
    vi.useFakeTimers()
    setupBothUnavailable()
    const POLL_INTERVAL_MS = 30_000
    const { unmount } = renderHook(() => useKagentBackend())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    const initialCount = mockFetchKagentStatus.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })
    expect(mockFetchKagentStatus.mock.calls.length).toBeGreaterThan(
      initialCount,
    )
    unmount()
    vi.useRealTimers()
  })

  it('clears poll interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useKagentBackend())
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('shares a single polling cycle across multiple consumers', async () => {
    setupBothUnavailable()
    const first = renderHook(() => useKagentBackend())
    const second = renderHook(() => useKagentBackend())

    await waitFor(() => expect(first.result.current.hasPolled).toBe(true))
    await waitFor(() => expect(second.result.current.hasPolled).toBe(true))

    expect(mockFetchKagentStatus).toHaveBeenCalledTimes(1)
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalledTimes(1)

    first.unmount()
    second.unmount()
  })

  it('debounces rapid remount polling for kagenti status', async () => {
    vi.useFakeTimers()
    setupBothUnavailable()

    const firstMount = renderHook(() => useKagentBackend())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalledTimes(1)
    firstMount.unmount()

    const secondMount = renderHook(() => useKagentBackend())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(__testables.BACKEND_REFRESH_MIN_INTERVAL_MS)
    })
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalledTimes(2)

    secondMount.unmount()
    vi.useRealTimers()
  })

  it('aborts in-flight polling when the last consumer unmounts', () => {
    let observedSignal: AbortSignal | undefined

    mockFetchKagentStatus.mockImplementation(({ signal }: { signal?: AbortSignal } = {}) => {
      observedSignal = signal
      return new Promise(() => {})
    })
    mockFetchKagentiProviderStatus.mockImplementation(() => new Promise(() => {}))

    const { unmount } = renderHook(() => useKagentBackend())

    expect(observedSignal).toBeDefined()
    expect(observedSignal?.aborted).toBe(false)

    unmount()

    expect(observedSignal?.aborted).toBe(true)
  })

  it('refresh triggers an immediate re-fetch', async () => {
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(mockFetchKagentStatus).toHaveBeenCalledTimes(1))
    setupKagentAvailable()
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(mockFetchKagentStatus).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('reports both backends as available when both are running', async () => {
    setupBothAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
      expect(result.current.kagentiAvailable).toBe(true)
    })
    expect(result.current.kagentAgents).toHaveLength(1)
    expect(result.current.kagentiAgents).toHaveLength(1)
    unmount()
  })

  it('does not overwrite already selected kagent agent on refresh', async () => {
    const agentA = kagentAgent('agent-a', 'ns')
    const agentB = kagentAgent('agent-b', 'ns')
    localStorage.setItem('kc_kagent_selected_agent', 'ns/agent-a')
    setupKagentAvailable([agentA, agentB])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.selectedKagentAgent).not.toBeNull())
    act(() => result.current.selectKagentAgent(agentB))
    expect(result.current.selectedKagentAgent?.name).toBe('agent-b')
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentAgents).toHaveLength(2))
    expect(result.current.selectedKagentAgent?.name).toBe('agent-b')
    unmount()
  })

  it('stores kagent status details', async () => {
    mockFetchKagentStatus.mockResolvedValue({
      available: true,
      url: 'http://kagent:8080',
    })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentStatus).not.toBeNull())
    expect(result.current.kagentStatus?.available).toBe(true)
    expect(result.current.kagentStatus?.url).toBe('http://kagent:8080')
    unmount()
  })

  it('stores kagenti status details', async () => {
    mockFetchKagentStatus.mockResolvedValue({ available: false })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({
      available: true,
      url: 'http://kagenti:9090',
    })
    mockFetchKagentiProviderAgents.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiStatus).not.toBeNull())
    expect(result.current.kagentiStatus?.available).toBe(true)
    expect(result.current.kagentiStatus?.url).toBe('http://kagenti:9090')
    unmount()
  })

  it('handles multiple kagent agents', async () => {
    const agents = [
      kagentAgent('agent-1', 'ns'),
      kagentAgent('agent-2', 'ns'),
      kagentAgent('agent-3', 'other-ns'),
    ]
    setupKagentAvailable(agents)
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAgents).toHaveLength(3))
    expect(result.current.kagentAgents[0].name).toBe('agent-1')
    expect(result.current.kagentAgents[1].name).toBe('agent-2')
    expect(result.current.kagentAgents[2].name).toBe('agent-3')
    unmount()
  })

  it('clears kagent agents when kagent becomes unavailable on refresh', async () => {
    setupKagentAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
      expect(result.current.kagentAgents).toHaveLength(1)
    })
    mockFetchKagentStatus.mockResolvedValue({
      available: false,
      reason: 'gone',
    })
    mockFetchKagentAgents.mockResolvedValue([])
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentAvailable).toBe(false))
    expect(result.current.kagentAgents).toEqual([])
    unmount()
  })

  it('stores kagent status with reason when unavailable', async () => {
    mockFetchKagentStatus.mockResolvedValue({
      available: false,
      reason: 'not installed',
    })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentStatus).not.toBeNull())
    expect(result.current.kagentStatus?.available).toBe(false)
    expect(result.current.kagentStatus?.reason).toBe('not installed')
    unmount()
  })

  it('handles empty agents list when kagent is available', async () => {
    mockFetchKagentStatus.mockResolvedValue({
      available: true,
      url: 'http://kagent:8080',
    })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(result.current.kagentAgents).toEqual([])
    expect(result.current.selectedKagentAgent).toBeNull()
    unmount()
  })

  it('activeBackend changes when preferred backend becomes available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    // Wait for the first poll to settle so hasPolled=true and activeBackend reflects live state
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.activeBackend).toBe('kc-agent')
    setupKagentAvailable()
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentAvailable).toBe(true))
    expect(result.current.activeBackend).toBe('kagent')
    unmount()
  })

  it('can change preference back to kc-agent', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    act(() => result.current.setPreferredBackend('kagent'))
    expect(result.current.preferredBackend).toBe('kagent')
    act(() => result.current.setPreferredBackend('kc-agent'))
    expect(result.current.preferredBackend).toBe('kc-agent')
    expect(localStorage.getItem('kc_agent_backend_preference')).toBe(
      'kc-agent',
    )
    unmount()
  })

  it('does not overwrite already selected kagenti agent on refresh', async () => {
    const agentA = kagentiAgent('agent-a', 'ns')
    const agentB = kagentiAgent('agent-b', 'ns')
    localStorage.setItem('kc_kagenti_selected_agent', 'ns/agent-a')
    setupKagentiAvailable([agentA, agentB])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() =>
      expect(result.current.selectedKagentiAgent).not.toBeNull(),
    )
    act(() => result.current.selectKagentiAgent(agentB))
    expect(result.current.selectedKagentiAgent?.name).toBe('agent-b')
    await act(async () => {
      await result.current.refresh()
    })
    await waitFor(() => expect(result.current.kagentiAgents).toHaveLength(2))
    expect(result.current.selectedKagentiAgent?.name).toBe('agent-b')
    unmount()
  })

  it('does not restore kagenti agent if saved name does not match', async () => {
    localStorage.setItem('kc_kagenti_selected_agent', 'ns/nonexistent-agent')
    setupKagentiAvailable([kagentiAgent('other-agent', 'ns')])
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAgents).toHaveLength(1))
    expect(result.current.selectedKagentiAgent).toBeNull()
    unmount()
  })

  it('handles multiple kagenti agents', async () => {
    const agents = [kagentiAgent('ki-1', 'ns'), kagentiAgent('ki-2', 'other-ns')]
    setupKagentiAvailable(agents)
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.kagentiAgents).toHaveLength(2))
    expect(result.current.kagentiAgents[0].name).toBe('ki-1')
    expect(result.current.kagentiAgents[1].name).toBe('ki-2')
    unmount()
  })

  // ---------------------------------------------------------------------------
  // hasPolled flag — guards AgentSelector blink-and-disappear race
  // ---------------------------------------------------------------------------

  it('exposes hasPolled property', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current).toHaveProperty('hasPolled')
    unmount()
  })

  it('hasPolled starts false before the first poll resolves', () => {
    // Use a never-resolving mock so we can inspect the pre-poll state
    mockFetchKagentStatus.mockReturnValue(new Promise(() => {}))
    mockFetchKagentiProviderStatus.mockReturnValue(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.hasPolled).toBe(false)
    unmount()
  })

  it('hasPolled becomes true after the first poll completes', async () => {
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.hasPolled).toBe(false)
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    unmount()
  })

  it('hasPolled becomes true even when kagenti is available', async () => {
    setupKagentiAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.kagentiAvailable).toBe(true)
    unmount()
  })

  it('activeBackend uses stored preference before first poll (pre-poll stability)', () => {
    // Pre-poll: stored pref is kagenti. Poll hasn't returned yet so kagentiAvailable=false.
    // activeBackend should still return 'kagenti' (not snap to kc-agent before the poll).
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    mockFetchKagentiProviderStatus.mockReturnValue(new Promise(() => {})) // never resolves
    mockFetchKagentStatus.mockReturnValue(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useKagentBackend())
    expect(result.current.hasPolled).toBe(false)
    expect(result.current.activeBackend).toBe('kagenti') // trust stored pref, not live state
    unmount()
  })

  it('activeBackend reflects live kagentiAvailable after first poll', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupKagentiAvailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.activeBackend).toBe('kagenti')
    unmount()
  })

  it('activeBackend falls back to kc-agent after poll when preferred kagenti is unavailable', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('hasPolled remains true across subsequent refreshes', async () => {
    setupBothUnavailable()
    const { result, unmount } = renderHook(() => useKagentBackend())
    await waitFor(() => expect(result.current.hasPolled).toBe(true))
    await act(async () => { await result.current.refresh() })
    expect(result.current.hasPolled).toBe(true)
    unmount()
  })
})
