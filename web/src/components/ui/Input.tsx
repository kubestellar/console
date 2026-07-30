import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react'
import { cn } from '../../lib/cn'

type InputSize = 'sm' | 'md' | 'lg'

const SIZE_MAP: Record<InputSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

/** Extra left padding when a leading icon is present, per size */
const ICON_LEFT_PADDING: Record<InputSize, string> = {
  sm: 'pl-7',
  md: 'pl-9',
  lg: 'pl-10',
}

/** Extra right padding when a trailing icon is present, per size */
const ICON_RIGHT_PADDING: Record<InputSize, string> = {
  sm: 'pr-7',
  md: 'pr-9',
  lg: 'pr-10',
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Visual size variant — controls padding and font size */
  inputSize?: InputSize
  /** Icon rendered at the leading (left) edge of the input */
  leadingIcon?: ReactNode
  /** Icon rendered at the trailing (right) edge of the input */
  trailingIcon?: ReactNode
  /** When true, applies red border and focus ring to indicate a validation error */
  error?: boolean
  /** Error message displayed below the input and linked via aria-describedby */
  errorMessage?: string
  ref?: Ref<HTMLInputElement>
}

export function Input({
  inputSize = 'md',
  leadingIcon,
  trailingIcon,
  error,
  errorMessage,
  disabled,
  className,
  ref,
  ...props
}: InputProps) {
  const generatedId = useId()
  const errorId = errorMessage ? `${generatedId}-error` : undefined

  return (
    <div>
      <div className="relative">
        {leadingIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted-foreground"
          >
            {leadingIcon}
          </span>
        )}

        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            'w-full rounded-lg border bg-secondary text-foreground transition-colors',
            'placeholder:text-muted-foreground',
            'focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-border focus:ring-ring',
            SIZE_MAP[inputSize],
            leadingIcon && ICON_LEFT_PADDING[inputSize],
            trailingIcon && ICON_RIGHT_PADDING[inputSize],
            className,
          )}
          {...props}
        />

        {trailingIcon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground"
          >
            {trailingIcon}
          </span>
        )}
      </div>

      {errorMessage && (
        <p id={errorId} className="mt-1 text-xs text-red-500" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}

export type { InputSize }
