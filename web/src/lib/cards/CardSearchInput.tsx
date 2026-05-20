import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useCardType } from '../../components/cards/CardWrapper'
import { cn } from '../cn'
import { emitCardSearchUsed } from '../analytics'

export interface CardSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Debounce delay in ms. When set, onChange fires after the user stops typing. */
  debounceMs?: number
}

export function CardSearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  debounceMs }: CardSearchInputProps) {
  const cardType = useCardType()
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (newValue: string) => {
    setLocalValue(newValue)
    if (debounceMs && debounceMs > 0) {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onChange(newValue), debounceMs)
    } else {
      onChange(newValue)
    }
  }

  // Fire analytics when user finishes typing (on blur) to avoid per-keystroke spam
  const handleBlur = () => {
    const current = debounceMs ? localValue : value
    if (current.length > 0) {
      emitCardSearchUsed(current.length, cardType)
    }
  }

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), [])

  return (
    <div className={cn('relative mb-4 flex-1 min-w-[10rem] max-w-full', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="text"
        value={debounceMs ? localValue : value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-md bg-secondary py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/50"
      />
    </div>
  )
}
