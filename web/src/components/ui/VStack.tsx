import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * VStack - Vertical stack layout component
 * 
 * Replaces common pattern: `flex flex-col gap-X`
 * Supports different gap sizes and optional alignment
 */

type Gap = '1' | '2' | '3' | '4' | '6' | '8'

interface VStackProps extends HTMLAttributes<HTMLDivElement> {
  /** Gap size (Tailwind spacing scale) */
  gap?: Gap
  /** Align items horizontally */
  align?: 'start' | 'end' | 'center' | 'stretch'
  /** Justify content vertically */
  justify?: 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly'
  /** Children elements */
  children: ReactNode
}

const GAP_MAP: Record<Gap, string> = {
  '1': 'gap-1',
  '2': 'gap-2',
  '3': 'gap-3',
  '4': 'gap-4',
  '6': 'gap-6',
  '8': 'gap-8',
}

const ALIGN_MAP: Record<NonNullable<VStackProps['align']>, string> = {
  start: 'items-start',
  end: 'items-end',
  center: 'items-center',
  stretch: 'items-stretch',
}

const JUSTIFY_MAP: Record<NonNullable<VStackProps['justify']>, string> = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

export function VStack({
  gap = '2',
  align,
  justify,
  className,
  children,
  ...props
}: VStackProps) {
  return (
    <div
      className={cn(
        'flex flex-col',
        GAP_MAP[gap],
        align && ALIGN_MAP[align],
        justify && JUSTIFY_MAP[justify],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
