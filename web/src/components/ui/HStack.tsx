import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * HStack - Horizontal stack layout component
 * 
 * Replaces common pattern: `flex items-center gap-X`
 * Supports different gap sizes and optional wrapping/justification
 */

type Gap = '1' | '2' | '3' | '4'

interface HStackProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap size (Tailwind spacing scale) */
  gap?: Gap
  /** Center items vertically (default: true) */
  center?: boolean
  /** Wrap items */
  wrap?: boolean
  /** Justify content */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'
  /** Children elements */
  children: ReactNode
}

const GAP_MAP: Record<Gap, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
}

const JUSTIFY_MAP: Record<NonNullable<HStackProps['justify']>, string> = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

export function HStack({
  gap = '2',
  center = true,
  wrap = false,
  justify,
  className,
  children,
  ...props
}: HStackProps) {
  return (
    <div
      className={cn(
        'flex',
        center && 'items-center',
        GAP_MAP[gap],
        wrap && 'flex-wrap',
        justify && JUSTIFY_MAP[justify],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
