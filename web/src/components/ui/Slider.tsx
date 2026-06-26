import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { RangeSliderInput } from './RangeSliderInput'

interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text displayed above the slider */
  label?: ReactNode
  /** Unit text displayed next to the value (e.g., "ms") */
  unit?: string
  /** Custom formatter for displaying the value */
  formatValue?: (value: number) => string
  /** Min value */
  min?: number
  /** Max value */
  max?: number
  /** Step size */
  step?: number
}

export function Slider({
  label,
  unit = '',
  formatValue,
  value,
  onChange,
  min = 1000,
  max = 30000,
  step = 1000,
  disabled,
  className,
  ...props
}: SliderProps) {
  const id = useId()
  const displayValue =
    formatValue && typeof value === 'number'
      ? formatValue(value)
      : `${value}${unit}`

  return (
    <div className="w-full space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <span className="text-sm text-muted-foreground font-mono">
            {displayValue}
          </span>
        </div>
      )}
      <RangeSliderInput
        id={id}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className}
        {...props}
      />
    </div>
  )
}
