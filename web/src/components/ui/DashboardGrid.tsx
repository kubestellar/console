import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

interface DashboardGridProps {
  children: ReactNode
  className?: string
  cols?: 1 | 2 | 3 | 4 | 12
}

const COLS_MAP = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'grid-cols-4',
  12: 'grid-cols-12',
} as const

export function DashboardGrid({
  children,
  className,
  cols = 2,
}: DashboardGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        COLS_MAP[cols],
        className
      )}
    >
      {children}
    </div>
  )
}
