import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, LOCAL_AGENT_HTTP_URL: 'http://localhost:8585' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
} })

vi.mock('../../lib/analytics', () => ({
  emitPredictionFeedbackSubmitted: vi.fn(),
}))

import { usePredictionFeedback } from '../usePredictionFeedback'

describe('usePredictionFeedback', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('returns feedback state', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    expect(result.current).toHaveProperty('getFeedback')
    expect(result.current).toHaveProperty('submitFeedback')
  })

  it('getFeedback returns null for unknown prediction', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    expect(result.current.getFeedback('nonexistent')).toBeNull()
  })

  it('submitFeedback stores feedback', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('pred-1', 'accurate', 'resource-trend')
    })
    const feedback = result.current.getFeedback('pred-1')
    expect(feedback).toBe('accurate')
  })

  it('persists feedback to localStorage', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback('pred-2', 'inaccurate', 'anomaly')
    })
    const stored = localStorage.getItem('kubestellar-prediction-feedback')
    expect(stored).not.toBeNull()
  })

  it('getStats returns stats object', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    const stats = result.current.getStats()
    expect(stats).toHaveProperty('totalPredictions')
    expect(stats).toHaveProperty('accurateFeedback')
    expect(stats).toHaveProperty('inaccurateFeedback')
  })
})
