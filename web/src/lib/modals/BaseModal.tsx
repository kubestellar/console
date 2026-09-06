/**
 * BaseModal - Compound component for building modals
 *
 * Naming Convention:
 * - *Modal  → Complex flows with multiple sections (use BaseModal)
 * - *Dialog → Simple confirm/prompt (use ConfirmDialog from ./ConfirmDialog.tsx)
 *
 * Provides standardized modal structure:
 * - Backdrop with blur effect
 * - Responsive sizing
 * - Keyboard navigation
 * - Header, Content, Footer, Tabs sub-components
 *
 * Sub-components live in ./components/ (ModalHeader, ModalTabs, ModalLayout)
 * and are attached as static properties below.
 *
 * @example
 * ```tsx
 * <BaseModal isOpen={isOpen} onClose={onClose} size="lg">
 *   <BaseModal.Header
 *     title="Pod Details"
 *     icon={Box}
 *     onClose={onClose}
 *     onBack={onBack}
 *   >
 *     <ResourceBadges resource={resource} />
 *   </BaseModal.Header>
 *
 *   <BaseModal.Tabs
 *     tabs={tabs}
 *     activeTab={activeTab}
 *     onTabChange={setActiveTab}
 *   />
 *
 *   <BaseModal.Content>
 *     {renderTabContent()}
 *   </BaseModal.Content>
 *
 *   <BaseModal.Footer showKeyboardHints />
 * </BaseModal>
 * ```
 */

import { useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalNavigation, useModalFocusTrap } from './useModalNavigation'
import { BaseModalProps, ModalSize } from './types'
import { ModalTitleIdContext, ModalEscapeContext } from './components/modalContexts'
import { ModalHeader } from './components/ModalHeader'
import { ModalTabs } from './components/ModalTabs'
import {
  ModalContent,
  ModalFooter,
  ModalActionBar,
  ModalSection,
} from './components/ModalLayout'

// ============================================================================
// Size Configuration
// ============================================================================

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-[95vw] max-h-[95vh]',
}

const HEIGHT_CLASSES: Record<ModalSize, string> = {
  sm: 'max-h-[min(60vh,calc(100vh-2rem))]',
  md: 'max-h-[min(70vh,calc(100vh-2rem))]',
  lg: 'min-h-[80vh] max-h-[min(90vh,calc(100vh-2rem))]',
  xl: 'min-h-[85vh] max-h-[min(85vh,calc(100vh-2rem))]',
  full: 'min-h-[95vh] max-h-[calc(100vh-2rem)]',
}

// ============================================================================
// BaseModal Component
// ============================================================================

export function BaseModal({
  isOpen,
  onClose,
  size = 'lg',
  className = '',
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  enableBackspace = true,
  testId,
}: BaseModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  // #9165 — Track where mousedown started so we don't treat
  // "press inside the modal, drag out, release on backdrop" as an
  // outside-click. Without this, a click that began on a sidebar
  // item near the modal edge can fire its `click` event on the
  // backdrop (because click target is the deepest common ancestor
  // of mousedown+mouseup) and unexpectedly close the modal.
  const mouseDownOnBackdropRef = useRef(false)
  const titleId = useId()

  // Set up keyboard navigation (ESC and Space/Backspace to close)
  useModalNavigation({
    isOpen,
    onClose,
    enableEscape: closeOnEscape,
    enableBackspace,
    disableBodyScroll: true,
  })

  // Trap focus within modal so Tab cannot escape to background content
  useModalFocusTrap(modalRef, isOpen)

  const escapeContextValue = useMemo(() => ({ escapeEnabled: closeOnEscape }), [closeOnEscape])

  if (!isOpen) return null

  // #9165 — Outside-click detection.
  //
  // A click is treated as an outside-click ONLY when:
  //   1. closeOnBackdrop is enabled, AND
  //   2. the mousedown started on the backdrop (not on modal content
  //      that the user later dragged out of), AND
  //   3. the mouseup target is NOT contained within the modal content.
  //
  // The previous implementation used `e.target === e.currentTarget`,
  // which failed in two ways:
  //   - mousedown-inside-then-mouseup-on-backdrop fires `click` on the
  //     backdrop with `target === currentTarget`, closing the modal
  //     even though the user's intent was to interact with internal
  //     content (the "click near sidebar edge" symptom in #9165).
  //   - clicks that bubble through nested wrappers may not satisfy the
  //     strict `target === currentTarget` equality even when they are
  //     genuinely on the backdrop.
  //
  // Using a ref-based `contains()` check on the modal element, plus
  // mousedown tracking, eliminates both failure modes.
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    // Only register as a backdrop-mousedown if the press is NOT on
    // the modal content. modalRef.current can be null briefly during
    // unmount; treat that as not-on-modal so we still gate on (3).
    const target = e.target as Node
    mouseDownOnBackdropRef.current = !modalRef.current || !modalRef.current.contains(target)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!closeOnBackdrop) return
    const startedOnBackdrop = mouseDownOnBackdropRef.current
    // Reset for the next gesture so a stale value can't leak across clicks.
    mouseDownOnBackdropRef.current = false
    if (!startedOnBackdrop) return
    const target = e.target as Node
    if (modalRef.current && modalRef.current.contains(target)) return
    onClose()
  }

  // Use React Portal to render modal at document.body level
  // This ensures it appears above all other content regardless of parent z-index
  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-modal isolate p-4 overflow-y-auto overscroll-contain"
      onMouseDown={handleBackdropMouseDown}
      onClick={handleBackdropClick}
    >
      <div
        className="min-h-full flex items-start justify-center py-4 sm:items-center"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-testid={testId}
          className={`glass w-full ${SIZE_CLASSES[size]} ${HEIGHT_CLASSES[size]} rounded-xl flex flex-col overflow-hidden ${className}`}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation() }}
        >
          <ModalTitleIdContext.Provider value={titleId}>
            <ModalEscapeContext.Provider value={escapeContextValue}>
              {children}
            </ModalEscapeContext.Provider>
          </ModalTitleIdContext.Provider>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ============================================================================
// Attach Sub-Components
// ============================================================================

BaseModal.Header = ModalHeader
BaseModal.Content = ModalContent
BaseModal.Footer = ModalFooter
BaseModal.Tabs = ModalTabs
BaseModal.ActionBar = ModalActionBar
BaseModal.Section = ModalSection
