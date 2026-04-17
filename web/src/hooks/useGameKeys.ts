/**
 * useGameKeys — scoped keyboard listener for game card components.
 *
 * Problem: KeepAlive keeps dashboard pages mounted (with display:none) even
 * after the user navigates away.  Game components that register global
 * `window` keydown/keyup listeners therefore capture keys across the entire
 * app — breaking text inputs, the kubectl terminal, and bug-report fields.
 *
 * Solution: this hook checks whether the game's container element is actually
 * visible before forwarding keyboard events.  It also skips events whose
 * target is an input, textarea, or contentEditable element.
 *
 * Usage (direct-action games):
 *   const containerRef = useRef<HTMLDivElement>(null)
 *   useGameKeys(containerRef, { onKeyDown: handler })
 *
 * Usage (key-tracking games):
 *   const containerRef = useRef<HTMLDivElement>(null)
 *   const keysRef = useRef<Set<string>>(new Set())
 *   useGameKeyTracking(containerRef, keysRef)
 */

import { useEffect, RefObject, MutableRefObject } from 'react'

/** Returns true if the element is inside a hidden KeepAlive container. */
function isHiddenByKeepAlive(el: HTMLElement): boolean {
  let node: HTMLElement | null = el
  while (node) {
    if (node.dataset?.keepaliveActive === 'false') return true
    // Also check computed display — covers KeepAlive's display:none
    if (node.style?.display === 'none') return true
    node = node.parentElement
  }
  return false
}

function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target
  if (t instanceof HTMLInputElement) return true
  if (t instanceof HTMLTextAreaElement) return true
  if (t instanceof HTMLElement && t.isContentEditable) return true
  return false
}

interface GameKeyOptions {
  onKeyDown?: (e: KeyboardEvent) => void
  onKeyUp?: (e: KeyboardEvent) => void
}

/**
 * Register scoped keydown/keyup listeners that only fire when the game
 * container is visible (not hidden by KeepAlive) and the event target is
 * not an editable element.
 */
export function useGameKeys(
  containerRef: RefObject<HTMLElement | null>,
  { onKeyDown, onKeyUp }: GameKeyOptions,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return
      if (!containerRef.current || isHiddenByKeepAlive(containerRef.current)) return
      onKeyDown?.(e)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return
      if (!containerRef.current || isHiddenByKeepAlive(containerRef.current)) return
      onKeyUp?.(e)
    }

    if (onKeyDown) window.addEventListener('keydown', handleKeyDown)
    if (onKeyUp) window.addEventListener('keyup', handleKeyUp)

    return () => {
      if (onKeyDown) window.removeEventListener('keydown', handleKeyDown)
      if (onKeyUp) window.removeEventListener('keyup', handleKeyUp)
    }
  }, [containerRef, onKeyDown, onKeyUp])
}

interface GameKeyTrackingOptions {
  /** Keys for which preventDefault() is called (default: arrows + space). */
  preventDefaultKeys?: string[]
  /** When true, keys are stored/deleted as lowercase (default: false). */
  lowercase?: boolean
}

/**
 * Convenience wrapper for games that use a `keysRef` Set to track held keys.
 * Adds keys on keydown, removes on keyup, and clears the set when the
 * container becomes hidden.
 */
export function useGameKeyTracking(
  containerRef: RefObject<HTMLElement | null>,
  keysRef: MutableRefObject<Set<string>>,
  options: GameKeyTrackingOptions = {},
) {
  const {
    preventDefaultKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '],
    lowercase = false,
  } = options

  useEffect(() => {
    const preventSet = new Set(preventDefaultKeys)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return
      if (!containerRef.current || isHiddenByKeepAlive(containerRef.current)) return
      if (preventSet.has(e.key)) e.preventDefault()
      keysRef.current.add(lowercase ? e.key.toLowerCase() : e.key)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(lowercase ? e.key.toLowerCase() : e.key)
    }

    /** Release all held keys when the tab/window loses focus or becomes hidden. */
    const handleBlur = () => {
      keysRef.current.clear()
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        keysRef.current.clear()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const keys = keysRef.current
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      keys.clear()
    }
  }, [containerRef, keysRef])
}
