import { useState, useEffect, useCallback, useRef } from 'react'
import { UseModalNavigationOptions, UseModalNavigationResult } from './types'

// ---------------------------------------------------------------------------
// Modal stack — ensures only the front-most open modal handles ESC.
// Each open modal registers itself (push) and deregisters on close (splice).
// The ESC handler checks whether this modal's ID is at the top of the stack
// before processing the key — background modals pass through silently.
// ---------------------------------------------------------------------------
const modalStack: number[] = []
let modalStackCounter = 0
const escapeLayerStack: number[] = []
let escapeLayerCounter = 0
const focusTrapStack: number[] = []
let focusTrapCounter = 0

/** Returns true when at least one BaseModal is currently open. Used by
 *  non-modal ESC handlers (e.g. the mission sidebar) to yield to the
 *  front-most modal instead of closing the sidebar behind it. */
export function isAnyModalOpen(): boolean {
  return modalStack.length > 0
}

/**
 * Registers an Escape-handling layer and returns whether it is currently the
 * front-most handler. Layers include BaseModal, drill-downs, and lightweight
 * overlays/popovers that should only react to Escape when they are on top.
 */
export function useEscapeLayer(isOpen: boolean): () => boolean {
  const escapeLayerIdRef = useRef(++escapeLayerCounter)

  useEffect(() => {
    if (!isOpen) return
    const id = escapeLayerIdRef.current
    escapeLayerStack.push(id)
    return () => {
      const idx = escapeLayerStack.lastIndexOf(id)
      if (idx >= 0) escapeLayerStack.splice(idx, 1)
    }
  }, [isOpen])

  return useCallback(() => {
    const topId = escapeLayerStack[escapeLayerStack.length - 1]
    return topId === escapeLayerIdRef.current
  }, [])
}

/**
 * #6749-B (Copilot on PR #6746) — Module-level stable no-op ref object
 * used as a fallback when a `useModal` caller omits `modalRef`/`backdropRef`.
 *
 * A single shared `{ current: null }` singleton is safe here because
 * `useModalBackdropClose` and `useModalFocusTrap` gate their behavior on
 * the `enabled` flag (`!!backdropRef && enableBackdropClose` and
 * `!!modalRef && enableFocusTrap`), so when a caller omits the real ref
 * the hook short-circuits and never reads or writes `.current`. The
 * shared object therefore can't be trampled by another consumer.
 *
 * The previous code created a fresh `{ current: null }` object literal
 * inside `useModal` on every render. Both `useModalBackdropClose` and
 * `useModalFocusTrap` include `ref` in their effect dep arrays, so the
 * effects re-ran on every render when the caller omitted a ref —
 * detaching and reattaching event listeners hundreds of times during
 * streaming renders. The module-level singleton makes that identity
 * stable for free, with no per-component `useMemo` cost.
 *
 * #6758 (Copilot on PR #6755) — The previous comment claimed a
 * module-level singleton but the implementation used `useMemo`. The
 * module-level form actually achieves the stated intent and is cheaper,
 * so this file now matches its header comment.
 */
const NOOP_REF: React.RefObject<HTMLElement | null> = { current: null }

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

      // Don't handle other keys if user is interacting with an input or interactive control.
      // Use closest() so child elements (e.g. <span>/<svg> inside a <button>) are caught too.
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && (
          e.target.isContentEditable ||
          (e.target as HTMLElement).closest('button, a, select, [role="button"], [role="link"], [role="option"], [role="menuitem"]')
        ))
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

  // Register this modal in the global stack so only the top-most open
  // modal handles ESC. Without this, stacked modals (e.g. ACMM intro
  // behind + mission-prompt-review on top) both fire their ESC handlers
  // and the wrong one closes.
  const modalIdRef = useRef(++modalStackCounter)
  useEffect(() => {
    if (!isOpen) return
    const id = modalIdRef.current
    modalStack.push(id)
    return () => {
      const idx = modalStack.indexOf(id)
      if (idx >= 0) modalStack.splice(idx, 1)
    }
  }, [isOpen])

  const isTopEscapeLayer = useEscapeLayer(isOpen)

  // Set up keyboard listener — only process handled navigation keys when this
  // modal is the front-most Escape layer. This keeps stacked overlays/popovers
  // from closing the modal underneath them.
  const guardedHandleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isNavigationKey = e.key === 'Escape' || e.key === 'Backspace' || e.key === ' '
      if (isNavigationKey && !isTopEscapeLayer()) return
      handleKeyDown(e)
    },
    [handleKeyDown, isTopEscapeLayer],
  )

  useEffect(() => {
    if (!isOpen) return
    window.addEventListener('keydown', guardedHandleKeyDown)
    return () => window.removeEventListener('keydown', guardedHandleKeyDown)
  }, [isOpen, guardedHandleKeyDown])

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
  const focusTrapIdRef = useRef(++focusTrapCounter)

  useEffect(() => {
    if (!isOpen) return
    const id = focusTrapIdRef.current
    focusTrapStack.push(id)
    return () => {
      const idx = focusTrapStack.lastIndexOf(id)
      if (idx >= 0) focusTrapStack.splice(idx, 1)
    }
  }, [isOpen])

  const isTopFocusTrap = useCallback(() => {
    const topId = focusTrapStack[focusTrapStack.length - 1]
    return topId === focusTrapIdRef.current
  }, [])

  useEffect(() => {
    if (!isOpen || !ref.current) return

    const modal = ref.current
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const getFocusableElements = () => Array.from(modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
    const focusFirstElement = () => {
      if (!isTopFocusTrap()) return
      const firstElement = getFocusableElements()[0] ?? modal
      firstElement.focus()
    }

    focusFirstElement()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !isTopFocusTrap()) return

      const focusableElements = getFocusableElements()
      const firstElement = focusableElements[0] ?? modal
      const lastElement = focusableElements[focusableElements.length - 1] ?? modal

      if (e.shiftKey) {
        if (document.activeElement === firstElement || document.activeElement === modal) {
          e.preventDefault()
          lastElement.focus()
        }
      } else if (document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    const handleFocusIn = (e: FocusEvent) => {
      if (!isTopFocusTrap()) return
      if (!modal.contains(e.target as Node)) {
        focusFirstElement()
      }
    }

    modal.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)

    return () => {
      modal.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus()
      }
    }
  }, [isOpen, isTopFocusTrap, ref])
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
  // Callers that pass no ref get the module-level NOOP_REF singleton so
  // the hook signature is satisfied without allocating a fresh object on
  // every render. See the file-header note on #6749-B / #6758 for why
  // sharing is safe here.
  useModalBackdropClose(
    backdropRef ?? NOOP_REF,
    isOpen && !!backdropRef && enableBackdropClose,
    onClose,
  )
  useModalFocusTrap(
    modalRef ?? NOOP_REF,
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
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useModalState(initialOpen = false): UseModalStateResult {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])
  return { isOpen, open, close, toggle, setIsOpen }
}
