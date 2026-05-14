import { type InputHTMLAttributes, useId, useMemo } from 'react'
import { cn } from '../../lib/cn'

interface RangeSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Color of the filled track portion (Tailwind bg class) */
  fillColor?: string
}

/**
 * A range input with a visible fill track from the left edge to the thumb.
 * Wraps a native <input type="range"> with an absolutely positioned fill
 * overlay whose width dynamically reflects the current value as a percentage
 * of the range.
 */
export function RangeSlider({
  fillColor = 'bg-blue-500',
  value,
  min = 0,
  max = 100,
  className,
  ...props
}: RangeSliderProps) {
  const id = useId()

  const percentage = useMemo(() => {
    const numValue = typeof value === 'number' ? value : Number(value ?? min)
    const numMin = Number(min)
    const numMax = Number(max)
    if (numMax === numMin) return 0
    return ((numValue - numMin) / (numMax - numMin)) * 100
  }, [value, min, max])

  return (
    <div className="relative w-full">
      {/* Fill track */}
      <div
        className={cn('absolute top-1/2 left-0 h-2 rounded-full -translate-y-1/2 pointer-events-none', fillColor)}
        style={{ width: `${percentage}%` }}
        aria-hidden="true"
      />
      {/* Native range input */}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        className={cn(
          'relative w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:h-4',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-current',
          '[&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-webkit-slider-thumb]:relative',
          '[&::-webkit-slider-thumb]:z-10',
          '[&::-webkit-slider-thumb]:shadow-md',
          '[&::-moz-range-thumb]:w-4',
          '[&::-moz-range-thumb]:h-4',
          '[&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-current',
          '[&::-moz-range-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:border-0',
          '[&::-moz-range-thumb]:shadow-md',
          '[&::-moz-range-progress]:bg-current',
          '[&::-moz-range-progress]:rounded-full',
          className,
        )}
        {...props}
      />
    </div>
  )
}
