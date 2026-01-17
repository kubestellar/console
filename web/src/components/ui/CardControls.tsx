import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'

interface LimitOption {
  value: number | 'unlimited'
  label: string
}

const LIMIT_OPTIONS: LimitOption[] = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'unlimited', label: 'All' },
]

interface SortOption<T extends string = string> {
  value: T
  label: string
}

export type SortDirection = 'asc' | 'desc'

interface CardControlsProps<T extends string = string> {
  limit?: number | 'unlimited'
  onLimitChange?: (limit: number | 'unlimited') => void
  sortBy?: T
  sortOptions?: SortOption<T>[]
  onSortChange?: (sortBy: T) => void
  sortDirection?: SortDirection
  onSortDirectionChange?: (direction: SortDirection) => void
  className?: string
  showLimit?: boolean
  showSort?: boolean
}

export function CardControls<T extends string = string>({
  limit = 5,
  onLimitChange,
  sortBy,
  sortOptions,
  onSortChange,
  sortDirection = 'desc',
  onSortDirectionChange,
  className,
  showLimit = true,
  showSort = true,
}: CardControlsProps<T>) {
  const [limitOpen, setLimitOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const limitRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  const toggleDirection = () => {
    if (onSortDirectionChange) {
      onSortDirectionChange(sortDirection === 'asc' ? 'desc' : 'asc')
    }
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (limitRef.current && !limitRef.current.contains(event.target as Node)) {
        setLimitOpen(false)
      }
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentLimitLabel = LIMIT_OPTIONS.find(o => o.value === limit)?.label || '5'
  const currentSortLabel = sortOptions?.find(o => o.value === sortBy)?.label || sortBy

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Limit Dropdown */}
      {showLimit && onLimitChange && (
        <div ref={limitRef} className="relative">
          <button
            onClick={() => { setLimitOpen(!limitOpen); setSortOpen(false) }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Show: {currentLimitLabel}</span>
            <ChevronDown className={cn('w-3 h-3 transition-transform', limitOpen && 'rotate-180')} />
          </button>
          {limitOpen && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[80px] py-1">
              {LIMIT_OPTIONS.map(option => (
                <button
                  key={String(option.value)}
                  onClick={() => { onLimitChange(option.value); setLimitOpen(false) }}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs hover:bg-secondary/50 transition-colors',
                    limit === option.value ? 'text-primary bg-primary/10' : 'text-foreground'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sort Dropdown */}
      {showSort && sortOptions && sortOptions.length > 0 && onSortChange && (
        <div className="flex items-center gap-1">
          <div ref={sortRef} className="relative">
            <button
              onClick={() => { setSortOpen(!sortOpen); setLimitOpen(false) }}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Sort: {currentSortLabel}</span>
              <ChevronDown className={cn('w-3 h-3 transition-transform', sortOpen && 'rotate-180')} />
            </button>
            {sortOpen && (
              <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[100px] py-1">
                {sortOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => { onSortChange(option.value); setSortOpen(false) }}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-secondary/50 transition-colors',
                      sortBy === option.value ? 'text-primary bg-primary/10' : 'text-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {onSortDirectionChange && (
            <button
              onClick={toggleDirection}
              className="p-1 text-xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortDirection === 'asc' ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
