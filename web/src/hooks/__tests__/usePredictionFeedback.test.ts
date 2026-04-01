import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants', () => ({
  LOCAL_AGENT_HTTP_URL: 'http://localhost:8585',
}))

vi.mock('../../lib/constants/network', () => ({
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
}))

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

  it('getFeedback returns undefined for unknown prediction', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    expect(result.current.getFeedback('nonexistent')).toBeUndefined()
  })

  it('submitFeedback stores feedback', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback({
        predictionId: 'pred-1',
        feedback: 'positive',
        category: 'resource-trend',
      })
    })
    const feedback = result.current.getFeedback('pred-1')
    expect(feedback).toBeDefined()
    expect(feedback?.feedback).toBe('positive')
  })

  it('persists feedback to localStorage', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    act(() => {
      result.current.submitFeedback({
        predictionId: 'pred-2',
        feedback: 'negative',
        category: 'anomaly',
      })
    })
    const stored = localStorage.getItem('kubestellar-prediction-feedback')
    expect(stored).not.toBeNull()
  })

  it('getStats returns stats object', () => {
    const { result } = renderHook(() => usePredictionFeedback())
    const stats = result.current.getStats()
    expect(stats).toHaveProperty('total')
    expect(stats).toHaveProperty('positive')
    expect(stats).toHaveProperty('negative')
  })
})
