import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../lib/accessibility', () => ({
  loadAccessibilitySettings: vi.fn(() => ({
    colorBlindMode: false,
    reduceMotion: false,
    highContrast: false,
  })),
  saveAccessibilitySettings: vi.fn(),
}))

import { useAccessibility } from '../useAccessibility'
import { loadAccessibilitySettings, saveAccessibilitySettings } from '../../lib/accessibility'

describe('useAccessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.classList.remove('color-blind-mode', 'reduce-motion', 'high-contrast')
  })

  it('returns default settings on initial render', () => {
    const { result } = renderHook(() => useAccessibility())
    expect(result.current.colorBlindMode).toBe(false)
    expect(result.current.reduceMotion).toBe(false)
    expect(result.current.highContrast).toBe(false)
  })

  it('loads settings from accessibility lib on mount', () => {
    renderHook(() => useAccessibility())
    expect(loadAccessibilitySettings).toHaveBeenCalled()
  })

  it('setColorBlindMode toggles color blind mode and saves', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => { result.current.setColorBlindMode(true) })
    expect(result.current.colorBlindMode).toBe(true)
    expect(saveAccessibilitySettings).toHaveBeenCalledWith(
      expect.objectContaining({ colorBlindMode: true })
    )
  })

  it('setReduceMotion toggles reduce motion and saves', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => { result.current.setReduceMotion(true) })
    expect(result.current.reduceMotion).toBe(true)
    expect(saveAccessibilitySettings).toHaveBeenCalledWith(
      expect.objectContaining({ reduceMotion: true })
    )
  })

  it('setHighContrast toggles high contrast and saves', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => { result.current.setHighContrast(true) })
    expect(result.current.highContrast).toBe(true)
    expect(saveAccessibilitySettings).toHaveBeenCalledWith(
      expect.objectContaining({ highContrast: true })
    )
  })

  it('updateSettings applies partial updates and saves', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => {
      result.current.updateSettings({ colorBlindMode: true, highContrast: true })
    })
    expect(result.current.colorBlindMode).toBe(true)
    expect(result.current.highContrast).toBe(true)
    expect(result.current.reduceMotion).toBe(false)
  })

  it('applies CSS classes to document root based on settings', () => {
    const { result } = renderHook(() => useAccessibility())
    act(() => { result.current.setColorBlindMode(true) })
    expect(document.documentElement.classList.contains('color-blind-mode')).toBe(true)

    act(() => { result.current.setColorBlindMode(false) })
    expect(document.documentElement.classList.contains('color-blind-mode')).toBe(false)
  })

  it('listens for storage events to sync across tabs', () => {
    renderHook(() => useAccessibility())
    const event = new StorageEvent('storage', { key: 'accessibility-settings' })
    window.dispatchEvent(event)
    expect(loadAccessibilitySettings).toHaveBeenCalledTimes(2) // initial + storage event
  })
})
