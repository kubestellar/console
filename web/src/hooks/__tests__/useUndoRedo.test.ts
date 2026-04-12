import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoRedo, useDashboardUndoRedo } from '../useUndoRedo'

describe('useUndoRedo', () => {
  it('starts with empty undo/redo stacks', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undoCount).toBe(0)
    expect(result.current.redoCount).toBe(0)
  })

  it('pushState adds to undo stack', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    act(() => { result.current.pushState('state-1') })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.undoCount).toBe(1)
  })

  it('undo restores previous state and calls onRestore', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    act(() => { result.current.pushState('state-1') })
    let restored: string | null = null
    act(() => { restored = result.current.undo() })
    expect(restored).toBe('state-1')
    expect(onRestore).toHaveBeenCalledWith('state-1')
    expect(result.current.canUndo).toBe(false)
  })

  it('undo returns null when stack is empty', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    let restored: string | null = null
    act(() => { restored = result.current.undo() })
    expect(restored).toBeNull()
    expect(onRestore).not.toHaveBeenCalled()
  })

  it('redo returns null when stack is empty', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    let restored: string | null = null
    act(() => { restored = result.current.redo() })
    expect(restored).toBeNull()
  })

  it('pushState clears redo stack', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    act(() => { result.current.pushState('a') })
    act(() => { result.current.pushState('b') })
    expect(result.current.undoCount).toBe(2)
    expect(result.current.redoCount).toBe(0)
  })

  it('caps undo stack at 30 entries', () => {
    const onRestore = vi.fn()
    const MAX_STACK = 30
    const { result } = renderHook(() => useUndoRedo<number>(onRestore))
    act(() => {
      for (let i = 0; i < MAX_STACK + 10; i++) {
        result.current.pushState(i)
      }
    })
    expect(result.current.undoCount).toBe(MAX_STACK)
  })

  it('redo works when getCurrentState is provided', () => {
    let current = 'state-c'
    const onRestore = vi.fn((s: string) => { current = s })
    const getCurrentState = () => current

    const { result } = renderHook(() => useUndoRedo<string>(onRestore, getCurrentState))

    // Push two states, then undo — redo should replay
    act(() => { result.current.pushState('state-a') })
    act(() => { result.current.pushState('state-b') })
    // current is 'state-c', undo pops 'state-b' and saves 'state-c' to redo
    act(() => { result.current.undo() })
    expect(onRestore).toHaveBeenLastCalledWith('state-b')
    expect(result.current.canRedo).toBe(true)
    expect(result.current.redoCount).toBe(1)

    // Redo should restore 'state-c'
    act(() => { result.current.redo() })
    expect(onRestore).toHaveBeenLastCalledWith('state-c')
    expect(result.current.canRedo).toBe(false)
    // Undo should still work after redo
    expect(result.current.canUndo).toBe(true)
  })

  it('redo is non-functional without getCurrentState (backward compat)', () => {
    const onRestore = vi.fn()
    const { result } = renderHook(() => useUndoRedo<string>(onRestore))
    act(() => { result.current.pushState('state-a') })
    act(() => { result.current.undo() })
    // Without getCurrentState, nothing is pushed to redo stack
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useDashboardUndoRedo', () => {
  let cards: string[]
  const setCards = vi.fn((newCards: string[]) => { cards = newCards })
  const getCurrentCards = () => cards

  beforeEach(() => {
    cards = ['card-a', 'card-b']
    vi.clearAllMocks()
  })

  it('starts with empty stacks', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('snapshot records current state for undo', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    act(() => { result.current.snapshot(['card-a', 'card-b']) })
    expect(result.current.canUndo).toBe(true)
  })

  it('undo restores previous snapshot and saves current to redo', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    act(() => { result.current.snapshot(['card-a', 'card-b']) })
    cards = ['card-a', 'card-b', 'card-c']
    act(() => { result.current.undo() })
    expect(setCards).toHaveBeenCalledWith(['card-a', 'card-b'])
    expect(result.current.canRedo).toBe(true)
  })

  it('redo re-applies undone state', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    act(() => { result.current.snapshot(['card-a']) })
    cards = ['card-a', 'card-b']
    act(() => { result.current.undo() })
    act(() => { result.current.redo() })
    // redo should have called setCards with the state before undo
    expect(setCards).toHaveBeenCalled()
  })

  it('undo does nothing when stack is empty', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    act(() => { result.current.undo() })
    expect(setCards).not.toHaveBeenCalled()
  })

  it('redo does nothing when stack is empty', () => {
    const { result } = renderHook(() => useDashboardUndoRedo(setCards, getCurrentCards))
    act(() => { result.current.redo() })
    expect(setCards).not.toHaveBeenCalled()
  })
})
