import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks — analytics
// ---------------------------------------------------------------------------

const mockEmitNudgeShown = vi.fn()
const mockEmitNudgeDismissed = vi.fn()
const mockEmitNudgeActioned = vi.fn()

vi.mock('../../lib/analytics', () => ({
  emitNudgeShown: (...args: unknown[]) => mockEmitNudgeShown(...args),
  emitNudgeDismissed: (...args: unknown[]) => mockEmitNudgeDismissed(...args),
  emitNudgeActioned: (...args: unknown[]) => mockEmitNudgeActioned(...args),
}))

// ---------------------------------------------------------------------------
// Mock localStorage utilities — pass through to real localStorage
// ---------------------------------------------------------------------------

vi.mock('../../lib/utils/localStorage', () => ({
  safeGetItem: (key: string) => localStorage.getItem(key),
  safeSetItem: (key: string, value: string) => {
    localStorage.setItem(key, value)
    return true
  },
  safeGetJSON: <T,>(key: string): T | null => {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T } catch { return null }
  },
  safeSetJSON: (key: string, value: unknown) => {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  },
}))

// ---------------------------------------------------------------------------
// Storage key constants — must match the source
// ---------------------------------------------------------------------------

const STORAGE_KEY_NUDGE_DISMISSED = 'kc-nudge-dismissed'
const STORAGE_KEY_DRAG_HINT_SHOWN = 'kc-drag-hint-shown'
const STORAGE_KEY_PWA_PROMPT_DISMISSED = 'kc-pwa-prompt-dismissed'
const STORAGE_KEY_SESSION_COUNT = 'kc-session-count'
const STORAGE_KEY_VISIT_COUNT = 'kc-visit-count'
const STORAGE_KEY_HINTS_SUPPRESSED = 'kc-hints-suppressed'

// ---------------------------------------------------------------------------
// Mock matchMedia for isStandalonePwa check
// ---------------------------------------------------------------------------

const mockMatchMedia = vi.fn().mockReturnValue({ matches: false })
vi.stubGlobal('matchMedia', mockMatchMedia)

// ---------------------------------------------------------------------------
// Import hook under test
// ---------------------------------------------------------------------------

