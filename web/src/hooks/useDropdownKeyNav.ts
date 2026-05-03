import { useCallback } from 'react'

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
      items[Math.min(idx + 1, items.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[Math.max(idx - 1, 0)]?.focus()
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault()
      onClose()
    }
  }, [onClose])
}
