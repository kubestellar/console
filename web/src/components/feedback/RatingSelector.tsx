import type { KeyboardEvent, ReactNode } from 'react'

export interface RatingSelectorOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  rightContent?: ReactNode
  activeClassName: string
  inactiveClassName: string
  activeRingClassName?: string
}

interface RatingSelectorProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: RatingSelectorOption<T>[]
  ariaLabel: string
  className?: string
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function RatingSelector<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
  onKeyDown,
}: RatingSelectorProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={className}
      onKeyDown={onKeyDown}
    >
      {(options || []).map(option => {
        const isSelected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            data-radio-value={option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors focus-visible:outline-none ${option.activeRingClassName || ''} ${
              isSelected ? option.activeClassName : option.inactiveClassName
            }`}
          >
            {option.icon}
            <span className="text-sm font-medium">{option.label}</span>
            {option.rightContent}
          </button>
        )
      })}
    </div>
  )
}
