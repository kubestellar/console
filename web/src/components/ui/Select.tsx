import { type SelectHTMLAttributes, type Ref } from 'react'
import { cn } from '../../lib/cn'

type SelectSize = 'sm' | 'md' | 'lg'

const SIZE_MAP: Record<SelectSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

/** Right padding to leave room for the custom chevron, per size */
const CHEVRON_PADDING: Record<SelectSize, string> = {
  sm: 'pr-7',
  md: 'pr-9',
  lg: 'pr-10',
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visual size variant — controls padding and font size */
  selectSize?: SelectSize
  /** When true, applies red border and focus ring to indicate a validation error */
  error?: boolean
  ref?: Ref<HTMLSelectElement>
}

export function Select({
  selectSize = 'md',
  error,
  disabled,
  className,
  children,
  ref,
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        ref={ref}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full appearance-none rounded-lg border bg-secondary text-foreground transition-colors',
          'placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-border focus:ring-ring',
          SIZE_MAP[selectSize],
          CHEVRON_PADDING[selectSize],
          className,
        )}
        {...props}
      >
        {children}
      </select>

      {/* Custom chevron indicator */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  )
}

export type { SelectSize }
