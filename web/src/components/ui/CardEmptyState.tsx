import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * CardEmptyState - Empty state for dashboard cards
 * 
 * Replaces common pattern: 
 * `h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2`
 * 
 * Standardizes empty state styling within dashboard cards
 */

interface CardEmptyStateProps {
  /** Icon or visual element to display */
  icon?: ReactNode
  /** Main message */
  children: ReactNode
  /** Additional class names */
  className?: string
  /** Optional test id */
  'data-testid'?: string
}

export function CardEmptyState({
  icon,
  children,
  className,
  'data-testid': testId,
}: CardEmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'h-full flex flex-col items-center justify-center min-h-card text-muted-foreground gap-2',
        className,
      )}
    >
      {icon}
      {children}
    </div>
  )
}
