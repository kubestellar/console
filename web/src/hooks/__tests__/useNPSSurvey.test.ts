import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const {
  mockIsAuthenticated,
  mockIsDemoMode,
  mockAwardCoins,
  mockApiPost,
  mockEmitShown,
  mockEmitResponse,
  mockEmitDismissed,
  store,
} = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(() => true),
  mockIsDemoMode: vi.fn(() => false),
  mockAwardCoins: vi.fn(),
  mockApiPost: vi.fn().mockResolvedValue({ data: {} }),
  mockEmitShown: vi.fn(),
  mockEmitResponse: vi.fn(),
  mockEmitDismissed: vi.fn(),
  store: new Map<string, string>(),
}))

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated() }),
}))

vi.mock('../../lib/demoMode', () => ({
  isDemoMode: () => mockIsDemoMode(),
}))

vi.mock('../useRewards', () => ({
  useRewards: () => ({ awardCoins: mockAwardCoins }),
}))

vi.mock('../../lib/api', () => ({
  api: { post: mockApiPost },
}))

vi.mock('../../lib/analytics', () => ({
  emitNPSSurveyShown: (...args: unknown[]) => mockEmitShown(...args),
  emitNPSResponse: (...args: unknown[]) => mockEmitResponse(...args),
  emitNPSDismissed: (...args: unknown[]) => mockEmitDismissed(...args),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (key: string) => store.get(key) ?? null,
  safeSetItem: (key: string, value: string) => { store.set(key, value); return true },
  safeGetJSON: <T,>(key: string): T | null => {
    const raw = store.get(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
  },
  safeSetJSON: <T,>(key: string, value: T) => { store.set(key, JSON.stringify(value)); return true },
  safeRemoveItem: (key: string) => { store.delete(key); return true },
}))

import { useNPSSurvey } from '../useNPSSurvey'

describe('useNPSSurvey', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    store.clear()
    mockIsAuthenticated.mockReturnValue(true)
    mockIsDemoMode.mockReturnValue(false)
    mockAwardCoins.mockClear()
    mockApiPost.mockClear()
    mockEmitShown.mockClear()
    mockEmitResponse.mockClear()
    mockEmitDismissed.mockClear()
    // Default: enough sessions
    store.set('kc-session-count', '10')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show for unauthenticated users', () => {
    mockIsAuthenticated.mockReturnValue(false)
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.isVisible).toBe(false)
  })

  it('does not show for demo-mode users', () => {
    mockIsDemoMode.mockReturnValue(true)
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.isVisible).toBe(false)
  })

  it('does not show before MIN_SESSIONS_BEFORE_NPS sessions', () => {
    store.set('kc-session-count', '3')
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.isVisible).toBe(false)
  })

  it('shows after idle delay when eligible', () => {
    const { result } = renderHook(() => useNPSSurvey())
    expect(result.current.isVisible).toBe(false)
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.isVisible).toBe(true)
    expect(mockEmitShown).toHaveBeenCalledOnce()
  })

  it('submitResponse emits GA4 event and hides widget', async () => {
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.isVisible).toBe(true)

    await act(async () => {
      await result.current.submitResponse(4, 'Great product!')
    })

    expect(result.current.isVisible).toBe(false)
    expect(mockEmitResponse).toHaveBeenCalledWith(4, 'promoter', 14)
    expect(mockAwardCoins).toHaveBeenCalledWith('nps_survey')
  })

  it('creates GitHub issue for detractor scores', async () => {
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(30_000) })

    await act(async () => {
      await result.current.submitResponse(1, 'The UI is too complex and hard to navigate')
    })

    expect(mockApiPost).toHaveBeenCalledWith('/api/feedback/requests', {
      title: 'NPS Detractor Feedback (Score: 1)',
      description: 'The UI is too complex and hard to navigate',
      request_type: 'bug',
    })
  })

  it('does NOT create GitHub issue for non-detractor scores', async () => {
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(30_000) })

    await act(async () => {
      await result.current.submitResponse(3)
    })

    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('dismiss increments count and hides widget', () => {
    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(30_000) })

    act(() => {
      result.current.dismiss()
    })

    expect(result.current.isVisible).toBe(false)
    expect(mockEmitDismissed).toHaveBeenCalledWith(1)

    const state = JSON.parse(store.get('kc-nps-state') || '{}')
    expect(state.dismissCount).toBe(1)
  })

  it('respects dismiss retry days', () => {
    // Simulate a recent dismissal
    store.set('kc-nps-state', JSON.stringify({
      lastSubmittedAt: null,
      lastDismissedAt: new Date().toISOString(),
      dismissCount: 1,
      maxDismissalsReachedAt: null,
    }))

    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.isVisible).toBe(false)
  })

  it('max dismissals triggers reprompt cooldown', () => {
    store.set('kc-nps-state', JSON.stringify({
      lastSubmittedAt: null,
      lastDismissedAt: new Date().toISOString(),
      dismissCount: 3,
      maxDismissalsReachedAt: new Date().toISOString(),
    }))

    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(35_000) })
    expect(result.current.isVisible).toBe(false)
  })

  it('re-prompts after reprompt days since submission', () => {
    const oldDate = new Date(Date.now() - 31 * 86_400_000).toISOString()
    store.set('kc-nps-state', JSON.stringify({
      lastSubmittedAt: oldDate,
      lastDismissedAt: null,
      dismissCount: 0,
      maxDismissalsReachedAt: null,
    }))

    const { result } = renderHook(() => useNPSSurvey())
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(result.current.isVisible).toBe(true)
  })
})
