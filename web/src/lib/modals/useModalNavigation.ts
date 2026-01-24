import { useEffect, useCallback } from 'react'
import { UseModalNavigationOptions, UseModalNavigationResult } from './types'

/**
 * useModalNavigation - Keyboard navigation hook for modals
 *
 * Provides standardized keyboard navigation:
 * - Escape to close modal
 * - Backspace/Space to go back (in navigation stacks)
 * - Body scroll lock when modal is open
 *
 * @example
 * ```tsx
 * function MyModal({ isOpen, onClose, onBack }) {
 *   useModalNavigation({
 *     isOpen,
 *     onClose,
 *     onBack,
 *     enableEscape: true,
 *     enableBackspace: true,
 *   })
 *
 *   // ... render modal
 * }
 * ```
 */
export function useModalNavigation({
  isOpen,
  onClose,
  onBack,
  enableEscape = true,
  enableBackspace = true,
  disableBodyScroll = true,
}: UseModalNavigationOptions): UseModalNavigationResult {
  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape should always work, even in input fields
      if (e.key === 'Escape') {
        if (enableEscape) {
          e.preventDefault()
          onClose()
        }
        return
      }

      // Don't handle other keys if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return
      }

      switch (e.key) {
        case 'Backspace':
        case ' ': // Space
          if (enableBackspace && onBack) {
            e.preventDefault()
            onBack()
          } else if (enableBackspace && !onBack) {
            // No back handler, close instead
            e.preventDefault()
            onClose()
          }
          break
      }
    },
    [onClose, onBack, enableEscape, enableBackspace]
  )

  // Set up keyboard listener
  useEffect(() => {
    if (!isOpen) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  // Disable body scroll when modal is open
  useEffect(() => {
    if (!disableBodyScroll) return

    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen, disableBodyScroll])

  return {
    handleKeyDown,
  }
}

/**
 * useModalBackdropClose - Click outside to close modal
 *
 * @example
 * ```tsx
 * const backdropRef = useRef<HTMLDivElement>(null)
 * useModalBackdropClose(backdropRef, isOpen, onClose)
 * ```
 */
export function useModalBackdropClose(
  ref: React.RefObject<HTMLElement>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return

    const handleClick = (e: MouseEvent) => {
      if (ref.current && e.target === ref.current) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen, onClose, ref])
}

/**
 * useModalFocusTrap - Trap focus within modal
 *
 * Ensures keyboard navigation stays within the modal.
 * Focuses first focusable element on open.
 */
export function useModalFocusTrap(
  ref: React.RefObject<HTMLElement>,
  isOpen: boolean
) {
  useEffect(() => {
    if (!isOpen || !ref.current) return

    const modal = ref.current
    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )

    if (focusableElements.length === 0) return

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Focus first element
    firstElement.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    modal.addEventListener('keydown', handleKeyDown)
    return () => modal.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, ref])
}

/**
 * Combined hook for all modal behaviors
 */
export interface UseModalOptions extends UseModalNavigationOptions {
  /** Ref to modal container for focus trap */
  modalRef?: React.RefObject<HTMLElement>
  /** Ref to backdrop for click-to-close */
  backdropRef?: React.RefObject<HTMLElement>
  /** Enable focus trap */
  enableFocusTrap?: boolean
  /** Enable backdrop click to close */
  enableBackdropClose?: boolean
}

export function useModal({
  isOpen,
  onClose,
  onBack,
  enableEscape = true,
  enableBackspace = true,
  disableBodyScroll = true,
  modalRef,
  backdropRef,
  enableFocusTrap = false,
  enableBackdropClose = true,
}: UseModalOptions) {
  // Keyboard navigation
  useModalNavigation({
    isOpen,
    onClose,
    onBack,
    enableEscape,
    enableBackspace,
    disableBodyScroll,
  })

  // Backdrop close
  if (backdropRef && enableBackdropClose) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useModalBackdropClose(backdropRef, isOpen, onClose)
  }

  // Focus trap
  if (modalRef && enableFocusTrap) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useModalFocusTrap(modalRef, isOpen)
  }
}
