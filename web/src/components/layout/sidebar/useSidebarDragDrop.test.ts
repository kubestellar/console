import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSidebarDragDrop } from './useSidebarDragDrop'
import type { SidebarItem } from '../../../hooks/useSidebarConfig'

// Minimal DragEvent stub used across tests
function makeDragEvent(overrides: Partial<React.DragEvent> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
    target: document.createElement('div'),
    ...overrides,
  } as unknown as React.DragEvent
}

function makeItem(id: string, order: number): SidebarItem {
  return { id, name: id, icon: 'icon', href: `/${id}`, type: 'link', order }
}

const PRIMARY: SidebarItem[] = [makeItem('a', 0), makeItem('b', 1), makeItem('c', 2)]
const SECONDARY: SidebarItem[] = [makeItem('x', 0), makeItem('y', 1)]

function setup(reorderItems = vi.fn()) {
  const utils = renderHook(() =>
    useSidebarDragDrop({ primaryNav: PRIMARY, secondaryNav: SECONDARY, reorderItems }),
  )
  return { ...utils, reorderItems }
}

describe('useSidebarDragDrop', () => {
  it('starts with all drag state null', () => {
    const { result } = setup()
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })

  it('handleDragStart sets draggedItem and dragSection and marks the target transparent', () => {
    const { result } = setup()
    const target = document.createElement('div')
    act(() => {
      result.current.handleDragStart(makeDragEvent({ target }), 'a', 'primary')
    })
    expect(result.current.draggedItem).toBe('a')
    expect(result.current.dragSection).toBe('primary')
  })

  it('handleDragEnd clears all drag state and restores opacity', () => {
    const { result } = setup()
    const target = document.createElement('div')
    act(() => {
      result.current.handleDragStart(makeDragEvent({ target }), 'a', 'primary')
    })
    act(() => {
      result.current.handleDragEnd(makeDragEvent({ target }))
    })
    expect(target.style.opacity).toBe('1')
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })

  it('handleDragEnter sets dragOverItem when not dragging onto itself', () => {
    const { result } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'b') })
    expect(result.current.dragOverItem).toBe('b')
  })

  it('handleDragEnter does not set dragOverItem when dragging onto itself', () => {
    const { result } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'a') })
    expect(result.current.dragOverItem).toBeNull()
  })

  it('handleDragLeave clears dragOverItem only once the nested-enter counter returns to zero', () => {
    const { result } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'b') })
    act(() => { result.current.handleDragEnter(makeDragEvent(), 'b') }) // nested child enter, counter -> 2
    act(() => { result.current.handleDragLeave() }) // counter -> 1, still over
    expect(result.current.dragOverItem).toBe('b')
    act(() => { result.current.handleDragLeave() }) // counter -> 0, cleared
    expect(result.current.dragOverItem).toBeNull()
  })

  it('handleDragOver prevents default and sets the move drop effect', () => {
    const { result } = setup()
    const e = makeDragEvent()
    act(() => { result.current.handleDragOver(e) })
    expect(e.preventDefault).toHaveBeenCalledOnce()
    expect(e.dataTransfer.dropEffect).toBe('move')
  })

  it('handleDrop reorders items within the same section and reports the new order', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'c', 'primary') })

    expect(reorderItems).toHaveBeenCalledOnce()
    const [items, section] = reorderItems.mock.calls[0]
    expect(section).toBe('primary')
    expect(items.map((i: SidebarItem) => i.id)).toEqual(['b', 'c', 'a'])
    expect(items.map((i: SidebarItem) => i.order)).toEqual([0, 1, 2])
  })

  it('handleDrop reorders the secondary section independently', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'x', 'secondary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'y', 'secondary') })

    expect(reorderItems).toHaveBeenCalledOnce()
    const [items, section] = reorderItems.mock.calls[0]
    expect(section).toBe('secondary')
    expect(items.map((i: SidebarItem) => i.id)).toEqual(['y', 'x'])
  })

  it('handleDrop is a no-op and clears state when there is no dragged item', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDrop(makeDragEvent(), 'a', 'primary') })
    expect(reorderItems).not.toHaveBeenCalled()
    expect(result.current.draggedItem).toBeNull()
  })

  it('handleDrop is a no-op when dropping onto the same item', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'a', 'primary') })
    expect(reorderItems).not.toHaveBeenCalled()
  })

  it('handleDrop is a no-op when the drop section differs from the drag section', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'x', 'secondary') })
    expect(reorderItems).not.toHaveBeenCalled()
  })

  it('handleDrop is a no-op when the target id is not found in the section', () => {
    const { result, reorderItems } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'does-not-exist', 'primary') })
    expect(reorderItems).not.toHaveBeenCalled()
  })

  it('handleDrop clears drag state after a successful reorder', () => {
    const { result } = setup()
    act(() => { result.current.handleDragStart(makeDragEvent(), 'a', 'primary') })
    act(() => { result.current.handleDrop(makeDragEvent(), 'b', 'primary') })
    expect(result.current.draggedItem).toBeNull()
    expect(result.current.dragOverItem).toBeNull()
    expect(result.current.dragSection).toBeNull()
  })
})
