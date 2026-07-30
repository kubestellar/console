import { type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

interface RangeSliderInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Class applied to the outer wrapper */
  containerClassName?: string
  /** Class applied to the track background */
  trackClassName?: string
  /** Class applied to the filled portion of the track */
  fillClassName?: string
}

const DEFAULT_RANGE_MIN = 0
const DEFAULT_RANGE_MAX = 100
const DEFAULT_RANGE_STEP = 1
const MIN_FILL_PERCENT = 0
const MAX_FILL_PERCENT = 100

function toNumericValue(
  value: number | string | readonly string[] | undefined,
  fallback: number,
): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : fallback
  }

  return fallback
}

function getFillPercentage(value: number, min: number, max: number): number {
  const range = max - min

  if (range <= 0) {
    return MIN_FILL_PERCENT
  }

  const rawPercentage = ((value - min) / range) * MAX_FILL_PERCENT
  return Math.min(MAX_FILL_PERCENT, Math.max(MIN_FILL_PERCENT, rawPercentage))
}

export function RangeSliderInput({
  min = DEFAULT_RANGE_MIN,
  max = DEFAULT_RANGE_MAX,
  step = DEFAULT_RANGE_STEP,
  value,
  disabled,
  className,
  containerClassName,
  trackClassName,
  fillClassName,
  ...props
}: RangeSliderInputProps) {
  const numericMin = toNumericValue(min, DEFAULT_RANGE_MIN)
  const numericMax = toNumericValue(max, DEFAULT_RANGE_MAX)
  const numericValue = toNumericValue(value, numericMin)
  const fillPercentage = getFillPercentage(numericValue, numericMin, numericMax)

  return (
    <div className={cn('relative w-full', containerClassName)}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div className={cn('h-2 rounded-full bg-secondary', trackClassName)}>
          <div
            aria-hidden="true"
            data-slider-fill="true"
            className={cn('h-full rounded-full bg-primary transition-[width]', fillClassName)}
            style={{ width: `${fillPercentage}%` }}
          />
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className={cn(
          'relative z-10 h-2 w-full appearance-none cursor-pointer bg-transparent accent-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent',
          '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:border-0',
          '[&::-moz-range-progress]:bg-transparent',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md',
          '[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:border-0',
          className,
        )}
        {...props}
      />
    </div>
  )
}
