import { type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type BadgeColor = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'cyan' | 'gray'
type BadgeSize = 'xs' | 'sm' | 'md'
type BadgeVariant = 'default' | 'outline' | 'solid'

const COLOR_MAP: Record<BadgeColor, { bg: string; text: string; border: string; solid: string }> = {
  green:  { bg: 'bg-green-500/20',  text: 'text-green-400',  border: 'border-green-500/30',  solid: 'bg-green-600 text-white' },
  red:    { bg: 'bg-red-500/20',    text: 'text-red-400',    border: 'border-red-500/30',    solid: 'bg-red-600 text-white' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', solid: 'bg-yellow-600 text-white' },
  blue:   { bg: 'bg-blue-500/20',   text: 'text-blue-400',   border: 'border-blue-500/30',   solid: 'bg-blue-600 text-white' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', solid: 'bg-purple-600 text-white' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', solid: 'bg-orange-600 text-white' },
  cyan:   { bg: 'bg-cyan-500/20',   text: 'text-cyan-400',   border: 'border-cyan-500/30',   solid: 'bg-cyan-600 text-white' },
  gray:   { bg: 'bg-secondary',     text: 'text-muted-foreground', border: 'border-border', solid: 'bg-secondary text-foreground' },
}

const SIZE_MAP: Record<BadgeSize, string> = {
  xs: 'text-2xs px-1.5 py-0.5',
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-xs px-2 py-1',
}

interface StatusBadgeProps {
  children: ReactNode
  color: BadgeColor
  size?: BadgeSize
  variant?: BadgeVariant
  rounded?: 'default' | 'full'
  icon?: ReactNode
  className?: string
}

export function StatusBadge({
  children,
  color,
  size = 'sm',
  variant = 'default',
  rounded = 'default',
  icon,
  className,
}: StatusBadgeProps) {
  const colors = COLOR_MAP[color]
  const roundedClass = rounded === 'full' ? 'rounded-full' : 'rounded'

  const variantClasses = {
    default: cn(colors.bg, colors.text),
    outline: cn(colors.bg, colors.text, 'border', colors.border),
    solid: colors.solid,
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium whitespace-nowrap',
        SIZE_MAP[size],
        roundedClass,
        variantClasses[variant],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export type { BadgeColor, BadgeSize, BadgeVariant }
