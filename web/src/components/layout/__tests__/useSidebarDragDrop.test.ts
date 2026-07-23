import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarDragDrop } from '../useSidebarDragDrop'
import type { SidebarDragDropItem } from '../useSidebarDragDrop'

// Minimal DragEvent stub used across tests
function makeDragEvent(overrides: Partial<React.DragEvent> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
    target: document.createElement('div'),
    ...overrides,
  } as unknown as React.DragEvent
}

const ITEMS: SidebarDragDropItem[] = [
  { id: 'a' },
  { id: 'b' },
  { id: 'c' },
]

describe('useSidebarDragDrop', () => {
  it('starts with all drag state null', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })

  it('handleDragStart sets draggedItem and dragSection', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    act(() => {
      result.current.handleDragStart(makeDragEvent(), 'a', 'primary')
    })
    expect(result.current.draggedItem).toBe('a')
    expect(result.current.dragSection).toBe('primary')
  })

  it('handleDragEnd clears all drag state', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    act(() => {
      result.current.handleDragStart(makeDragEvent(), 'a', 'primary')
    })
    act(() => {
      result.current.handleDragEnd(makeDragEvent())
    })
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })

  it('handleDragEnter sets dragOverItem when not dragging onto itself', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'b') })
    expect(result.current.dragOverItem).toBe('b')
  })

  it('handleDragEnter does not set dragOverItem when dragging onto itself', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'a') })
    expect(result.current.dragOverItem).toBeNull()
  })

  it('handleDrop reorders items correctly', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    const onReorder = vi.fn()

    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => {
      result.current.handleDrop(
        makeDragEvent(),
        'c',
        'primary',
        () => ITEMS,
        onReorder,
      )
    })

    expect(onReorder).toHaveBeenCalledOnce()
    const [reorderedItems, section] = onReorder.mock.calls[0]
    expect(section).toBe('primary')
    expect(reorderedItems.map((i: SidebarDragDropItem) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('handleDrop is a no-op when dragging to same item', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    const onReorder = vi.fn()

    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => {
      result.current.handleDrop(makeDragEvent(), 'a', 'primary', () => ITEMS, onReorder)
    })

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('handleDrop is a no-op when sections differ', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    const onReorder = vi.fn()

    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => {
      result.current.handleDrop(makeDragEvent(), 'b', 'secondary', () => ITEMS, onReorder)
    })

    expect(onReorder).not.toHaveBeenCalled()
  })

  it('handleDrop clears drag state after successful reorder', () => {
    const { result } = renderHook(() => useSidebarDragDrop())
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => {
      result.current.handleDrop(makeDragEvent(), 'b', 'primary', () => ITEMS, vi.fn())
    })
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })
})
