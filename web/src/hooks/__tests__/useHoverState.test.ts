import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useHoverState } from '../useHoverState'

describe('useHoverState', () => {
  it('returns isHovered as false initially', () => {
    const { result } = renderHook(() => useHoverState())
    expect(result.current.isHovered).toBe(false)
  })

  it('returns hoverProps with onMouseEnter and onMouseLeave', () => {
    const { result } = renderHook(() => useHoverState())
    expect(typeof result.current.hoverProps.onMouseEnter).toBe('function')
    expect(typeof result.current.hoverProps.onMouseLeave).toBe('function')
  })

  it('sets isHovered to true on onMouseEnter', () => {
    const { result } = renderHook(() => useHoverState())
    act(() => {
      result.current.hoverProps.onMouseEnter()
    })
    expect(result.current.isHovered).toBe(true)
  })

  it('sets isHovered to false on onMouseLeave', () => {
    const { result } = renderHook(() => useHoverState())
    act(() => {
      result.current.hoverProps.onMouseEnter()
    })
    expect(result.current.isHovered).toBe(true)

    act(() => {
      result.current.hoverProps.onMouseLeave()
    })
    expect(result.current.isHovered).toBe(false)
  })

  it('handles multiple enter/leave cycles', () => {
    const { result } = renderHook(() => useHoverState())

    for (let i = 0; i < 5; i++) {
      act(() => { result.current.hoverProps.onMouseEnter() })
      expect(result.current.isHovered).toBe(true)
      act(() => { result.current.hoverProps.onMouseLeave() })
      expect(result.current.isHovered).toBe(false)
    }
  })

  it('calling onMouseEnter twice keeps isHovered true', () => {
    const { result } = renderHook(() => useHoverState())
    act(() => { result.current.hoverProps.onMouseEnter() })
    act(() => { result.current.hoverProps.onMouseEnter() })
    expect(result.current.isHovered).toBe(true)
  })

  it('calling onMouseLeave when already false stays false', () => {
    const { result } = renderHook(() => useHoverState())
    act(() => { result.current.hoverProps.onMouseLeave() })
    expect(result.current.isHovered).toBe(false)
  })

  it('hoverProps object is spreadable (has correct keys)', () => {
    const { result } = renderHook(() => useHoverState())
    const keys = Object.keys(result.current.hoverProps)
    expect(keys).toContain('onMouseEnter')
    expect(keys).toContain('onMouseLeave')
    expect(keys).toHaveLength(2)
  })

  it('resets hover state after unmount and remount', () => {
    const { result, unmount } = renderHook(() => useHoverState())
    act(() => { result.current.hoverProps.onMouseEnter() })
    expect(result.current.isHovered).toBe(true)
    unmount()

    const { result: result2 } = renderHook(() => useHoverState())
    expect(result2.current.isHovered).toBe(false)
  })

  it('each hook instance has independent state', () => {
    const { result: result1 } = renderHook(() => useHoverState())
    const { result: result2 } = renderHook(() => useHoverState())

    act(() => { result1.current.hoverProps.onMouseEnter() })
    expect(result1.current.isHovered).toBe(true)
    expect(result2.current.isHovered).toBe(false)
  })

  it('returns a stable hoverProps shape across re-renders', () => {
    const { result, rerender } = renderHook(() => useHoverState())
    const _firstProps = result.current.hoverProps
    rerender()
    // Functions should still exist after rerender
    expect(typeof result.current.hoverProps.onMouseEnter).toBe('function')
    expect(typeof result.current.hoverProps.onMouseLeave).toBe('function')
    // isHovered unchanged
    expect(result.current.isHovered).toBe(false)
  })

  it('onMouseLeave after enter transitions correctly', () => {
    const { result } = renderHook(() => useHoverState())
    expect(result.current.isHovered).toBe(false)

    act(() => { result.current.hoverProps.onMouseEnter() })
    expect(result.current.isHovered).toBe(true)

    act(() => { result.current.hoverProps.onMouseLeave() })
    expect(result.current.isHovered).toBe(false)

    // Ensure no lingering state
    act(() => { result.current.hoverProps.onMouseLeave() })
    expect(result.current.isHovered).toBe(false)
  })
})
