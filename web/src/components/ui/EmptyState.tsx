import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LucideIcon } from 'lucide-react'

/**
 * Shared EmptyState component used across dashboard pages and lists.
 *
 * Standardizes:
 *  - Visual style (dashed border, centered icon, title + description)
 *  - Optional action button (CTA)
 *  - Message conventions (title uses "No X yet" or "<Page> Dashboard" for
 *    dashboard-card empty states; description offers a next step)
 *
 * Addresses issues 6391 (inconsistent messages), 6392 (Services empty
 * state lacks CTA), and 6393 (mixed empty-state patterns).
 *
 * #6423 (Copilot review follow-up to PR #6413):
 *  - EmptyStateAction is now a discriminated union so callers cannot
 *    supply both onClick and href at the same time. TypeScript enforces
 *    the mutual exclusion at compile time.
 *  - Href actions render as buttons so empty-state CTAs stay valid even when
 *    this component is nested inside a clickable container.
 */

/** Matches fully-qualified URLs — anything with an http:// or https:// scheme. */
const EXTERNAL_URL_REGEX = /^https?:\/\//i

interface EmptyStateActionCommon {
  /** Label rendered inside the action */
  label: string
  /** Optional icon rendered before the label (defaults to Plus) */
  icon?: LucideIcon
}

interface EmptyStateActionButton extends EmptyStateActionCommon {
  onClick: () => void
  href?: never
}

interface EmptyStateActionLink extends EmptyStateActionCommon {
  href: string
  onClick?: never
}

/**
 * Discriminated union — an EmptyStateAction is either a button (onClick)
 * OR a link (href), never both. Enforcing this at the type level fixes
 * the ambiguity flagged on EmptyState.tsx:26 of PR #6413.
 */
export type EmptyStateAction = EmptyStateActionButton | EmptyStateActionLink

export interface EmptyStateProps {
  /** Icon rendered at top of the empty state */
  icon?: ReactNode
  /** Primary title (use a short, consistent phrase) */
  title: string
  /** Supporting description — explain what to do next */
  description?: ReactNode
  /** Optional call-to-action button */
  action?: EmptyStateAction
  /** Optional secondary action */
  secondaryAction?: EmptyStateAction
  /** Additional class names for the root container */
  className?: string
  /** Optional test id */
  'data-testid'?: string
}

function ActionButton({ action, variant }: { action: EmptyStateAction, variant: 'primary' | 'secondary' }) {
  const navigate = useNavigate()
  const Icon = action.icon ?? Plus
  const classes = variant === 'primary'
    ? 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors'
    : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors'

  if ('href' in action && action.href) {
    const handleClick = () => {
      if (EXTERNAL_URL_REGEX.test(action.href)) {
        window.open(action.href, '_blank', 'noopener,noreferrer')
        return
      }
      navigate(action.href)
    }

    return (
      <button type="button" onClick={handleClick} className={classes}>
        <Icon className="w-4 h-4" aria-hidden="true" />
        {action.label}
      </button>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={classes}>
      <Icon className="w-4 h-4" aria-hidden="true" />
      {action.label}
    </button>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId ?? 'empty-state'}
      className={
        'glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center ' +
        (className ?? '')
      }
    >
      {icon && (
        <div className="flex justify-center mb-4" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-foreground mb-2">{title}</h3>
      {description && (
        <div className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
          {description}
        </div>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {action && <ActionButton action={action} variant="primary" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="secondary" />}
        </div>
      )}
    </div>
  )
}
