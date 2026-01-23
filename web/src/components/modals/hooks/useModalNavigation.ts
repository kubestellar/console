import { useCallback, useEffect } from 'react'

interface UseModalNavigationOptions {
  /** Called when ESC is pressed or backdrop is clicked */
  onClose: () => void
  /** Called when Backspace is pressed (optional - defaults to onClose if not provided) */
  onBack?: () => void
  /** Whether the modal is currently open */
  isOpen: boolean
  /** Whether to handle keyboard events (default: true) */
  enableKeyboard?: boolean
}

interface UseModalNavigationReturn {
  /** Keyboard event handler to attach to window */
  handleKeyDown: (e: KeyboardEvent) => void
  /** Handle backdrop click */
  handleBackdropClick: (e: React.MouseEvent) => void
  /** Handle content click (stops propagation) */
  handleContentClick: (e: React.MouseEvent) => void
}

/**
 * Hook for modal keyboard navigation
 *
 * Features:
 * - ESC key closes the modal
 * - Backspace key navigates back (or closes if no back handler)
 * - Prevents scroll on body when modal is open
 * - Handles backdrop click to close
 *
 * @example
 * ```tsx
 * const { handleKeyDown, handleBackdropClick, handleContentClick } = useModalNavigation({
 *   onClose: () => setIsOpen(false),
 *   onBack: () => goBack(),
 *   isOpen,
 * })
 * ```
 */
export function useModalNavigation({
  onClose,
  onBack,
  isOpen,
  enableKeyboard = true,
}: UseModalNavigationOptions): UseModalNavigationReturn {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input or textarea
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow ESC to still work from inputs
        if (e.key !== 'Escape') {
          return
        }
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break

        case 'Backspace':
          e.preventDefault()
          e.stopPropagation()
          if (onBack) {
            onBack()
          } else {
            onClose()
          }
          break
      }
    },
    [onClose, onBack]
  )

  // Attach keyboard event listener when modal is open
  useEffect(() => {
    if (!isOpen || !enableKeyboard) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, enableKeyboard, handleKeyDown])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if clicking directly on the backdrop
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const handleContentClick = useCallback((e: React.MouseEvent) => {
    // Stop propagation to prevent backdrop click handler
    e.stopPropagation()
  }, [])

  return {
    handleKeyDown,
    handleBackdropClick,
    handleContentClick,
  }
}

/**
 * Hook for managing focus trap within a modal
 * Keeps focus within the modal when tabbing
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isOpen: boolean) {
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus first element when modal opens
    firstElement?.focus()

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleTabKey)
    return () => container.removeEventListener('keydown', handleTabKey)
  }, [containerRef, isOpen])
}

/**
 * Keyboard shortcut hints for modal footer
 */
export const KEYBOARD_HINTS = {
  close: { key: 'ESC', label: 'Close' },
  back: { key: '⌫', label: 'Back' },
  navigate: { key: '↑↓', label: 'Navigate' },
  select: { key: '↵', label: 'Select' },
} as const
