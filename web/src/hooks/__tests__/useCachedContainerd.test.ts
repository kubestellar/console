import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockUseCache, mockUseDemoMode, mockAgentFetch } = vi.hoisted(() => ({
  mockUseCache: vi.fn(),
  mockUseDemoMode: vi.fn(() => ({ isDemoMode: false })),
  mockAgentFetch: vi.fn(),
}))

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => mockUseDemoMode(),
}))

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => mockAgentFetch(...args),
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10_000,
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/time', () => ({
  MS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
}))

import { useCachedContainerd, __testables } from '../useCachedContainerd'

const { isContainerdRuntime, normalizeContainerId, mapContainerState, formatUptime, buildContainerdData } = __testables

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultCacheResult(data: unknown = null) {
  return {
    data,
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    error: null,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: Date.now(),
    refetch: vi.fn(),
    clearAndRefetch: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseCache.mockReturnValue(defaultCacheResult())
  mockUseDemoMode.mockReturnValue({ isDemoMode: false })
})

// ---------------------------------------------------------------------------
// Hook-level tests
// ---------------------------------------------------------------------------

describe('useCachedContainerd hook', () => {
  it('renders without error', () => {
    const { result } = renderHook(() => useCachedContainerd())
    expect(result.current).toBeDefined()
  })

  it('returns the expected result shape', () => {
    const { result } = renderHook(() => useCachedContainerd())
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isDemoData')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('lastRefresh')
    expect(result.current).toHaveProperty('refetch')
  })

  it('passes correct cache key', () => {
    renderHook(() => useCachedContainerd())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'containerd_status' })
    )
  })

  it('suppresses isDemoData during loading', () => {
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isDemoFallback: true,
      isLoading: true,
    })
    const { result } = renderHook(() => useCachedContainerd())
    expect(result.current.isDemoData).toBe(false)
  })

  it('returns demo data in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    const { result } = renderHook(() => useCachedContainerd())
    expect(result.current.isDemoData).toBe(true)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isFailed).toBe(false)
  })

  it('isRefreshing is false in demo mode', () => {
    mockUseDemoMode.mockReturnValue({ isDemoMode: true })
    mockUseCache.mockReturnValue({
      ...defaultCacheResult(),
      isRefreshing: true,
    })
    const { result } = renderHook(() => useCachedContainerd())
    expect(result.current.isRefreshing).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('isContainerdRuntime', () => {
  it('returns true for containerd runtime string', () => {
    expect(isContainerdRuntime('containerd://1.7.0')).toBe(true)
  })

  it('returns false for non-containerd runtime', () => {
    expect(isContainerdRuntime('docker://20.10')).toBe(false)
    expect(isContainerdRuntime('cri-o://1.27')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isContainerdRuntime(undefined)).toBe(false)
  })
})

describe('normalizeContainerId', () => {
  it('strips containerd:// prefix and truncates', () => {
    const id = 'containerd://abcdef1234567890abcdef1234567890'
    const result = normalizeContainerId(id)
    expect(result.length).toBe(12)
    expect(result).toBe('abcdef123456')
  })

  it('returns empty string for undefined', () => {
    expect(normalizeContainerId(undefined)).toBe('')
  })

  it('strips docker:// prefix too', () => {
    const result = normalizeContainerId('docker://abc123456789xyz')
    expect(result).toBe('abc123456789')
  })
})

describe('mapContainerState', () => {
  it('maps running state', () => {
    expect(mapContainerState('running')).toBe('running')
  })

  it('maps waiting to paused', () => {
    expect(mapContainerState('waiting')).toBe('paused')
  })

  it('maps terminated to stopped', () => {
    expect(mapContainerState('terminated')).toBe('stopped')
  })

  it('maps undefined to stopped', () => {
    expect(mapContainerState(undefined)).toBe('stopped')
  })
})

describe('formatUptime', () => {
  it('returns "0s" for non-running state', () => {
    expect(formatUptime(undefined, 'stopped')).toBe('0s')
  })

  it('returns "unknown" for running state with undefined startedAt', () => {
    expect(formatUptime(undefined, 'running')).toBe('unknown')
  })

  it('formats recent uptime as seconds', () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString()
    const result = formatUptime(tenSecondsAgo, 'running')
    expect(result).toMatch(/\d+s/)
  })

  it('formats hours when uptime > 1 hour', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const result = formatUptime(twoHoursAgo, 'running')
    expect(result).toMatch(/\d+h/)
  })
})

describe('buildContainerdData', () => {
  it('returns not-installed for empty nodes and pods', () => {
    const result = buildContainerdData([], [])
    expect(result.health).toBe('not-installed')
    expect(result.containers).toEqual([])
  })

  it('builds container list from containerd nodes and pods', () => {
    const nodes = [{ name: 'node-1', containerRuntime: 'containerd://1.7.0' }]
    const pods = [{
      name: 'test-pod',
      namespace: 'default',
      node: 'node-1',
      containers: [{ name: 'app', image: 'nginx:1.25', state: 'running' as const }],
    }]
    const result = buildContainerdData(nodes, pods)
    expect(result.health).not.toBe('not-installed')
    expect(result.containers.length).toBeGreaterThan(0)
  })
})
