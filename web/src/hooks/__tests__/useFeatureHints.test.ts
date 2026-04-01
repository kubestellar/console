import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/constants/storage', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_FEATURE_HINTS_DISMISSED: 'kc-hints-dismissed',
  STORAGE_KEY_HINTS_SUPPRESSED: 'kc-hints-suppressed',
} })

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
import { emitFeatureHintShown, emitFeatureHintDismissed, emitFeatureHintActioned } from '../../lib/analytics'
import { safeGetJSON, safeGetItem } from '../../lib/utils/localStorage'

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

  it('is visible when hint has not been dismissed', () => {
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(true)
  })

  it('is not visible when hint was previously dismissed', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(false)
  })

  it('is not visible when hints are globally suppressed', () => {
    vi.mocked(safeGetItem).mockReturnValue('true')
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    expect(result.current.isVisible).toBe(false)
  })

  it('emits shown analytics on first render when visible', () => {
    renderHook(() => useFeatureHints('cmd-k'))
    expect(emitFeatureHintShown).toHaveBeenCalledWith('cmd-k')
  })

  it('does not emit shown analytics when already dismissed', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    renderHook(() => useFeatureHints('cmd-k'))
    expect(emitFeatureHintShown).not.toHaveBeenCalled()
  })

  it('dismiss hides hint and emits analytics', () => {
    const { result } = renderHook(() => useFeatureHints('card-drag'))
    act(() => { result.current.dismiss() })
    expect(result.current.isVisible).toBe(false)
    expect(emitFeatureHintDismissed).toHaveBeenCalledWith('card-drag')
  })

  it('action hides hint and emits action analytics', () => {
    const { result } = renderHook(() => useFeatureHints('missions'))
    act(() => { result.current.action() })
    expect(result.current.isVisible).toBe(false)
    expect(emitFeatureHintActioned).toHaveBeenCalledWith('missions')
  })

  it('auto-dismisses after 8 seconds', () => {
    const AUTO_DISMISS_MS = 8_000
    const { result } = renderHook(() => useFeatureHints('fab-add'))
    expect(result.current.isVisible).toBe(true)
    act(() => { vi.advanceTimersByTime(AUTO_DISMISS_MS) })
    expect(result.current.isVisible).toBe(false)
  })

  it('dismiss is no-op when already hidden', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    act(() => { result.current.dismiss() })
    expect(emitFeatureHintDismissed).not.toHaveBeenCalled()
  })

  it('action is no-op when already hidden', () => {
    vi.mocked(safeGetJSON).mockReturnValue(['cmd-k'])
    const { result } = renderHook(() => useFeatureHints('cmd-k'))
    act(() => { result.current.action() })
    expect(emitFeatureHintActioned).not.toHaveBeenCalled()
  })
})
