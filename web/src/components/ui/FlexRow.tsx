import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface FlexRowProps {
  children: ReactNode
  className?: string
  gap?: 1 | 2 | 3 | 4
  align?: 'start' | 'center' | 'end' | 'baseline' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  wrap?: boolean
}

const GAP_MAP = {
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
} as const

const ALIGN_MAP = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
} as const

const JUSTIFY_MAP = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
} as const

export function FlexRow({
  children,
  className,
  gap = 2,
  align = 'center',
  justify,
  wrap = false,
}: FlexRowProps) {
  return (
    <div
      className={cn(
        'flex',
        GAP_MAP[gap],
        ALIGN_MAP[align],
        justify && JUSTIFY_MAP[justify],
        wrap && 'flex-wrap',
        className
      )}
    >
      {children}
    </div>
  )
}
