import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { cn } from '../../lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent'
type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_MAP: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-secondary hover:bg-secondary/80 text-foreground',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  ghost: 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground',
  accent: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400',
}

const SIZE_MAP: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs gap-1',
  md: 'px-3 py-1.5 text-sm gap-1.5',
  lg: 'px-4 py-2 text-sm gap-2',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon,
    iconRight,
    loading,
    fullWidth,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE_MAP[size],
        VARIANT_MAP[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        icon
      ) : null}
      {children}
      {iconRight}
    </button>
  )
})

export type { ButtonVariant, ButtonSize }
