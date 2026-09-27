/**
 * Tests for useLocalClusterFilter — the shared dropdown-state hook used by
 * cards that render CardClusterFilter without going through useCardFilters.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLocalClusterFilter } from '../cardFilters'

describe('useLocalClusterFilter', () => {
  it('starts with an empty selection and a closed dropdown', () => {
    const { result } = renderHook(() => useLocalClusterFilter())
    expect(result.current.localClusterFilter).toEqual([])
    expect(result.current.showClusterFilter).toBe(false)
    expect(result.current.clusterFilterRef.current).toBeNull()
  })

  it('toggles clusters in and out of the selection', () => {
    const { result } = renderHook(() => useLocalClusterFilter())
    act(() => result.current.toggleClusterFilter('alpha'))
    act(() => result.current.toggleClusterFilter('beta'))
    expect(result.current.localClusterFilter).toEqual(['alpha', 'beta'])
    act(() => result.current.toggleClusterFilter('alpha'))
    expect(result.current.localClusterFilter).toEqual(['beta'])
  })

  it('clears the selection and replaces it via the setter', () => {
    const { result } = renderHook(() => useLocalClusterFilter())
    act(() => result.current.setLocalClusterFilter(['a', 'b']))
    expect(result.current.localClusterFilter).toEqual(['a', 'b'])
    act(() => result.current.clearClusterFilter())
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('closes the dropdown on mousedown outside the container but not inside', () => {
    const container = document.createElement('div')
    const inside = document.createElement('button')
    container.appendChild(inside)
    const outside = document.createElement('div')
    document.body.append(container, outside)

    const { result } = renderHook(() => useLocalClusterFilter())
    act(() => {
      ;(result.current.clusterFilterRef as { current: HTMLDivElement | null }).current = container
      result.current.setShowClusterFilter(true)
    })
    expect(result.current.showClusterFilter).toBe(true)

    act(() => {
      inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(result.current.showClusterFilter).toBe(true)

    act(() => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(result.current.showClusterFilter).toBe(false)

    container.remove()
    outside.remove()
  })

  it('removes the document listener on unmount', () => {
    const { result, unmount } = renderHook(() => useLocalClusterFilter())
    act(() => result.current.setShowClusterFilter(true))
    unmount()
    // No throw / no stale update when a mousedown fires after unmount
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })
})
