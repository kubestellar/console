/**
 * Tests for useLocalClusterFilter — the shared dropdown-state hook used by
 * cards that render CardClusterFilter without going through useCardFilters.
 */
import { describe, it, expect, vi } from 'vitest'
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
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    try {
      const { unmount } = renderHook(() => useLocalClusterFilter())

      const added = addSpy.mock.calls.filter(([type]) => type === 'mousedown')
      expect(added).toHaveLength(1)
      const handler = added[0][1]
      expect(removeSpy.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(0)

      unmount()

      // The exact handler that was registered must be the one detached.
      const removed = removeSpy.mock.calls.filter(([type]) => type === 'mousedown')
      expect(removed).toHaveLength(1)
      expect(removed[0][1]).toBe(handler)
    } finally {
      addSpy.mockRestore()
      removeSpy.mockRestore()
    }
  })
})
