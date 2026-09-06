/**
 * ModalHeader — header sub-component for BaseModal.
 *
 * Renders back button, icon, title/description, badges, extra content,
 * and the close button (with Esc hint driven by ModalEscapeContext).
 */

import { useContext } from 'react'
import { X, ChevronLeft } from 'lucide-react'
import { ModalHeaderProps } from '../types'
import { ModalTitleIdContext, ModalEscapeContext } from './modalContexts'

// Tooltip/aria-label text for the close button, varying with escape enablement.
const CLOSE_WITH_ESC_LABEL = 'Close (Esc)'
const CLOSE_LABEL = 'Close'
const CLOSE_WITH_ESC_ARIA = 'Close modal (Esc)'
const CLOSE_ARIA = 'Close modal'

export function ModalHeader({
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
              type="button"
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
              <div className="text-sm text-muted-foreground truncate">
                {description}
              </div>
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
              type="button"
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
