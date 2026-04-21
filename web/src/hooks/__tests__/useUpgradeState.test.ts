import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUpgradeState } from '../useUpgradeState'
import { setUpgradeState, getUpgradeState } from '../../lib/upgradeState'

afterEach(() => {
  // Reset singleton to idle after each test
  setUpgradeState({ phase: 'idle' })
})

describe('useUpgradeState', () => {
  it('returns idle state initially', () => {
    const { result } = renderHook(() => useUpgradeState())
    expect(result.current.phase).toBe('idle')
  })

  it('reflects state changes from setUpgradeState', () => {
    const { result } = renderHook(() => useUpgradeState())
    act(() => {
      setUpgradeState({ phase: 'triggering' })
    })
    expect(result.current.phase).toBe('triggering')
  })

  it('reflects restarting phase', () => {
    const { result } = renderHook(() => useUpgradeState())
    act(() => {
      setUpgradeState({ phase: 'restarting' })
    })
    expect(result.current.phase).toBe('restarting')
  })

  it('reflects complete phase', () => {
    const { result } = renderHook(() => useUpgradeState())
    act(() => {
      setUpgradeState({ phase: 'complete' })
    })
    expect(result.current.phase).toBe('complete')
  })

  it('reflects error phase with message', () => {
    const { result } = renderHook(() => useUpgradeState())
    act(() => {
      setUpgradeState({ phase: 'error', errorMessage: 'something went wrong' })
    })
    expect(result.current.phase).toBe('error')
    expect(result.current.errorMessage).toBe('something went wrong')
  })

  it('multiple hook instances all receive the same update', () => {
    const { result: r1 } = renderHook(() => useUpgradeState())
    const { result: r2 } = renderHook(() => useUpgradeState())
    act(() => {
      setUpgradeState({ phase: 'complete' })
    })
    expect(r1.current.phase).toBe('complete')
    expect(r2.current.phase).toBe('complete')
  })

  it('getUpgradeState returns current state synchronously', () => {
    act(() => {
      setUpgradeState({ phase: 'triggering' })
    })
    expect(getUpgradeState().phase).toBe('triggering')
  })
})
