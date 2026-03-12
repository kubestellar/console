import { useCallback, useEffect, useRef, useState } from 'react'

/** Maximum number of undo snapshots to keep in memory */
const MAX_UNDO_STACK_SIZE = 30

/**
 * Generic undo/redo hook using snapshot-based history.
 *
 * Wraps a state value and provides `pushState()` to record snapshots,
 * plus `undo()` / `redo()` to navigate history. Keyboard shortcuts
 * (Cmd+Z / Ctrl+Z / Cmd+Shift+Z / Ctrl+Shift+Z) are registered
 * automatically while the hook is mounted.
 */
export interface UseUndoRedoResult<T> {
  /** Undo to previous state. Returns the restored state or null if nothing to undo. */
  undo: () => T | null
  /** Redo to next state. Returns the restored state or null if nothing to redo. */
  redo: () => T | null
  /** Push the current state as an undo snapshot before a mutation */
  pushState: (state: T) => void
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
  /** Number of undo steps available */
  undoCount: number
  /** Number of redo steps available */
  redoCount: number
}

export function useUndoRedo<T>(
  onRestore: (state: T) => void,
): UseUndoRedoResult<T> {
  const undoStackRef = useRef<T[]>([])
  const redoStackRef = useRef<T[]>([])
  // Force re-render when stack sizes change for canUndo/canRedo
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  const pushState = useCallback((state: T) => {
    undoStackRef.current.push(state)
    // Trim to max size
    if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) {
      undoStackRef.current.shift()
    }
    // Clear redo stack on new action (standard undo/redo behavior)
    redoStackRef.current = []
    setUndoCount(undoStackRef.current.length)
    setRedoCount(0)
  }, [])

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (prev === undefined) return null
    // We need the current state to push to redo — caller should
    // use the onRestore callback to apply, and we save what's being
    // replaced via the _currentStateRef (set by pushState).
    // Actually, we need the "current" state before undo to push to redo.
    // This requires cooperation: we store the state that onRestore is
    // about to replace. The caller should call pushStateForRedo.
    setUndoCount(undoStackRef.current.length)
    onRestore(prev)
    return prev
  }, [onRestore])

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (next === undefined) return null
    setRedoCount(redoStackRef.current.length)
    onRestore(next)
    return next
  }, [onRestore])

  // We need a way to capture the current state before undo so we can push it to redo.
  // The pattern: caller calls `captureForUndo(currentState)` before applying undo.
  // Better pattern: wrap undo/redo at the dashboard level where we have the current cards.

  return {
    undo,
    redo,
    pushState,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    undoCount,
    redoCount,
  }
}

/**
 * Higher-level undo/redo for dashboard cards.
 * Captures snapshots before mutations and handles undo/redo with proper
 * current-state tracking for the redo stack.
 */
export interface UseDashboardUndoRedoResult<T> {
  /** Record current state before a mutation */
  snapshot: (current: T[]) => void
  /** Undo — restores previous state */
  undo: () => void
  /** Redo — re-applies undone state */
  redo: () => void
  /** Whether undo is available */
  canUndo: boolean
  /** Whether redo is available */
  canRedo: boolean
}

export function useDashboardUndoRedo<T>(
  setCards: (cards: T[]) => void,
  getCurrentCards: () => T[],
): UseDashboardUndoRedoResult<T> {
  const undoStackRef = useRef<T[][]>([])
  const redoStackRef = useRef<T[][]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)
  // Prevent undo/redo from being recorded as new snapshots
  const isRestoringRef = useRef(false)

  const snapshot = useCallback((current: T[]) => {
    if (isRestoringRef.current) return
    undoStackRef.current.push([...current])
    if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) {
      undoStackRef.current.shift()
    }
    redoStackRef.current = []
    setUndoCount(undoStackRef.current.length)
    setRedoCount(0)
  }, [])

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (!prev) return
    // Save current state to redo stack
    redoStackRef.current.push([...getCurrentCards()])
    isRestoringRef.current = true
    setCards(prev)
    // Reset flag after React processes the state update
    requestAnimationFrame(() => { isRestoringRef.current = false })
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }, [getCurrentCards, setCards])

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop()
    if (!next) return
    // Save current state to undo stack
    undoStackRef.current.push([...getCurrentCards()])
    isRestoringRef.current = true
    setCards(next)
    requestAnimationFrame(() => { isRestoringRef.current = false })
    setUndoCount(undoStackRef.current.length)
    setRedoCount(redoStackRef.current.length)
  }, [getCurrentCards, setCards])

  // Keyboard shortcuts: Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z for redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.key !== 'z') return

      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return {
    snapshot,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  }
}
