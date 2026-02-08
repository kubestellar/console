import { RefreshCw } from 'lucide-react'
import { cn } from '../../lib/cn'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  animation?: 'pulse' | 'wave' | 'none'
  /** Show spinning refresh icon in the skeleton */
  showRefresh?: boolean
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
  showRefresh = false,
}: SkeletonProps) {
  const baseClasses = cn(
    'bg-secondary/60',
    animation === 'pulse' && 'animate-pulse',
    animation === 'wave' && 'animate-shimmer',
    variant === 'circular' && 'rounded-full',
    variant === 'rectangular' && 'rounded-none',
    variant === 'rounded' && 'rounded-lg',
    variant === 'text' && 'rounded',
    showRefresh && 'relative flex items-center justify-center',
    className
  )

  const style: React.CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'text' ? '1em' : undefined),
  }

  if (showRefresh) {
    return (
      <div className={baseClasses} style={style}>
        <RefreshCw className="w-4 h-4 text-muted-foreground/50 animate-spin" />
      </div>
    )
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

// Skeleton with centered refresh icon - for card/component loading states
interface SkeletonWithRefreshProps {
  className?: string
  /** Height of the skeleton container */
  height?: number | string
  /** Size of the refresh icon */
  iconSize?: 'sm' | 'md' | 'lg'
  /** Additional message to show below icon */
  message?: string
}

export function SkeletonWithRefresh({
  className,
  height = 200,
  iconSize = 'md',
  message,
}: SkeletonWithRefreshProps) {
  const iconClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 bg-secondary/30 rounded-lg animate-pulse',
        className
      )}
      style={{ height }}
    >
      <RefreshCw className={cn(iconClasses[iconSize], 'text-muted-foreground/60 animate-spin')} />
      {message && (
        <span className="text-xs text-muted-foreground/60">{message}</span>
      )}
    </div>
  )
}

// Card skeleton with refresh icon - for unified card loading
interface SkeletonCardWithRefreshProps {
  className?: string
  /** Number of content rows to show */
  rows?: number
  /** Show header section */
  showHeader?: boolean
  /** Show stats section */
  showStats?: boolean
}

export function SkeletonCardWithRefresh({
  className,
  rows = 3,
  showHeader = true,
  showStats = false,
}: SkeletonCardWithRefreshProps) {
  return (
    <div className={cn('p-4 space-y-3 relative', className)}>
      {/* Refresh indicator in corner */}
      <div className="absolute top-3 right-3">
        <RefreshCw className="w-4 h-4 text-muted-foreground/40 animate-spin" />
      </div>

      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2">
          <Skeleton variant="circular" width={24} height={24} />
          <Skeleton variant="text" width={120} height={20} />
        </div>
      )}

      {/* Stats row */}
      {showStats && (
        <div className="grid grid-cols-3 gap-2">
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
          <Skeleton variant="rounded" height={50} />
        </div>
      )}

      {/* Content rows */}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={40} />
        ))}
      </div>
    </div>
  )
}

// Stat block skeleton with refresh icon
interface SkeletonStatBlockProps {
  className?: string
}

export function SkeletonStatBlock({ className }: SkeletonStatBlockProps) {
  return (
    <div className={cn('glass p-4 rounded-lg relative', className)}>
      {/* Refresh indicator */}
      <div className="absolute top-2 right-2">
        <RefreshCw className="w-3 h-3 text-muted-foreground/40 animate-spin" />
      </div>

      {/* Icon and label */}
      <div className="flex items-center gap-2 mb-2">
        <Skeleton variant="circular" width={20} height={20} />
        <Skeleton variant="text" width={60} height={14} />
      </div>

      {/* Value */}
      <Skeleton variant="text" width={40} height={28} className="mb-1" />

      {/* Sublabel */}
      <Skeleton variant="text" width={80} height={12} />
    </div>
  )
}

// Stats section skeleton with refresh
interface SkeletonStatsSectionProps {
  className?: string
  /** Number of stat blocks to show */
  count?: number
  /** Grid columns */
  columns?: number
}

export function SkeletonStatsSection({
  className,
  count = 6,
  columns = 6,
}: SkeletonStatsSectionProps) {
  return (
    <div className={cn('relative', className)}>
      {/* Section header with refresh */}
      <div className="flex items-center justify-between mb-3">
        <Skeleton variant="text" width={100} height={16} />
        <RefreshCw className="w-4 h-4 text-muted-foreground/40 animate-spin" />
      </div>

      {/* Stats grid */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonStatBlock key={i} />
        ))}
      </div>
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
