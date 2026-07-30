import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStatHistory, MIN_SPARKLINE_POINTS } from '../useStatHistory'

describe('useStatHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns getHistory function', () => {
    const getStatValue = vi.fn(() => ({ value: 42 }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], false)
    )
    expect(typeof result.current.getHistory).toBe('function')
  })

  it('returns empty array for unknown block', () => {
    const getStatValue = vi.fn(() => ({ value: 0 }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], false)
    )
    expect(result.current.getHistory('unknown-block')).toEqual([])
  })

  it('records initial sample immediately when not loading', () => {
    const getStatValue = vi.fn(() => ({ value: 42 }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], false)
    )
    const history = result.current.getHistory('block1')
    expect(history).toHaveLength(1)
    expect(history[0]).toBe(42)
  })

  it('does not record when loading', () => {
    const getStatValue = vi.fn(() => ({ value: 42 }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], true)
    )
    expect(result.current.getHistory('block1')).toEqual([])
  })

  it('skips NaN values', () => {
    const getStatValue = vi.fn(() => ({ value: 'not-a-number' }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], false)
    )
    expect(result.current.getHistory('block1')).toEqual([])
  })

  it('parses string numeric values', () => {
    const getStatValue = vi.fn(() => ({ value: '123.45' }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, ['block1'], false)
    )
    const history = result.current.getHistory('block1')
    expect(history[0]).toBeCloseTo(123.45)
  })

  it('exports MIN_SPARKLINE_POINTS constant', () => {
    expect(MIN_SPARKLINE_POINTS).toBe(3)
  })

  it('handles empty visibleBlockIds', () => {
    const getStatValue = vi.fn(() => ({ value: 42 }))
    const { result } = renderHook(() =>
      useStatHistory('main', getStatValue, [], false)
    )
    expect(result.current.getHistory('block1')).toEqual([])
  })
})
