import { type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

type DivProps = ComponentPropsWithoutRef<'div'>

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
