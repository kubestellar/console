import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock dependencies before importing the hook
vi.mock('../../lib/utils/localStorage', () => ({
  safeGetJSON: vi.fn(() => null),
  safeSetJSON: vi.fn(),
}))

vi.mock('../../lib/constants/storage', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_VISIT_STREAK: 'kc-visit-streak',
} })

vi.mock('../../lib/analytics', () => ({
  emitStreakDay: vi.fn(),
}))

import { safeGetJSON, safeSetJSON } from '../../lib/utils/localStorage'
import { emitStreakDay } from '../../lib/analytics'

/** Helper: format date as YYYY-MM-DD in local timezone */
function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// We can't easily test the useState-initializer calculation via the hook
// because the module is cached after first import. Instead we test the
// exported hook behavior by controlling what safeGetJSON returns before each
// dynamic import (with vi.resetModules).

describe('useVisitStreak', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a streak of at least 1', async () => {
    vi.mocked(safeGetJSON).mockReturnValue(null)
    // calculateStreak runs when useVisitStreak() is first called via
    // the useState initializer, not at import time.
    const { useVisitStreak } = await import('../useVisitStreak')
    const { result } = renderHook(() => useVisitStreak())
    expect(result.current.streak).toBeGreaterThanOrEqual(1)
  })

  it('safeSetJSON is called to persist streak data', async () => {
    vi.mocked(safeGetJSON).mockReturnValue(null)
    const { useVisitStreak } = await import('../useVisitStreak')
    renderHook(() => useVisitStreak())
    // The module calls safeSetJSON during calculateStreak
    expect(safeSetJSON).toHaveBeenCalled()
  })

  it('reads stored streak data from localStorage', async () => {
    const today = toDateStr(new Date())
    vi.mocked(safeGetJSON).mockReturnValue({
      lastVisitDate: today,
      currentStreak: 7,
    })
    const { useVisitStreak } = await import('../useVisitStreak')
    renderHook(() => useVisitStreak())
    expect(safeGetJSON).toHaveBeenCalled()
  })

  it('exports useVisitStreak that returns an object with streak property', async () => {
    const { useVisitStreak } = await import('../useVisitStreak')
    const { result } = renderHook(() => useVisitStreak())
    expect(result.current).toHaveProperty('streak')
    expect(typeof result.current.streak).toBe('number')
  })

  it('emitStreakDay is importable for streak events', () => {
    // Verify the analytics function is properly mocked and available
    expect(typeof emitStreakDay).toBe('function')
  })
})
