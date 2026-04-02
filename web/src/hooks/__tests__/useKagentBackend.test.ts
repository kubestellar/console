import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — only dependencies, never the hook under test
// ---------------------------------------------------------------------------

const mockFetchKagentStatus = vi.fn()
const mockFetchKagentAgents = vi.fn()
const mockFetchKagentiProviderStatus = vi.fn()
const mockFetchKagentiProviderAgents = vi.fn()

vi.mock('../../lib/kagentBackend', () => ({
  fetchKagentStatus: (...args: unknown[]) => mockFetchKagentStatus(...args),
  fetchKagentAgents: (...args: unknown[]) => mockFetchKagentAgents(...args),
}))

vi.mock('../../lib/kagentiProviderBackend', () => ({
  fetchKagentiProviderStatus: (...args: unknown[]) => mockFetchKagentiProviderStatus(...args),
  fetchKagentiProviderAgents: (...args: unknown[]) => mockFetchKagentiProviderAgents(...args),
}))

import { useKagentBackend } from '../useKagentBackend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kagentAgent(name: string, namespace = 'default') {
  return { name, namespace, description: `Agent ${name}`, framework: 'kagent', tools: [] }
}

function kagentiAgent(name: string, namespace = 'default') {
  return { name, namespace, description: `Agent ${name}`, framework: 'kagenti', tools: [] }
}

function setupBothUnavailable() {
  mockFetchKagentStatus.mockResolvedValue({ available: false, reason: 'not installed' })
  mockFetchKagentiProviderStatus.mockResolvedValue({ available: false, reason: 'not installed' })
  mockFetchKagentAgents.mockResolvedValue([])
  mockFetchKagentiProviderAgents.mockResolvedValue([])
}

function setupKagentAvailable(agents = [kagentAgent('agent-1')]) {
  mockFetchKagentStatus.mockResolvedValue({ available: true, url: 'http://kagent:8080' })
  mockFetchKagentAgents.mockResolvedValue(agents)
  mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
  mockFetchKagentiProviderAgents.mockResolvedValue([])
}

