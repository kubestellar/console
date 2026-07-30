import { type ReactNode } from 'react'

export interface CardHeaderProps {
  /** Card title */
  title: string
  /** Count badge */
  count?: number
  /** Count badge color variant */
  countVariant?: 'default' | 'success' | 'warning' | 'error'
  /** Extra content after title */
  extra?: ReactNode
  /** Right-side controls */
  controls?: ReactNode
}

export const countVariants = {
  default: 'bg-secondary text-muted-foreground',
  success: 'bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/20 text-yellow-400',
  error: 'bg-red-500/20 text-red-400' }

export function CardHeader({
  title,
  count,
  countVariant = 'default',
  extra,
  controls }: CardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        {count !== undefined && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${countVariants[countVariant]}`}
            title={`${count} items`}
          >
            {count}
          </span>
        )}
        {extra}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
    </div>
  )
}
