import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Grid - Grid layout component
 * 
 * Replaces common pattern: `grid grid-cols-X gap-Y`
 * Supports different column counts and gap sizes
 */

type Cols = '1' | '2' | '3' | '4' | '6' | '12'
type Gap = '1' | '2' | '3' | '4' | '6' | '8'

interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of columns */
  cols?: Cols
  /** Gap size (Tailwind spacing scale) */
  gap?: Gap
  /** Children elements */
  children: ReactNode
}

const COLS_MAP: Record<Cols, string> = {
  '1': 'grid-cols-1',
  '2': 'grid-cols-2',
  '3': 'grid-cols-3',
  '4': 'grid-cols-4',
  '6': 'grid-cols-6',
  '12': 'grid-cols-12',
}

const GAP_MAP: Record<Gap, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '6': 'gap-6',
  '8': 'gap-8',
}

export function Grid({
  cols = '2',
  gap = '4',
  className,
  children,
  ...props
}: GridProps) {
  return (
    <div
      className={cn(
        'grid',
        COLS_MAP[cols],
        GAP_MAP[gap],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
