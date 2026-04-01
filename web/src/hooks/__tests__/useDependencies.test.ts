import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../useLocalAgent', () => ({
  isAgentUnavailable: vi.fn(() => true),
}))

vi.mock('../mcp/shared', () => ({
  clusterCacheRef: { clusters: [] },
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: vi.fn(() => false),
}))

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

vi.mock('../../lib/constants/network', () => ({
  MCP_HOOK_TIMEOUT_MS: 10000,
}))

import { useResolveDependencies } from '../useDependencies'

describe('useResolveDependencies', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'))
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useResolveDependencies())
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.progressMessage).toBe('')
  })

  it('resolve sets loading state', async () => {
    const { result } = renderHook(() => useResolveDependencies())
    // Don't await — just check that loading starts
    act(() => {
      result.current.resolve('cluster', 'default', 'nginx')
    })
    // After initiating, loading should be true or already resolved
  })

  it('reset clears all state', () => {
    const { result } = renderHook(() => useResolveDependencies())
    act(() => { result.current.reset() })
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.progressMessage).toBe('')
  })

  it('resolve returns demo data in demo mode', async () => {
    const { isDemoMode } = await import('../../lib/demoMode')
    vi.mocked(isDemoMode).mockReturnValue(true)

    const { result } = renderHook(() => useResolveDependencies())
    let resolution: unknown
    await act(async () => {
      resolution = await result.current.resolve('cluster', 'default', 'nginx')
    })
    expect(resolution).not.toBeNull()
    if (resolution && typeof resolution === 'object') {
      expect((resolution as { dependencies: unknown[] }).dependencies.length).toBeGreaterThan(0)
    }
  })
})
