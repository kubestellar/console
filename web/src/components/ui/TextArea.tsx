import { type TextareaHTMLAttributes, type Ref } from 'react'
import { cn } from '../../lib/cn'

type TextAreaSize = 'sm' | 'md' | 'lg'

const SIZE_MAP: Record<TextAreaSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
}

/** Default number of visible text rows */
const DEFAULT_ROWS = 3

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Visual size variant — controls padding and font size */
  textAreaSize?: TextAreaSize
  /** When true, applies red border and focus ring to indicate a validation error */
  error?: boolean
  /** Whether the textarea can be resized by the user. Defaults to false (resize-none). */
  resizable?: boolean
  ref?: Ref<HTMLTextAreaElement>
}

export function TextArea({
  textAreaSize = 'md',
  error,
  resizable = false,
  disabled,
  className,
  rows = DEFAULT_ROWS,
  ref,
  ...props
}: TextAreaProps) {
  return (
    <textarea
      ref={ref}
      disabled={disabled}
      rows={rows}
      aria-invalid={error ? true : undefined}
      className={cn(
        'w-full rounded-lg border bg-secondary text-foreground transition-colors',
        'placeholder:text-muted-foreground',
        'focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error
          ? 'border-red-500 focus:ring-red-500'
          : 'border-border focus:ring-ring',
        resizable ? 'resize-y' : 'resize-none',
        SIZE_MAP[textAreaSize],
        className,
      )}
      {...props}
    />
  )
}

export type { TextAreaSize }
