/**
 * BaseModal - Compound component for building modals
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

import { ReactNode, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft } from 'lucide-react'
import { useModalNavigation } from './useModalNavigation'
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
  xl: 'max-h-[min(85vh,calc(100vh-2rem))]',
  full: 'max-h-[calc(100vh-2rem)]',
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
}: BaseModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  // Set up keyboard navigation (ESC and Space/Backspace to close)
  useModalNavigation({
    isOpen,
    onClose,
    enableEscape: closeOnEscape,
    enableBackspace: true,
    disableBodyScroll: true,
  })

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Close if clicking on backdrop or centering wrapper (not on modal content)
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose()
    }
  }

  // Use React Portal to render modal at document.body level
  // This ensures it appears above all other content regardless of parent z-index
  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] p-4 overflow-y-auto overscroll-contain"
      onClick={handleBackdropClick}
    >
      <div
        className="min-h-full flex items-center justify-center"
        onClick={handleBackdropClick}
      >
        <div
          role="dialog"
          aria-modal="true"
          className={`glass w-full ${SIZE_CLASSES[size]} ${HEIGHT_CLASSES[size]} rounded-xl flex flex-col overflow-hidden ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
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
}: ModalHeaderProps) {
  return (
    <div className="flex flex-col border-b border-border">
      {/* Main header row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Back button */}
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-card/50 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Go back (Backspace)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Icon */}
          {Icon && (
            <div className="flex-shrink-0">
              <Icon className="w-6 h-6 text-purple-400" />
            </div>
          )}

          {/* Title and description */}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground truncate">
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
            <div className="flex items-center gap-2 flex-shrink-0">
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
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
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
  showKeyboardHints = true,
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