function setupKagentiAvailable(agents = [kagentiAgent('agent-i')]) {
  mockFetchKagentStatus.mockResolvedValue({ available: false })
  mockFetchKagentAgents.mockResolvedValue([])
  mockFetchKagentiProviderStatus.mockResolvedValue({ available: true, url: 'http://kagenti:9090' })
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
  // --- Shape ---

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

  // --- Initial state ---

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

  // --- Fetching kagent status ---

  it('fetches kagent status on mount and populates agents', async () => {
    setupKagentAvailable([kagentAgent('test-agent', 'ns-1')])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
    })

    expect(result.current.kagentAgents).toHaveLength(1)
    expect(result.current.kagentAgents[0].name).toBe('test-agent')
    expect(mockFetchKagentStatus).toHaveBeenCalled()
    expect(mockFetchKagentAgents).toHaveBeenCalled()
    unmount()
  })

  it('does not fetch agents when kagent is unavailable', async () => {
    setupBothUnavailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(mockFetchKagentStatus).toHaveBeenCalled()
    })

    expect(mockFetchKagentAgents).not.toHaveBeenCalled()
    expect(result.current.kagentAgents).toEqual([])
    unmount()
  })

  // --- Fetching kagenti status ---

  it('fetches kagenti status and populates agents when available', async () => {
    setupKagentiAvailable([kagentiAgent('prov-agent', 'ns-2')])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentiAvailable).toBe(true)
    })

    expect(result.current.kagentiAgents).toHaveLength(1)
    expect(result.current.kagentiAgents[0].name).toBe('prov-agent')
    expect(mockFetchKagentiProviderStatus).toHaveBeenCalled()
    expect(mockFetchKagentiProviderAgents).toHaveBeenCalled()
    unmount()
  })

  it('clears kagenti agents when kagenti becomes unavailable', async () => {
    setupKagentiAvailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentiAvailable).toBe(true)
    })

    // Now update mock to be unavailable and trigger refresh
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])

    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.kagentiAvailable).toBe(false)
    })

    expect(result.current.kagentiAgents).toEqual([])
    unmount()
  })

  // --- selectKagentAgent ---

  it('selects a kagent agent and persists to localStorage', async () => {
    const agent = kagentAgent('my-agent', 'my-ns')
    setupKagentAvailable([agent])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAgents).toHaveLength(1)
    })

    act(() => {
      result.current.selectKagentAgent(agent)
    })

    expect(result.current.selectedKagentAgent).toEqual(agent)
    expect(localStorage.getItem('kc_kagent_selected_agent')).toBe('my-ns/my-agent')
    unmount()
  })

  it('restores selected kagent agent from localStorage on mount', async () => {
    const agent = kagentAgent('saved-agent', 'prod')
    localStorage.setItem('kc_kagent_selected_agent', 'prod/saved-agent')
    setupKagentAvailable([agent])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.selectedKagentAgent).not.toBeNull()
    })

    expect(result.current.selectedKagentAgent?.name).toBe('saved-agent')
    expect(result.current.selectedKagentAgent?.namespace).toBe('prod')
    unmount()
  })

  it('does not restore kagent agent if saved name does not match any available agent', async () => {
    localStorage.setItem('kc_kagent_selected_agent', 'ns/nonexistent-agent')
    setupKagentAvailable([kagentAgent('other-agent', 'ns')])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAgents).toHaveLength(1)
    })

    expect(result.current.selectedKagentAgent).toBeNull()
    unmount()
  })

  // --- selectKagentiAgent ---

  it('selects a kagenti agent and persists to localStorage', async () => {
    const agent = kagentiAgent('ki-agent', 'ki-ns')
    setupKagentiAvailable([agent])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentiAgents).toHaveLength(1)
    })

    act(() => {
      result.current.selectKagentiAgent(agent)
    })

    expect(result.current.selectedKagentiAgent).toEqual(agent)
    expect(localStorage.getItem('kc_kagenti_selected_agent')).toBe('ki-ns/ki-agent')
    unmount()
  })

  it('restores selected kagenti agent from localStorage on mount', async () => {
    const agent = kagentiAgent('restored-agent', 'staging')
    localStorage.setItem('kc_kagenti_selected_agent', 'staging/restored-agent')
    setupKagentiAvailable([agent])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.selectedKagentiAgent).not.toBeNull()
    })

    expect(result.current.selectedKagentiAgent?.name).toBe('restored-agent')
    unmount()
  })

  // --- setPreferredBackend ---

  it('updates preferredBackend and persists to localStorage', () => {
    const { result, unmount } = renderHook(() => useKagentBackend())

    act(() => {
      result.current.setPreferredBackend('kagent')
    })

    expect(result.current.preferredBackend).toBe('kagent')
    expect(localStorage.getItem('kc_agent_backend_preference')).toBe('kagent')

    act(() => {
      result.current.setPreferredBackend('kagenti')
    })

    expect(result.current.preferredBackend).toBe('kagenti')
    expect(localStorage.getItem('kc_agent_backend_preference')).toBe('kagenti')
    unmount()
  })

  // --- activeBackend computation ---

  it('returns kc-agent as activeBackend when nothing is available', async () => {
    setupBothUnavailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(mockFetchKagentStatus).toHaveBeenCalled()
    })

    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('returns kagent as activeBackend when preferred=kagent and available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    setupKagentAvailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
    })

    expect(result.current.activeBackend).toBe('kagent')
    unmount()
  })

  it('falls back to kc-agent when preferred=kagent but not available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagent')
    setupBothUnavailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(mockFetchKagentStatus).toHaveBeenCalled()
    })

    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  it('returns kagenti as activeBackend when preferred=kagenti and available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupKagentiAvailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentiAvailable).toBe(true)
    })

    expect(result.current.activeBackend).toBe('kagenti')
    unmount()
  })

  it('falls back to kc-agent when preferred=kagenti but not available', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kagenti')
    setupBothUnavailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(mockFetchKagentStatus).toHaveBeenCalled()
    })

    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  // --- Polling ---

  it('polls on an interval', async () => {
    vi.useFakeTimers()
    setupBothUnavailable()
    const POLL_INTERVAL_MS = 30_000

    const { result, unmount } = renderHook(() => useKagentBackend())

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const initialCount = mockFetchKagentStatus.mock.calls.length

    // Advance to trigger next poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    })

    expect(mockFetchKagentStatus.mock.calls.length).toBeGreaterThan(initialCount)
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

  // --- refresh ---

  it('refresh triggers an immediate re-fetch', async () => {
    setupBothUnavailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(mockFetchKagentStatus).toHaveBeenCalledTimes(1)
    })

    setupKagentAvailable()

    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
    })

    expect(mockFetchKagentStatus).toHaveBeenCalledTimes(2)
    unmount()
  })

  // --- Both available ---

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

  // --- Does not overwrite selected agent on refresh ---

  it('does not overwrite already selected kagent agent on refresh', async () => {
    const agentA = kagentAgent('agent-a', 'ns')
    const agentB = kagentAgent('agent-b', 'ns')
    localStorage.setItem('kc_kagent_selected_agent', 'ns/agent-a')
    setupKagentAvailable([agentA, agentB])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.selectedKagentAgent).not.toBeNull()
    })

    // Manually select agent-b
    act(() => {
      result.current.selectKagentAgent(agentB)
    })

    expect(result.current.selectedKagentAgent?.name).toBe('agent-b')

    // Refresh should NOT overwrite the current selection
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.kagentAgents).toHaveLength(2)
    })

    expect(result.current.selectedKagentAgent?.name).toBe('agent-b')
    unmount()
  })

  // --- kagentStatus details ---

  it('stores kagent status details', async () => {
    mockFetchKagentStatus.mockResolvedValue({ available: true, url: 'http://kagent:8080' })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: false })
    mockFetchKagentiProviderAgents.mockResolvedValue([])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentStatus).not.toBeNull()
    })

    expect(result.current.kagentStatus?.available).toBe(true)
    expect(result.current.kagentStatus?.url).toBe('http://kagent:8080')
    unmount()
  })

  // --- kagentiStatus details ---

  it('stores kagenti status details', async () => {
    mockFetchKagentStatus.mockResolvedValue({ available: false })
    mockFetchKagentAgents.mockResolvedValue([])
    mockFetchKagentiProviderStatus.mockResolvedValue({ available: true, url: 'http://kagenti:9090' })
    mockFetchKagentiProviderAgents.mockResolvedValue([])

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentiStatus).not.toBeNull()
    })

    expect(result.current.kagentiStatus?.available).toBe(true)
    expect(result.current.kagentiStatus?.url).toBe('http://kagenti:9090')
    unmount()
  })

  // --- kc-agent as activeBackend when preferred is kc-agent ---

  it('returns kc-agent as activeBackend even when backends are available if kc-agent is preferred', async () => {
    localStorage.setItem('kc_agent_backend_preference', 'kc-agent')
    setupBothAvailable()

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAvailable).toBe(true)
    })

    expect(result.current.activeBackend).toBe('kc-agent')
    unmount()
  })

  // --- Multiple agents ---

  it('handles multiple kagent agents', async () => {
    const agents = [
      kagentAgent('agent-1', 'ns'),
      kagentAgent('agent-2', 'ns'),
      kagentAgent('agent-3', 'other-ns'),
    ]
    setupKagentAvailable(agents)

    const { result, unmount } = renderHook(() => useKagentBackend())

    await waitFor(() => {
      expect(result.current.kagentAgents).toHaveLength(3)
    })

    expect(result.current.kagentAgents[0].name).toBe('agent-1')
    expect(result.current.kagentAgents[1].name).toBe('agent-2')
    expect(result.current.kagentAgents[2].name).toBe('agent-3')
    unmount()
  })
})
