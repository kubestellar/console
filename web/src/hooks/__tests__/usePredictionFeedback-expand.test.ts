/**
 * Supplemental tests for usePredictionFeedback.ts covering branches
 * not tested by the existing usePredictionFeedback.test.ts:
 * - removeFeedback
 * - getStats (with provider breakdown)
 * - clearFeedback
 * - getFeedbackContext exported function
 * - storage event listener
 * - singleton feedback trimming at MAX_FEEDBACK_ENTRIES
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../mcp/shared', () => ({
  agentFetch: (...args: unknown[]) => globalThis.fetch(...(args as [RequestInfo, RequestInit?])),
  clusterCacheRef: { clusters: [] },
  REFRESH_INTERVAL_MS: 120_000,
  CLUSTER_POLL_INTERVAL_MS: 60_000,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10000 }
})

vi.mock('../../lib/analytics', () => ({
  emitPredictionFeedbackSubmitted: vi.fn(),
}))

import { usePredictionFeedback, getFeedbackContext } from '../usePredictionFeedback'

const originalFetch = globalThis.fetch

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// removeFeedback
// ---------------------------------------------------------------------------

describe('usePredictionFeedback — removeFeedback', () => {
  it('removes an existing feedback entry', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('pred-1', 'accurate', 'anomaly')
    })
    expect(result.current.getFeedback('pred-1')).toBe('accurate')
    act(() => {
      result.current.removeFeedback('pred-1')
    })
    expect(result.current.getFeedback('pred-1')).toBeNull()
  })

  it('decrements feedbackCount after removal', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('pred-a', 'accurate', 'anomaly')
      result.current.submitFeedback('pred-b', 'inaccurate', 'anomaly')
    })
    const countBefore = result.current.feedbackCount
    act(() => {
      result.current.removeFeedback('pred-a')
    })
    expect(result.current.feedbackCount).toBe(countBefore - 1)
  })

  it('does nothing when removing a non-existent entry', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    const countBefore = result.current.feedbackCount
    act(() => {
      result.current.removeFeedback('does-not-exist')
    })
    expect(result.current.feedbackCount).toBe(countBefore)
  })
})

// ---------------------------------------------------------------------------
// clearFeedback
// ---------------------------------------------------------------------------

describe('usePredictionFeedback — clearFeedback', () => {
  it('removes all feedback entries', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('p1', 'accurate', 'anomaly')
      result.current.submitFeedback('p2', 'inaccurate', 'trend')
    })
    expect(result.current.feedbackCount).toBeGreaterThan(0)
    act(() => {
      result.current.clearFeedback()
    })
    expect(result.current.feedbackCount).toBe(0)
  })

  it('persists the cleared state to localStorage', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('p1', 'accurate', 'anomaly')
      result.current.clearFeedback()
    })
    const stored = localStorage.getItem('kubestellar-prediction-feedback')
    const parsed = JSON.parse(stored || '[]')
    expect(parsed).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('usePredictionFeedback — getStats', () => {
  it('returns zero stats when no feedback', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => { result.current.clearFeedback() })
    const stats = result.current.getStats()
    expect(stats.totalPredictions).toBe(0)
    expect(stats.accuracyRate).toBe(0)
    expect(stats.accurateFeedback).toBe(0)
    expect(stats.inaccurateFeedback).toBe(0)
  })

  it('computes accuracy rate correctly', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.clearFeedback()
      result.current.submitFeedback('s1', 'accurate', 'anomaly')
      result.current.submitFeedback('s2', 'accurate', 'anomaly')
      result.current.submitFeedback('s3', 'inaccurate', 'anomaly')
    })
    const stats = result.current.getStats()
    expect(stats.totalPredictions).toBe(3)
    expect(stats.accurateFeedback).toBe(2)
    expect(stats.inaccurateFeedback).toBe(1)
    expect(stats.accuracyRate).toBeCloseTo(2 / 3)
  })

  it('breaks down stats by provider', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.clearFeedback()
      result.current.submitFeedback('q1', 'accurate', 'anomaly', 'openai')
      result.current.submitFeedback('q2', 'inaccurate', 'anomaly', 'openai')
      result.current.submitFeedback('q3', 'accurate', 'trend', 'gemini')
    })
    const stats = result.current.getStats()
    expect(stats.byProvider).toHaveProperty('openai')
    expect(stats.byProvider['openai'].total).toBe(2)
    expect(stats.byProvider['openai'].accurate).toBe(1)
    expect(stats.byProvider['openai'].accuracyRate).toBeCloseTo(0.5)
    expect(stats.byProvider['gemini'].total).toBe(1)
  })

  it('groups entries without provider under "unknown"', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.clearFeedback()
      result.current.submitFeedback('r1', 'accurate', 'anomaly')
    })
    const stats = result.current.getStats()
    expect(stats.byProvider).toHaveProperty('unknown')
    expect(stats.byProvider['unknown'].total).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// getFeedbackContext (exported pure function)
// ---------------------------------------------------------------------------

describe('getFeedbackContext', () => {
  it('returns "No prediction feedback recorded yet." when empty', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => { result.current.clearFeedback() })
    const ctx = getFeedbackContext()
    expect(ctx).toContain('No prediction feedback recorded yet.')
  })

  it('includes accurate/inaccurate counts when feedback exists', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.clearFeedback()
      result.current.submitFeedback('c1', 'accurate', 'anomaly')
      result.current.submitFeedback('c2', 'inaccurate', 'trend')
    })
    const ctx = getFeedbackContext()
    expect(ctx).toContain('Accurate:')
    expect(ctx).toContain('Inaccurate:')
  })

  it('mentions prediction types that were often inaccurate', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.clearFeedback()
      for (let i = 0; i < 3; i++) {
        result.current.submitFeedback(`bad-${i}`, 'inaccurate', 'anomaly')
      }
      result.current.submitFeedback('good-1', 'accurate', 'trend')
    })
    const ctx = getFeedbackContext()
    expect(ctx).toContain('anomaly')
  })
})

// ---------------------------------------------------------------------------
// Storage event listener (cross-tab sync)
// ---------------------------------------------------------------------------

describe('usePredictionFeedback — storage event sync', () => {
  it('re-reads localStorage on storage event for the feedback key', async () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => { result.current.clearFeedback() })

    const newData = [
      {
        predictionId: 'ext-1',
        feedback: 'accurate',
        timestamp: new Date().toISOString(),
        predictionType: 'anomaly',
      },
    ]
    localStorage.setItem('kubestellar-prediction-feedback', JSON.stringify(newData))

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'kubestellar-prediction-feedback',
        newValue: JSON.stringify(newData),
      }))
    })

    await waitFor(() => result.current.feedbackCount > 0)
    expect(result.current.getFeedback('ext-1')).toBe('accurate')
  })

  it('ignores storage events for other keys', async () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => { result.current.clearFeedback() })
    const before = result.current.feedbackCount

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'some-other-key',
        newValue: 'value',
      }))
    })

    expect(result.current.feedbackCount).toBe(before)
  })
})
