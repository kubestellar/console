import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PipelineDataProvider, usePipelineData } from '../PipelineDataContext'
import { DEMO_PULSE, DEMO_MATRIX, DEMO_FLOW, DEMO_FAILURES } from '../../../../hooks/useGitHubPipelines'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseUnifiedPipelineData = vi.fn()

vi.mock('../../../../hooks/useGitHubPipelines', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../hooks/useGitHubPipelines')>()
  return {
    ...actual,
    useUnifiedPipelineData: (...args: unknown[]) => mockUseUnifiedPipelineData(...args),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUnifiedReturn(overrides: Record<string, unknown> = {}) {
  return {
    data: null,
    isLoading: false,
    isRefreshing: false,
    error: null,
    isFailed: false,
    isDemoFallback: false,
    lastRefresh: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PipelineDataProvider>{children}</PipelineDataProvider>
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PipelineDataContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn())
  })

  describe('usePipelineData outside provider', () => {
    it('returns null when called outside PipelineDataProvider', () => {
      const { result } = renderHook(() => usePipelineData())
      expect(result.current).toBeNull()
    })
  })

  describe('PipelineDataProvider', () => {
    it('provides non-null context value to consumers', () => {
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current).not.toBeNull()
    })

    it('provides isLoading from useUnifiedPipelineData', () => {
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ isLoading: true }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.isLoading).toBe(true)
    })

    it('provides isRefreshing from useUnifiedPipelineData', () => {
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ isRefreshing: true }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.isRefreshing).toBe(true)
    })

    it('provides error string from useUnifiedPipelineData', () => {
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ error: 'HTTP 503' }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.error).toBe('HTTP 503')
    })

    it('falls back to DEMO_PULSE when data is null', () => {
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ data: null }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.pulse).toEqual(DEMO_PULSE)
    })

    it('falls back to DEMO_MATRIX when data is null', () => {
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.matrix).toEqual(DEMO_MATRIX)
    })

    it('falls back to DEMO_FAILURES when data is null', () => {
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.failures).toEqual(DEMO_FAILURES)
    })

    it('falls back to DEMO_FLOW when data is null', () => {
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.flow).toEqual(DEMO_FLOW)
    })

    it('uses live pulse when data is provided', () => {
      const livePulse = { ...DEMO_PULSE, total: 999 }
      mockUseUnifiedPipelineData.mockReturnValue(
        makeUnifiedReturn({
          data: { pulse: livePulse, matrix: DEMO_MATRIX, failures: DEMO_FAILURES, flow: DEMO_FLOW },
        }),
      )
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.pulse.total).toBe(999)
    })

    it('isDemoFallback is false when isLoading is true even if hook returns true', () => {
      mockUseUnifiedPipelineData.mockReturnValue(
        makeUnifiedReturn({ isDemoFallback: true, isLoading: true }),
      )
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      // Provider computes: isDemoFallback && !isLoading
      expect(result.current?.isDemoFallback).toBe(false)
    })

    it('isDemoFallback is true when hook returns true and isLoading is false', () => {
      mockUseUnifiedPipelineData.mockReturnValue(
        makeUnifiedReturn({ isDemoFallback: true, isLoading: false }),
      )
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.isDemoFallback).toBe(true)
    })

    it('passes repo prop to useUnifiedPipelineData', () => {
      const wrapperWithRepo = ({ children }: { children: React.ReactNode }) => (
        <PipelineDataProvider repo="org/my-repo">{children}</PipelineDataProvider>
      )
      renderHook(() => usePipelineData(), { wrapper: wrapperWithRepo })
      expect(mockUseUnifiedPipelineData).toHaveBeenCalledWith('org/my-repo', expect.any(Number))
    })

    it('passes days prop to useUnifiedPipelineData', () => {
      const wrapperWithDays = ({ children }: { children: React.ReactNode }) => (
        <PipelineDataProvider days={30}>{children}</PipelineDataProvider>
      )
      renderHook(() => usePipelineData(), { wrapper: wrapperWithDays })
      expect(mockUseUnifiedPipelineData).toHaveBeenCalledWith(null, 30)
    })

    it('provides the refetch function from useUnifiedPipelineData', () => {
      const refetch = vi.fn()
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ refetch }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.refetch).toBe(refetch)
    })

    it('provides lastRefresh from useUnifiedPipelineData', () => {
      mockUseUnifiedPipelineData.mockReturnValue(makeUnifiedReturn({ lastRefresh: 1_700_000_000 }))
      const { result } = renderHook(() => usePipelineData(), { wrapper })
      expect(result.current?.lastRefresh).toBe(1_700_000_000)
    })
  })
})
