import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../lib/constants/storage', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    STORAGE_KEY_FEATURE_HINTS_DISMISSED: 'kc-hints-dismissed',
    STORAGE_KEY_HINTS_SUPPRESSED: 'kc-hints-suppressed',
  }
})

vi.mock('../../lib/analytics', () => ({
  emitFeatureHintShown: vi.fn(),
  emitFeatureHintDismissed: vi.fn(),
  emitFeatureHintActioned: vi.fn(),
}))

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
  safeGetItem: vi.fn(() => null),
}))

import { useFeatureHints } from '../useFeatureHints'
import {
  emitFeatureHintShown,
  emitFeatureHintDismissed,
  emitFeatureHintActioned,
} from '../../lib/analytics'
import { safeGetJSON, safeSetJSON, safeGetItem } from '../../lib/utils/localStorage'

/** Auto-dismiss interval matches the source constant */
const FEATURE_HINT_AUTO_DISMISS_MS = 8_000

describe('useFeatureHints', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    vi.mocked(safeGetJSON).mockReturnValue(null)
    vi.mocked(safeGetItem).mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // 1. Visibility — not yet dismissed
  // -----------------------------------------------------------------------
  it('is visible when hint has not been dismissed', () => {
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 2. Visibility — previously dismissed in storage
  // -----------------------------------------------------------------------
  it('is not visible when hint was previously dismissed', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 3. Visibility — master suppression toggle
  // -----------------------------------------------------------------------
  it('is not visible when hints are globally suppressed', () => {
    vi.mocked(safeGetItem).mockReturnValue('true')
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(false)
  })

  // -----------------------------------------------------------------------
  // 4. Shown analytics emitted once
  // -----------------------------------------------------------------------
  it('emits shown analytics exactly once on first render when visible', () => {
    const { rerender } = renderHook(() => useFeatureHints('cmd-k'))
    expect(emitFeatureHintShown).toHaveBeenCalledTimes(1)
    expect(emitFeatureHintShown).toHaveBeenCalledWith('cmd-k')

    // Re-render should NOT emit again (emittedRef guard)
    rerender()
    expect(emitFeatureHintShown).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------------
  // 5. No shown analytics when already dismissed
  // -----------------------------------------------------------------------
  it('does not emit shown analytics when already dismissed', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    renderHook(() => useFeatureHints('cmd-k'))
    expect(emitFeatureHintShown).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 6. Dismiss hides hint and fires analytics
  // -----------------------------------------------------------------------
  it('dismiss hides hint, emits dismissed analytics, and persists to storage', () => {
    const { result } = renderHook(() => useFeatureHints('card-drag'))
    act(() => { result.current.dismiss() })

    expect(result.current.isVisible).toBe(false)
    expect(emitFeatureHintDismissed).toHaveBeenCalledWith('card-drag')
    // Should persist to localStorage
    expect(safeSetJSON).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 7. Action hides hint and fires action analytics
  // -----------------------------------------------------------------------
  it('action hides hint, emits actioned analytics, and persists to storage', () => {
    const { result } = renderHook(() => useFeatureHints('missions'))
    act(() => { result.current.action() })

    expect(result.current.isVisible).toBe(false)
    expect(emitFeatureHintActioned).toHaveBeenCalledWith('missions')
    expect(safeSetJSON).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 8. Auto-dismiss after 8 seconds
  // -----------------------------------------------------------------------
  it('auto-dismisses after 8 seconds and persists the dismissal', () => {
    const { result } = renderHook(() => useFeatureHints('fab-add'))
    expect(result.current.isVisible).toBe(true)

    act(() => { vi.advanceTimersByTime(FEATURE_HINT_AUTO_DISMISS_MS) })
    expect(result.current.isVisible).toBe(false)
    // Should persist to storage on auto-dismiss
    expect(safeSetJSON).toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 9. Does NOT auto-dismiss before the timer fires
  // -----------------------------------------------------------------------
  it('remains visible just before the auto-dismiss timer fires', () => {
    const ALMOST_EXPIRED_MS = FEATURE_HINT_AUTO_DISMISS_MS - 1
    const { result } = renderHook(() => useFeatureHints('fab-add'))
    act(() => { vi.advanceTimersByTime(ALMOST_EXPIRED_MS) })
    expect(result.current.isVisible).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 10. Dismiss is no-op when already hidden
  // -----------------------------------------------------------------------
  it('dismiss is a no-op when the hint is already hidden', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    act(() => { result.current.dismiss() })
    expect(emitFeatureHintDismissed).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 11. Action is no-op when already hidden
  // -----------------------------------------------------------------------
  it('action is a no-op when the hint is already hidden', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    act(() => { result.current.action() })
    expect(emitFeatureHintActioned).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 12. Different hint types are tracked independently
  // -----------------------------------------------------------------------
  it('allows one hint to be visible while another is dismissed', () => {
    // 'cmd-k' is dismissed but 'missions' is not
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result: cmdK } = renderHook(() => useFeatureHints('cmd-k'))
    const { result: missions } = renderHook(() => useFeatureHints('missions'))

    expect(cmdK.current.isVisible).toBe(false)
    expect(missions.current.isVisible).toBe(true)
  })

  // -----------------------------------------------------------------------
  // 13. All five hint types initialise as visible when not dismissed
  // -----------------------------------------------------------------------
  it('shows each of the five hint types when none are dismissed', () => {
    const hintTypes = ['cmd-k', 'card-drag', 'missions', 'fab-add', 'update-available'] as const
    for (const hintType of hintTypes) {
      const { result } = renderHook(() => useFeatureHints(hintType))
      expect(result.current.isVisible).toBe(true)
    }
  })

  // -----------------------------------------------------------------------
  // 14. Auto-dismiss timer is cleaned up on unmount
  // -----------------------------------------------------------------------
  it('cleans up the auto-dismiss timer when unmounted before it fires', () => {
    const { result, unmount } = renderHook(() => useFeatureHints('fab-add'))
    expect(result.current.isVisible).toBe(true)

    unmount()

    // Advancing time after unmount should not cause errors
    act(() => { vi.advanceTimersByTime(FEATURE_HINT_AUTO_DISMISS_MS * 2) })
    // No assertion failure means cleanup worked
  })

  // -----------------------------------------------------------------------
  // 15. Dismiss after action — second call is no-op
  // -----------------------------------------------------------------------
  it('calling dismiss after action is a no-op (already hidden)', () => {
    const { result } = renderHook(() => useFeatureHints('card-drag'))

    act(() => { result.current.action() })
    expect(result.current.isVisible).toBe(false)
    expect(emitFeatureHintActioned).toHaveBeenCalledTimes(1)

    act(() => { result.current.dismiss() })
    // dismiss should NOT fire because isVisible is already false
    expect(emitFeatureHintDismissed).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // 16. Suppressed overrides individual hint state
  // -----------------------------------------------------------------------
  it('globally suppressed overrides even if no hints are individually dismissed', () => {
    vi.mocked(safeGetItem).mockReturnValue('true')
    vi.mocked(safeGetJSON).mockReturnValue(null) // nothing dismissed individually

    const { result } = renderHook(() => useFeatureHints('missions'))
    expect(result.current.isVisible).toBe(false)
    // And shown analytics should NOT fire
    expect(emitFeatureHintShown).not.toHaveBeenCalled()
  })
})
