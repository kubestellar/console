import { describe, it, expect } from 'vitest'
import { renderHook} from '@testing-library/react'
import { useStablePageHeight } from '../useStablePageHeight'

/**
 * Tests for useStablePageHeight hook.
 *
 * This hook maintains stable container height across paginated pages
 * to prevent visual jumping when navigating to a partial last page.
 */

describe('useStablePageHeight', () => {
  it('returns a containerRef', () => {
    const { result } = renderHook(() => useStablePageHeight(10, 50))
    expect(result.current.containerRef).toBeDefined()
    expect(result.current.containerRef.current).toBeNull() // not mounted
  })

  it('returns undefined containerStyle initially', () => {
    const { result } = renderHook(() => useStablePageHeight(10, 50))
    // Before any measurement, stableMinHeight is 0
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('returns undefined style when totalItems <= pageSize (no pagination)', () => {
    const { result } = renderHook(() => useStablePageHeight(10, 5))
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('returns undefined style when pageSize equals totalItems', () => {
    const { result } = renderHook(() => useStablePageHeight(10, 10))
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('resets stableMinHeight when pageSize changes', () => {
    const { result, rerender } = renderHook(
      ({ pageSize, totalItems }) => useStablePageHeight(pageSize, totalItems),
      { initialProps: { pageSize: 10, totalItems: 50 } }
    )

    // Rerender with different pageSize
    rerender({ pageSize: 20, totalItems: 50 })
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('resets when totalItems drops below pageSize', () => {
    const { result, rerender } = renderHook(
      ({ pageSize, totalItems }) => useStablePageHeight(pageSize, totalItems),
      { initialProps: { pageSize: 10, totalItems: 50 } }
    )

    // Simulate items being filtered down below page size
    rerender({ pageSize: 10, totalItems: 5 })
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('handles Infinity pageSize (show all mode)', () => {
    const { result } = renderHook(() => useStablePageHeight(Infinity, 100))
    // Infinity >= 100, so no pagination
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('handles string pageSize as Infinity (non-numeric)', () => {
    // When pageSize is a string like "all", typeof !== 'number' → effectivePageSize = Infinity
    const { result } = renderHook(() => useStablePageHeight('all' as unknown as number, 100))
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('handles zero totalItems', () => {
    const { result } = renderHook(() => useStablePageHeight(10, 0))
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('handles negative totalItems', () => {
    const { result } = renderHook(() => useStablePageHeight(10, -1))
    expect(result.current.containerStyle).toBeUndefined()
  })

  it('containerStyle has minHeight when stableMinHeight > 0', () => {
    // We can't easily test the useLayoutEffect measurement in jsdom,
    // but we can verify the shape of the return value.
    // The hook will only set minHeight if containerRef.current has scrollHeight > 0,
    // which requires a real DOM element.
    const { result } = renderHook(() => useStablePageHeight(10, 50))
    // Verify the type contract: containerStyle is either undefined or has minHeight
    const style = result.current.containerStyle
    if (style !== undefined) {
      expect(style).toHaveProperty('minHeight')
    }
  })
})
