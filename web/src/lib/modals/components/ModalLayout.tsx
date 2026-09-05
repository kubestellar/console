/**
 * Modal layout sub-components for BaseModal:
 * Content (scrollable body), Footer (with keyboard hints),
 * ActionBar, and Section.
 */

import { ReactNode } from 'react'
import { ModalContentProps, ModalFooterProps } from '../types'

// ============================================================================
// Content Sub-Component
// ============================================================================

export function ModalContent({
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

export function ModalFooter({
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
// Action Bar Sub-Component
// ============================================================================

export interface ModalActionBarProps {
  children: ReactNode
  className?: string
}

export function ModalActionBar({ children, className = '' }: ModalActionBarProps) {
  return (
    <div className={`px-4 py-3 border-t border-border bg-secondary/30 ${className}`}>
      {children}
    </div>
  )
}

// ============================================================================
// Section Sub-Component
// ============================================================================

export interface ModalSectionProps {
  title?: string
  children: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
}

export function ModalSection({
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
