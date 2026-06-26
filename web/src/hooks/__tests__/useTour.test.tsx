import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../lib/analytics', () => ({
  emitEvent: vi.fn(),
  emitTourStarted: vi.fn(),
  emitTourCompleted: vi.fn(),
  emitTourSkipped: vi.fn(),
}))

const mockIsMobile = vi.fn(() => false)
vi.mock('../useMobile', () => ({
  useMobile: () => ({ isMobile: mockIsMobile() }),
}))

vi.mock('../../lib/settingsSync', () => ({
  SETTINGS_CHANGED_EVENT: 'kubestellar-settings-changed',
  SETTINGS_RESTORED_EVENT: 'kubestellar-settings-restored',
}))

vi.mock('../../lib/constants/storage', () => ({
  STORAGE_KEY_TOUR_COMPLETED: 'kubestellar-console-tour-completed',
}))

import { useTour, TourProvider } from '../useTour'
import { emitTourStarted, emitTourCompleted, emitTourSkipped } from '../../lib/analytics'

// ============================================================================
// Helpers
// ============================================================================

const STORAGE_KEY = 'kubestellar-console-tour-completed'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(TourProvider, null, children)
}

// ============================================================================
// Tests
// ============================================================================

describe('useTour', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mockIsMobile.mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------- Fallback (outside provider) ----------

  it('returns safe fallback when called outside TourProvider', () => {
    const { result } = renderHook(() => useTour())
    expect(result.current.isActive).toBe(false)
    expect(result.current.currentStep).toBeNull()
    expect(result.current.currentStepIndex).toBe(0)
    expect(result.current.totalSteps).toBe(0)
    expect(result.current.hasCompletedTour).toBe(true)
    expect(typeof result.current.startTour).toBe('function')
    expect(typeof result.current.nextStep).toBe('function')
    expect(typeof result.current.prevStep).toBe('function')
    expect(typeof result.current.skipTour).toBe('function')
    expect(typeof result.current.resetTour).toBe('function')
    expect(typeof result.current.goToStep).toBe('function')
  })

  it('fallback functions are no-ops that do not throw', () => {
    const { result } = renderHook(() => useTour())
    expect(() => {
      result.current.startTour()
      result.current.nextStep()
      result.current.prevStep()
      result.current.skipTour()
      result.current.resetTour()
      result.current.goToStep('welcome')
    }).not.toThrow()
  })

  // ---------- Shape & Defaults (inside provider) ----------

  it('returns full context shape inside TourProvider', () => {
    const { result } = renderHook(() => useTour(), { wrapper })
    expect(result.current).toHaveProperty('isActive')
    expect(result.current).toHaveProperty('currentStep')
    expect(result.current).toHaveProperty('currentStepIndex')
    expect(result.current).toHaveProperty('totalSteps')
    expect(result.current).toHaveProperty('hasCompletedTour')
    expect(result.current.totalSteps).toBeGreaterThan(0)
  })

  it('starts inactive by default', () => {
    const { result } = renderHook(() => useTour(), { wrapper })
    expect(result.current.isActive).toBe(false)
    expect(result.current.currentStep).toBeNull()
  })

  // ---------- Tour Lifecycle: Start ----------

  it('startTour activates the tour at step 0 and emits analytics', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })

    expect(result.current.isActive).toBe(true)
    expect(result.current.currentStepIndex).toBe(0)
    expect(result.current.currentStep).not.toBeNull()
    expect(result.current.currentStep?.id).toBe('welcome')
    expect(emitTourStarted).toHaveBeenCalledTimes(1)
  })

  it('startTour does nothing on mobile', () => {
    mockIsMobile.mockReturnValue(true)
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })

    expect(result.current.isActive).toBe(false)
    expect(emitTourStarted).not.toHaveBeenCalled()
  })

  // ---------- Tour Lifecycle: Navigation ----------

  it('nextStep advances to the next step', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.nextStep() })

    expect(result.current.currentStepIndex).toBe(1)
    expect(result.current.currentStep?.id).toBe('sidebar')
  })

  it('prevStep goes back to the previous step', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.nextStep() })
    act(() => { result.current.prevStep() })

    expect(result.current.currentStepIndex).toBe(0)
  })

  it('prevStep does nothing at step 0', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.prevStep() })

    expect(result.current.currentStepIndex).toBe(0)
  })

  it('goToStep navigates to a specific step by ID', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.goToStep('search') })

    expect(result.current.currentStep?.id).toBe('search')
  })

  it('goToStep ignores unknown step IDs', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.goToStep('nonexistent') })

    expect(result.current.currentStepIndex).toBe(0)
  })

  // ---------- Tour Lifecycle: Completion ----------

  it('nextStep on last step completes the tour', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })

    // Navigate through all steps
    const totalSteps = result.current.totalSteps
    for (let i = 0; i < totalSteps; i++) {
      act(() => { result.current.nextStep() })
    }

    expect(result.current.isActive).toBe(false)
    expect(result.current.hasCompletedTour).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(emitTourCompleted).toHaveBeenCalledWith(totalSteps)
  })

  // ---------- Tour Lifecycle: Skip ----------

  it('skipTour stops the tour and marks as completed', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.nextStep() }) // go to step 1
    act(() => { result.current.skipTour() })

    expect(result.current.isActive).toBe(false)
    expect(result.current.hasCompletedTour).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(emitTourSkipped).toHaveBeenCalledWith(1) // skipped at step index 1
  })

  // ---------- Tour Lifecycle: Reset ----------

  it('resetTour removes localStorage and sets hasCompletedTour to false', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.resetTour() })

    expect(result.current.hasCompletedTour).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  // ---------- Persistence ----------

  it('reads hasCompletedTour from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    const { result } = renderHook(() => useTour(), { wrapper })
    expect(result.current.hasCompletedTour).toBe(true)
  })

  it('hasCompletedTour is false when localStorage has no key', () => {
    const { result } = renderHook(() => useTour(), { wrapper })
    expect(result.current.hasCompletedTour).toBe(false)
  })

  it('responds to SETTINGS_RESTORED_EVENT by re-reading localStorage', () => {
    const { result } = renderHook(() => useTour(), { wrapper })
    expect(result.current.hasCompletedTour).toBe(false)

    // Simulate external settings restore
    localStorage.setItem(STORAGE_KEY, 'true')
    act(() => {
      window.dispatchEvent(new Event('kubestellar-settings-restored'))
    })

    expect(result.current.hasCompletedTour).toBe(true)
  })

  // ---------- Mobile Guard ----------

  it('auto-deactivates tour when device becomes mobile', () => {
    const { result, rerender } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    expect(result.current.isActive).toBe(true)

    // Simulate becoming mobile
    mockIsMobile.mockReturnValue(true)
    rerender()

    expect(result.current.isActive).toBe(false)
  })

  // ---------- Tour Step Data ----------

  it('tour steps have valid structure', () => {
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })

    const step = result.current.currentStep
    expect(step).toHaveProperty('id')
    expect(step).toHaveProperty('target')
    expect(step).toHaveProperty('title')
    expect(step).toHaveProperty('content')
    expect(typeof step?.target).toBe('string')
    expect(step?.target.startsWith('[data-tour=')).toBe(true)
  })

  // ---------- SETTINGS_CHANGED_EVENT ----------

  it('dispatches SETTINGS_CHANGED_EVENT when tour is completed', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { result } = renderHook(() => useTour(), { wrapper })

    act(() => { result.current.startTour() })
    act(() => { result.current.skipTour() })

    const settingsEvent = dispatchSpy.mock.calls.find(
      call => (call[0] as Event).type === 'kubestellar-settings-changed'
    )
    expect(settingsEvent).toBeDefined()

    dispatchSpy.mockRestore()
  })

  // ---------- Cleanup ----------

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useTour(), { wrapper })

    unmount()

    const removed = removeSpy.mock.calls.some(
      call => call[0] === 'kubestellar-settings-restored'
    )
    expect(removed).toBe(true)

    removeSpy.mockRestore()
  })
})
