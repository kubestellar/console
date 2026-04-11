import { ReactNode } from 'react'
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
 */

export interface EmptyStateAction {
  /** Label rendered inside the button */
  label: string
  /** Click handler (mutually exclusive with href) */
  onClick?: () => void
  /** If provided, renders an anchor instead of a button */
  href?: string
  /** Optional icon rendered before the label (defaults to Plus) */
  icon?: LucideIcon
}

export interface EmptyStateProps {
  /** Icon rendered at top of the empty state */
  icon?: ReactNode
  /** Primary title (use a short, consistent phrase) */
  title: string
  /** Supporting description — explain what to do next */
  description?: string
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
  const Icon = action.icon ?? Plus
  const classes = variant === 'primary'
    ? 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors'
    : 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors'

  if (action.href) {
    return (
      <a href={action.href} className={classes}>
        <Icon className="w-4 h-4" aria-hidden="true" />
        {action.label}
      </a>
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
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
          {description}
        </p>
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
