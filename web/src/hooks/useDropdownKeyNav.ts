import { useCallback } from 'react'

/** Next focusable index when pressing ArrowDown. Clamps at the last item. */
function nextFocusIndex(currentIdx: number, total: number): number {
  return Math.min(currentIdx + 1, total - 1)
}

/** Previous focusable index when pressing ArrowUp. Clamps at zero. */
function prevFocusIndex(currentIdx: number): number {
  return Math.max(currentIdx - 1, 0)
}

export const __testables = { nextFocusIndex, prevFocusIndex }

/**
 * Returns an onKeyDown handler for dropdown menus that enables
 * ArrowUp/ArrowDown navigation and Escape to close.
 */
export function useDropdownKeyNav(onClose?: () => void) {
  return useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    const items = e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [role="option"]')
    const idx = Array.from(items).indexOf(document.activeElement as HTMLElement)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[nextFocusIndex(idx, items.length)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[prevFocusIndex(idx)]?.focus()
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault()
      onClose()
    }
  }, [onClose])
}
