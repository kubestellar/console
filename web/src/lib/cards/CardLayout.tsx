import { type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

type DivProps = ComponentPropsWithoutRef<'div'>

/**
 * Root container for a card in its loading/skeleton state.
 * Applies: h-full flex flex-col min-h-card
 */
export function CardBody({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('h-full flex flex-col min-h-card', className)}
      {...props}
    />
  )
}

/**
 * Root container for a card once data has loaded.
 * Applies: h-full flex flex-col min-h-card content-loaded
 */
export function CardBodyLoaded({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('h-full flex flex-col min-h-card content-loaded', className)}
      {...props}
    />
  )
}

/**
 * Centered container for a card's empty or error state.
 * Applies: h-full flex flex-col items-center justify-center min-h-card text-muted-foreground
 */
export function CardBodyEmpty({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('h-full flex flex-col items-center justify-center min-h-card text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * Scrollable flex-grow list area inside a card.
 * Applies: flex-1 space-y-2 overflow-y-auto
 */
export function CardScrollList({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('flex-1 space-y-2 overflow-y-auto', className)}
      {...props}
    />
  )
}

export function CardHeaderRow({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-y-2 mb-4', className)}
      {...props}
    />
  )
}

export function CardHeaderActions({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      {...props}
    />
  )
}

export function CardStatGrid({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('grid grid-cols-2 mb-4', className)}
      {...props}
    />
  )
}

export function CardStatHeader({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('flex items-center gap-2 mb-1', className)}
      {...props}
    />
  )
}