import { useContextualNudges } from '../useContextualNudges'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useContextualNudges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    mockEmitNudgeShown.mockClear()
    mockEmitNudgeDismissed.mockClear()
    mockEmitNudgeActioned.mockClear()
    mockMatchMedia.mockReturnValue({ matches: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Return shape ────────────────────────────────────────────────────────

  it('returns the expected API shape', () => {
    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current).toHaveProperty('activeNudge')
    expect(result.current).toHaveProperty('showDragHint')
    expect(result.current).toHaveProperty('dismissNudge')
    expect(result.current).toHaveProperty('actionNudge')
    expect(result.current).toHaveProperty('recordVisit')
    expect(typeof result.current.dismissNudge).toBe('function')
    expect(typeof result.current.actionNudge).toBe('function')
    expect(typeof result.current.recordVisit).toBe('function')
  })

  // ── Session counter ─────────────────────────────────────────────────────

  it('increments session count on mount', () => {
    renderHook(() => useContextualNudges(false))

    expect(localStorage.getItem(STORAGE_KEY_SESSION_COUNT)).toBe('1')
  })

  it('increments session count from existing value', () => {
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '5')
    renderHook(() => useContextualNudges(false))

    expect(localStorage.getItem(STORAGE_KEY_SESSION_COUNT)).toBe('6')
  })

  // ── Visit counter (recordVisit) ─────────────────────────────────────────

  it('recordVisit increments the visit counter in localStorage', () => {
    const { result } = renderHook(() => useContextualNudges(false))

    act(() => {
      result.current.recordVisit()
    })

    expect(localStorage.getItem(STORAGE_KEY_VISIT_COUNT)).toBe('1')

    act(() => {
      result.current.recordVisit()
    })

    expect(localStorage.getItem(STORAGE_KEY_VISIT_COUNT)).toBe('2')
  })

  // ── Priority 1: Drag hint on first visit ────────────────────────────────

  it('shows drag hint on first visit', () => {
    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.showDragHint).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY_DRAG_HINT_SHOWN)).toBe('true')
  })

  it('auto-hides drag hint after 2 seconds', () => {
    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.showDragHint).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(result.current.showDragHint).toBe(false)
  })

  it('does not show drag hint on subsequent visits', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.showDragHint).toBe(false)
  })

  // ── Priority 2: Customize nudge ─────────────────────────────────────────

  it('shows customize nudge after 3+ visits without customization', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '3')

    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.activeNudge).toBe('customize')
    expect(mockEmitNudgeShown).toHaveBeenCalledWith('customize')
  })

  it('does not show customize nudge if user has customized dashboard', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(true))

    expect(result.current.activeNudge).not.toBe('customize')
  })

  it('does not show customize nudge if already dismissed', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')
    localStorage.setItem(STORAGE_KEY_NUDGE_DISMISSED, JSON.stringify(['customize']))

    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.activeNudge).not.toBe('customize')
  })

  // ── Priority 3: PWA install nudge ───────────────────────────────────────

  it('shows pwa-install nudge after 3+ sessions when customize is not applicable', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '3')
    // Customize nudge won't show: user has customized
    const { result } = renderHook(() => useContextualNudges(true))

    expect(result.current.activeNudge).toBe('pwa-install')
    expect(mockEmitNudgeShown).toHaveBeenCalledWith('pwa-install')
  })

  it('does not show pwa-install when already running as standalone PWA', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '5')
    mockMatchMedia.mockReturnValue({ matches: true })

    const { result } = renderHook(() => useContextualNudges(true))

    expect(result.current.activeNudge).not.toBe('pwa-install')
  })

  // ── Priority ordering ───────────────────────────────────────────────────

  it('drag-hint takes priority over customize nudge', () => {
    // First visit, enough visits to qualify for customize
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(false))

    // Drag hint fires, not customize
    expect(result.current.showDragHint).toBe(true)
    expect(result.current.activeNudge).toBeNull()
  })

  it('customize nudge takes priority over pwa-install', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.activeNudge).toBe('customize')
  })

  // ── Dismiss nudge ───────────────────────────────────────────────────────

  it('dismissNudge clears activeNudge and persists to localStorage', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(false))
    expect(result.current.activeNudge).toBe('customize')

    act(() => {
      result.current.dismissNudge()
    })

    expect(result.current.activeNudge).toBeNull()
    expect(mockEmitNudgeDismissed).toHaveBeenCalledWith('customize')

    const dismissed = JSON.parse(
      localStorage.getItem(STORAGE_KEY_NUDGE_DISMISSED) || '[]',
    )
    expect(dismissed).toContain('customize')
  })

  it('dismissing pwa-install also sets PWA_PROMPT_DISMISSED flag', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(true))
    expect(result.current.activeNudge).toBe('pwa-install')

    act(() => {
      result.current.dismissNudge()
    })

    expect(localStorage.getItem(STORAGE_KEY_PWA_PROMPT_DISMISSED)).toBe('true')
  })

  // ── Action nudge ────────────────────────────────────────────────────────

  it('actionNudge emits analytics and clears activeNudge', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '5')

    const { result } = renderHook(() => useContextualNudges(false))
    expect(result.current.activeNudge).toBe('customize')

    act(() => {
      result.current.actionNudge()
    })

    expect(result.current.activeNudge).toBeNull()
    expect(mockEmitNudgeActioned).toHaveBeenCalledWith('customize')
  })

  // ── Hints suppressed (master kill switch) ───────────────────────────────

  it('shows no nudge when hints are suppressed', () => {
    localStorage.setItem(STORAGE_KEY_HINTS_SUPPRESSED, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '10')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '10')

    const { result } = renderHook(() => useContextualNudges(false))

    expect(result.current.activeNudge).toBeNull()
    expect(result.current.showDragHint).toBe(false)
  })

  // ── No nudge when nothing qualifies ─────────────────────────────────────

  it('returns null activeNudge when no conditions are met', () => {
    localStorage.setItem(STORAGE_KEY_DRAG_HINT_SHOWN, 'true')
    localStorage.setItem(STORAGE_KEY_VISIT_COUNT, '1')
    localStorage.setItem(STORAGE_KEY_SESSION_COUNT, '1')

    const { result } = renderHook(() => useContextualNudges(true))

    expect(result.current.activeNudge).toBeNull()
  })
})
