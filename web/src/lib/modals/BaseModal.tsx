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

import { ReactNode, createContext, useContext, useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft } from 'lucide-react'
import { useModalNavigation, useModalFocusTrap } from './useModalNavigation'
import {
  BaseModalProps,
  ModalHeaderProps,
  ModalContentProps,
  ModalFooterProps,
  ModalTabsProps,
  ModalSize,
} from './types'

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

// React Context so ModalHeader can receive the generated title ID
const ModalTitleIdContext = createContext<string | undefined>(undefined)

// React Context so ModalHeader can read whether Escape-to-close is enabled,
// which drives the close button's tooltip + aria-label keyboard hint.
// Defaults to true to preserve behavior for any ModalHeader rendered outside
// a BaseModal provider (none today, but defensive).
const ModalEscapeContext = createContext<{ escapeEnabled: boolean }>({ escapeEnabled: true })

// Tooltip/aria-label text for the close button, varying with escape enablement.
const CLOSE_WITH_ESC_LABEL = 'Close (Esc)'
const CLOSE_LABEL = 'Close'
const CLOSE_WITH_ESC_ARIA = 'Close modal (Esc)'
const CLOSE_ARIA = 'Close modal'

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
        className="min-h-full flex items-center justify-center"
        onMouseDown={handleBackdropMouseDown}
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={testId}
          className={`glass w-full ${SIZE_CLASSES[size]} ${HEIGHT_CLASSES[size]} rounded-xl flex flex-col overflow-hidden ${className}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
// Header Sub-Component
// ============================================================================

function ModalHeader({
  title,
  description,
  icon: Icon,
  badges,
  onClose,
  onBack,
  showBack = true,
  extra,
  children,
  closeTestId,
  backTestId,
  tabsTestId,
}: ModalHeaderProps) {
  const titleId = useContext(ModalTitleIdContext)
  const { escapeEnabled } = useContext(ModalEscapeContext)
  const closeTitle = escapeEnabled ? CLOSE_WITH_ESC_LABEL : CLOSE_LABEL
  const closeAriaLabel = escapeEnabled ? CLOSE_WITH_ESC_ARIA : CLOSE_ARIA

  return (
    <div className="flex flex-col border-b border-border" data-testid={tabsTestId}>
      {/* Main header row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Back button */}
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Go back (Backspace)"
              aria-label="Go back"
              data-testid={backTestId}
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
          )}

          {/* Icon */}
          {Icon && (
            <div className="shrink-0">
              <Icon className="w-6 h-6 text-purple-400" />
            </div>
          )}

          {/* Title and description */}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground truncate">
              {title}
            </h2>
            {description && (
              <p className="text-sm text-muted-foreground truncate">
                {description}
              </p>
            )}
          </div>

          {/* Badges */}
          {badges && (
            <div className="flex items-center gap-2 shrink-0">
              {badges}
            </div>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {extra}

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors"
              title={closeTitle}
              aria-label={closeAriaLabel}
              data-testid={closeTestId}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Additional header content (breadcrumbs, etc.) */}
      {children && (
        <div className="px-4 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Content Sub-Component
// ============================================================================

function ModalContent({
  children,
  noPadding = false,
  scrollable = true,
  className = '',
}: ModalContentProps) {
  return (
    <div
      className={`flex-1 ${scrollable ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'} ${noPadding ? '' : 'p-6'} ${className}`}
    >
      {children}
    </div>
  )
}

// ============================================================================
// Footer Sub-Component
// ============================================================================

function ModalFooter({
  children,
  showKeyboardHints = false,
  keyboardHints,
  className = '',
}: ModalFooterProps) {
  const defaultHints = [
    { key: 'Esc', label: 'close' },
    { key: 'Space', label: 'close' },
  ]

  const hints = keyboardHints || defaultHints

  // When keyboard hints are disabled, render children directly for full layout control
  if (!showKeyboardHints) {
    return (
      <div className={`px-4 py-3 border-t border-border flex items-center ${className}`}>
        {children}
      </div>
    )
  }

  return (
    <div className={`px-4 py-3 border-t border-border flex items-center justify-between ${className}`}>
      {/* Children (custom content) */}
      <div className="flex items-center gap-2">
        {children}
      </div>

      {/* Keyboard hints */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {hints.map((hint, index) => (
          <span key={hint.key} className="flex items-center gap-1">
            {index > 0 && <span className="mx-1">•</span>}
            <kbd className="px-2 py-0.5 rounded bg-card border border-border font-mono">
              {hint.key}
            </kbd>
            <span>{hint.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Tabs Sub-Component
// ============================================================================

function ModalTabs({
  tabs,
  activeTab,
  onTabChange,
  className = '',
}: ModalTabsProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex(t => t.id === activeTab)
    if (e.key === 'ArrowRight') onTabChange(tabs[Math.min(idx + 1, tabs.length - 1)].id)
    else if (e.key === 'ArrowLeft') onTabChange(tabs[Math.max(idx - 1, 0)].id)
  }
  return (
    <div role="tablist" onKeyDown={handleKeyDown} className={`flex border-b border-border ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        const Icon = tab.icon

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? 'text-purple-400 border-purple-400 bg-purple-500/5'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  isActive
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Action Bar Sub-Component
// ============================================================================

interface ModalActionBarProps {
  children: ReactNode
  className?: string
}

function ModalActionBar({ children, className = '' }: ModalActionBarProps) {
  return (
    <div className={`px-4 py-3 border-t border-border bg-secondary/30 ${className}`}>
      {children}
    </div>
  )
}

// ============================================================================
// Section Sub-Component
// ============================================================================

interface ModalSectionProps {
  title?: string
  children: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
}

function ModalSection({
  title,
  children,
  className = '',
}: ModalSectionProps) {
  return (
    <div className={`${className}`}>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          {title}
        </h3>
      )}
      {children}
    </div>
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
