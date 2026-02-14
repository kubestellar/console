import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface CardSearchProps {
  /** Current search value */
  value: string
  /** Callback when search value changes (debounced) */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Additional class names */
  className?: string
  /** Debounce delay in ms (default: 300) */
  debounceMs?: number
  /** Whether to show expanded by default */
  defaultExpanded?: boolean
  /** Size variant */
  size?: 'sm' | 'md'
}

/**
 * Collapsible search input for card headers.
 * Shows as an icon by default, expands to full input on click.
 * Includes debouncing for performance.
 */
export function CardSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  debounceMs = 300,
  defaultExpanded = false,
  size = 'sm',
}: CardSearchProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || !!value)
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Sync local value with external value
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  const handleChange = (newValue: string) => {
    setLocalValue(newValue)

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Set new debounce timer
    debounceTimerRef.current = setTimeout(() => {
      onChange(newValue)
    }, debounceMs)
  }

  const handleClear = () => {
    setLocalValue('')
    onChange('')
    inputRef.current?.focus()
  }

  const handleBlur = () => {
    // Collapse if empty
    if (!localValue) {
      setIsExpanded(false)
    }
  }

  const sizeClasses = size === 'sm'
    ? 'h-6 text-xs px-2'
    : 'h-8 text-sm px-3'

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          'p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors',
          className
        )}
        title={t('common.search')}
      >
        <Search className={iconSize} />
      </button>
    )
  }

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search className={cn(iconSize, 'absolute left-2 text-muted-foreground pointer-events-none')} />
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          'w-28 rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20',
          'transition-all duration-200',
          sizeClasses,
          'pl-7 pr-7'
        )}
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 p-0.5 rounded hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
          title="Clear search"
        >
          <X className={cn(iconSize, 'w-3 h-3')} />
        </button>
      )}
    </div>
  )
}

/**
 * Hook to manage local card search state
 */
export function useCardSearch(initialValue = '') {
  const [searchQuery, setSearchQuery] = useState(initialValue)

  const filterBySearch = <T extends Record<string, unknown>>(
    items: T[],
    searchFields: (keyof T)[]
  ): T[] => {
    if (!searchQuery.trim()) return items

    const query = searchQuery.toLowerCase()
    return items.filter(item =>
      searchFields.some(field => {
        const value = item[field]
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query)
        }
        if (typeof value === 'number') {
          return value.toString().includes(query)
        }
        return false
      })
    )
  }

  return {
    searchQuery,
    setSearchQuery,
    filterBySearch,
    hasSearch: searchQuery.trim().length > 0,
  }
}
