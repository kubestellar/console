import { cn } from '../../lib/cn'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseClasses = cn(
    'bg-secondary/60',
    animation === 'pulse' && 'animate-pulse',
    animation === 'wave' && 'animate-shimmer',
    variant === 'circular' && 'rounded-full',
    variant === 'rectangular' && 'rounded-none',
    variant === 'rounded' && 'rounded-lg',
    variant === 'text' && 'rounded',
    className
  )

  const style: React.CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'text' ? '1em' : undefined),
  }

  return <div className={baseClasses} style={style} />
}

// Common skeleton patterns for reuse
export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className="h-4"
          width={i === lines - 1 && lines > 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="circular" width={24} height={24} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton variant="rounded" height={60} />
        <Skeleton variant="rounded" height={60} />
      </div>
      <div className="space-y-2">
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    </div>
  )
}

export function SkeletonList({ items = 3, className }: { items?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={40} />
      ))}
    </div>
  )
}

export function SkeletonStats({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3', className)}>
      <Skeleton variant="rounded" height={70} />
      <Skeleton variant="rounded" height={70} />
    </div>
  )
}

// AnimatedValue component for smooth number transitions
interface AnimatedValueProps {
  value: number | string
  className?: string
  duration?: number
}

export function AnimatedValue({ value, className, duration = 200 }: AnimatedValueProps) {
  return (
    <span
      className={cn('inline-block transition-all', className)}
      style={{
        transitionDuration: `${duration}ms`,
        transitionProperty: 'transform, opacity',
      }}
      key={value}
    >
      {value}
    </span>
  )
}
