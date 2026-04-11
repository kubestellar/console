import { useState, useEffect, useCallback, useMemo } from 'react'
import { UseModalNavigationOptions, UseModalNavigationResult } from './types'

/**
 * #6749-B (Copilot on PR #6746) — Module-level stable no-op ref object
 * used as a fallback when a `useModal` caller omits `modalRef`/`backdropRef`.
 *
 * Each consumer of `useModal` uses a `useMemo(() => ({current: null}), [])`
 * locked once per component instance so the ref identity is stable across
 * renders of that component. A module-level singleton would also be stable,
 * but sharing it across components risks one component's focus-trap logic
 * (if we ever switch away from always calling `.current = null`)
 * trampling another component's ref target. Per-consumer useMemo is the
 * safe middle ground: still stable, still isolated.
 *
 * The previous code created a fresh `{ current: null }` object literal on
 * every render. Both `useModalBackdropClose` and `useModalFocusTrap`
 * include `ref` in their effect dep arrays, so the effects re-ran on
 * every render when the caller omitted a ref — detaching and reattaching
 * event listeners hundreds of times during streaming renders.
 */

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
  disableBodyScroll = true }: UseModalNavigationOptions): UseModalNavigationResult {
  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape should always work, even in input fields.
      // stopImmediatePropagation prevents parent modals from also closing
      // when a nested modal handles Escape first.
      if (e.key === 'Escape') {
        if (enableEscape) {
          e.preventDefault()
          e.stopImmediatePropagation()
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
    handleKeyDown }
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
  ref: React.RefObject<HTMLElement | null>,
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
  ref: React.RefObject<HTMLElement | null>,
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
  modalRef?: React.RefObject<HTMLElement | null>
  /** Ref to backdrop for click-to-close */
  backdropRef?: React.RefObject<HTMLElement | null>
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
  enableBackdropClose = true }: UseModalOptions) {
  // Keyboard navigation
  useModalNavigation({
    isOpen,
    onClose,
    onBack,
    enableEscape,
    enableBackspace,
    disableBodyScroll })

  // #6717 — Always call useModalBackdropClose and useModalFocusTrap
  // unconditionally so React's rules-of-hooks invariant holds when callers
  // toggle `enableBackdropClose` / `enableFocusTrap` / ref props across
  // renders. The behavior is gated inside each hook via the `isOpen` flag:
  // when `false`, the hook short-circuits and installs no listeners.
  //
  // Callers that pass no ref get a stable no-op ref object so the hook
  // signature is satisfied. The ref is memoized once per consumer so its
  // identity is stable across renders — see the file-header note on
  // #6749-B for why we do this via useMemo rather than a module singleton.
  const noopRef = useMemo(
    () => ({ current: null } as React.RefObject<HTMLElement | null>),
    [],
  )
  useModalBackdropClose(
    backdropRef ?? noopRef,
    isOpen && !!backdropRef && enableBackdropClose,
    onClose,
  )
  useModalFocusTrap(
    modalRef ?? noopRef,
    isOpen && !!modalRef && enableFocusTrap,
  )
}

/**
 * useModalState - Simple boolean toggle for modal open/close state
 *
 * Replaces the common pattern:
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 * setIsOpen(true)  // open
 * setIsOpen(false) // close
 * ```
 *
 * With:
 * ```tsx
 * const { isOpen, open, close, toggle } = useModalState()
 * ```
 */
export interface UseModalStateResult {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

export function useModalState(initialOpen = false): UseModalStateResult {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])
  return { isOpen, open, close, toggle }
}
