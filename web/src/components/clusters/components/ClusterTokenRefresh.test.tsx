import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ClusterInfo } from '../../../hooks/useMCP'

vi.mock('../../../lib/clipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve()),
}))

import { useClusterRefreshSpin, isTokenExpired } from './ClusterTokenRefresh'

describe('ClusterTokenRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('useClusterRefreshSpin', () => {
    it('returns false when not refreshing', () => {
      const { result } = renderHook(() => useClusterRefreshSpin(false))
      expect(result.current).toBe(false)
    })

    it('returns true when refreshing starts', () => {
      const { result } = renderHook(() => useClusterRefreshSpin(true))
      expect(result.current).toBe(true)
    })

    it('maintains spinning state for minimum duration after refresh completes', () => {
      const { result, rerender } = renderHook(
        ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
        { initialProps: { refreshing: true } }
      )
      
      expect(result.current).toBe(true)
      
      rerender({ refreshing: false })
      expect(result.current).toBe(true)
      
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      
      expect(result.current).toBe(false)
    })

    it('respects custom minimum duration', () => {
      const { result, rerender } = renderHook(
        ({ refreshing }) => useClusterRefreshSpin(refreshing, 2000),
        { initialProps: { refreshing: true } }
      )
      
      rerender({ refreshing: false })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current).toBe(true)
      
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(result.current).toBe(false)
    })

    it('continues spinning if refresh starts again before minimum duration', () => {
      const { result, rerender } = renderHook(
        ({ refreshing }) => useClusterRefreshSpin(refreshing, 1000),
        { initialProps: { refreshing: true } }
      )
      
      rerender({ refreshing: false })
      act(() => {
        vi.advanceTimersByTime(500)
      })
      
      rerender({ refreshing: true })
      expect(result.current).toBe(true)
    })
  })

  describe('isTokenExpired', () => {
    it('returns true when error type is auth', () => {
      const cluster: ClusterInfo = {
        name: 'test-cluster',
        context: 'test-context',
        server: 'https://test.example.com',
        errorType: 'auth',
        healthy: false,
        namespaces: [],
        aliases: [],
      }
      expect(isTokenExpired(cluster)).toBe(true)
    })

    it('returns false when error type is not auth', () => {
      const cluster: ClusterInfo = {
        name: 'test-cluster',
        context: 'test-context',
        server: 'https://test.example.com',
        errorType: 'network',
        healthy: false,
        namespaces: [],
        aliases: [],
      }
      expect(isTokenExpired(cluster)).toBe(false)
    })

    it('returns false when error type is not set', () => {
      const cluster: ClusterInfo = {
        name: 'test-cluster',
        context: 'test-context',
        server: 'https://test.example.com',
        healthy: true,
        namespaces: [],
        aliases: [],
      }
      expect(isTokenExpired(cluster)).toBe(false)
    })

    it('returns false for healthy cluster', () => {
      const cluster: ClusterInfo = {
        name: 'test-cluster',
        context: 'test-context',
        server: 'https://test.example.com',
        healthy: true,
        namespaces: [],
        aliases: [],
      }
      expect(isTokenExpired(cluster)).toBe(false)
    })
  })
})
