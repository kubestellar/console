import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useUnifiedDemoContext,
  useIsDemoMode,
  useIsModeSwitching,
  useModeVersion,
} from '../UnifiedDemoContext'

/**
 * Tests for UnifiedDemoContext default values.
 *
 * When no UnifiedDemoProvider is mounted, the context returns safe defaults.
 */

describe('useUnifiedDemoContext (without provider)', () => {
  it('returns default context value', () => {
    const { result } = renderHook(() => useUnifiedDemoContext())
    expect(result.current.isDemoMode).toBe(false)
    expect(result.current.isForced).toBe(false)
    expect(result.current.isModeSwitching).toBe(false)
    expect(result.current.modeVersion).toBe(0)
  })

  it('provides toggleDemoMode that warns', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { result } = renderHook(() => useUnifiedDemoContext())
    result.current.toggleDemoMode()
    expect(spy).toHaveBeenCalledWith('UnifiedDemoProvider not mounted')
    spy.mockRestore()
  })

  it('provides setDemoMode that warns', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { result } = renderHook(() => useUnifiedDemoContext())
    result.current.setDemoMode(true)
    expect(spy).toHaveBeenCalledWith('UnifiedDemoProvider not mounted')
    spy.mockRestore()
  })

  it('provides getDemoData that returns loading state', () => {
    const { result } = renderHook(() => useUnifiedDemoContext())
    const demoData = result.current.getDemoData('any-id')
    expect(demoData.isLoading).toBe(true)
    expect(demoData.isDemoData).toBe(true)
    expect(demoData.data).toBeUndefined()
  })

  it('provides registerGenerator that warns', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { result } = renderHook(() => useUnifiedDemoContext())
    result.current.registerGenerator('test', { generate: () => [] })
    expect(spy).toHaveBeenCalledWith('UnifiedDemoProvider not mounted')
    spy.mockRestore()
  })

  it('provides regenerate that warns', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { result } = renderHook(() => useUnifiedDemoContext())
    result.current.regenerate('test')
    expect(spy).toHaveBeenCalledWith('UnifiedDemoProvider not mounted')
    spy.mockRestore()
  })

  it('provides regenerateAll that warns', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { result } = renderHook(() => useUnifiedDemoContext())
    result.current.regenerateAll()
    expect(spy).toHaveBeenCalledWith('UnifiedDemoProvider not mounted')
    spy.mockRestore()
  })
})

describe('useIsDemoMode', () => {
  it('returns false when no provider is mounted', () => {
    const { result } = renderHook(() => useIsDemoMode())
    expect(result.current).toBe(false)
  })
})

describe('useIsModeSwitching', () => {
  it('returns false when no provider is mounted', () => {
    const { result } = renderHook(() => useIsModeSwitching())
    expect(result.current).toBe(false)
  })
})

describe('useModeVersion', () => {
  it('returns 0 when no provider is mounted', () => {
    const { result } = renderHook(() => useModeVersion())
    expect(result.current).toBe(0)
  })
})
