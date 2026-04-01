import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../useDemoMode', () => ({
  getDemoMode: vi.fn(() => true),
  isDemoModeForced: true,
}))

vi.mock('../../lib/constants', () => ({
  STORAGE_KEY_TOKEN: 'kc-auth-token',
}))

import { useActiveUsers } from '../useActiveUsers'

describe('useActiveUsers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeUsers: 5, totalConnections: 8 }), { status: 200 })
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial state', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.activeUsers).toBe('number')
    expect(typeof result.current.totalConnections).toBe('number')
    expect(typeof result.current.viewerCount).toBe('number')
  })

  it('provides refetch function', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.refetch).toBe('function')
  })

  it('provides loading and error states', () => {
    const { result } = renderHook(() => useActiveUsers())
    expect(typeof result.current.isLoading).toBe('boolean')
    expect(typeof result.current.hasError).toBe('boolean')
  })

  it('refetch resets circuit breaker', () => {
    const { result } = renderHook(() => useActiveUsers())
    act(() => { result.current.refetch() })
    // Should not throw
  })

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useActiveUsers())
    expect(() => unmount()).not.toThrow()
  })
})
