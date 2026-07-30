import { ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { type KeyboardEvent, useState, useRef, useEffect } from 'react'
import { cn } from '../../lib/cn'
import { emitCardSortChanged, emitCardSortDirectionChanged, emitCardLimitChanged } from '../../lib/analytics'
import { useCardType } from '../cards/CardWrapper'
import { useKeyboardNav } from '../../hooks/useKeyboardNav'
import { Button } from './Button'

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
  const cardType = useCardType()
  const [limitOpen, setLimitOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const limitRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const shouldFocusSortOptionRef = useRef(false)
  const limitNav = useKeyboardNav({ selector: '[role="option"]:not([disabled])', orientation: 'vertical', onEscape: () => setLimitOpen(false) })
  const sortNav = useKeyboardNav({ selector: '[role="option"]:not([disabled])', orientation: 'vertical', onEscape: () => setSortOpen(false) })

  const toggleDirection = () => {
    if (onSortDirectionChange) {
      const newDir = sortDirection === 'asc' ? 'desc' : 'asc'
      onSortDirectionChange(newDir)
      emitCardSortDirectionChanged(newDir, cardType)
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

  useEffect(() => {
    if (!limitOpen) return
    limitNav.focusMatchingItem({ preferredSelector: '[role="option"][aria-selected="true"]' })
  }, [limitNav, limitOpen])

  useEffect(() => {
    if (!sortOpen || !shouldFocusSortOptionRef.current) return
    sortNav.focusMatchingItem({ preferredSelector: '[role="option"][aria-selected="true"]' })
    shouldFocusSortOptionRef.current = false
  }, [sortNav, sortOpen])

  const handleSortToggle = () => {
    const nextSortOpen = !sortOpen
    if (!nextSortOpen) {
      shouldFocusSortOptionRef.current = false
    }
    setSortOpen(nextSortOpen)
    setLimitOpen(false)
  }

  const handleSortTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      shouldFocusSortOptionRef.current = true
    }

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !sortOpen) {
      event.preventDefault()
      setSortOpen(true)
      setLimitOpen(false)
    }
  }

  const currentLimitLabel = LIMIT_OPTIONS.find(o => o.value === limit)?.label || '5'
  const currentSortLabel = sortOptions?.find(o => o.value === sortBy)?.label || sortBy

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Limit Dropdown */}
      {showLimit && onLimitChange && (
        <div ref={limitRef} className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setLimitOpen(!limitOpen); setSortOpen(false) }}
            onKeyDown={(event) => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !limitOpen) {
                event.preventDefault()
                setLimitOpen(true)
                setSortOpen(false)
              }
            }}
            aria-haspopup="listbox"
            aria-expanded={limitOpen}
            className="bg-secondary/50 hover:bg-secondary"
            iconRight={<ChevronDown className={cn('w-3 h-3 transition-transform', limitOpen && 'rotate-180')} />}
          >
            Show: {currentLimitLabel}
          </Button>
          {limitOpen && (
            <div
              ref={(node) => {
                limitNav.containerRef.current = node
              }}
              role="listbox"
              aria-label="Limit options"
              className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[80px] py-1"
              onKeyDown={limitNav.handleKeyDown}
            >
              {LIMIT_OPTIONS.map(option => (
                <Button
                  key={String(option.value)}
                  variant="ghost"
                  size="sm"
                  role="option"
                  aria-selected={limit === option.value}
                  onClick={() => { onLimitChange(option.value); setLimitOpen(false); emitCardLimitChanged(String(option.value), cardType) }}
                  className={cn(
                    'w-full justify-start px-3 py-1.5 text-xs',
                    limit === option.value ? 'text-primary bg-primary/10' : 'text-foreground'
                  )}
                  fullWidth
                >
                  {option.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sort Dropdown */}
      {showSort && sortOptions && sortOptions.length > 0 && onSortChange && (
        <div className="flex items-center gap-1">
          <div ref={sortRef} className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSortToggle}
              onKeyDown={handleSortTriggerKeyDown}
              aria-haspopup="listbox"
              aria-expanded={sortOpen}
              className="bg-secondary/50 hover:bg-secondary"
              iconRight={<ChevronDown className={cn('w-3 h-3 transition-transform', sortOpen && 'rotate-180')} />}
            >
              Sort: {currentSortLabel}
            </Button>
            {sortOpen && (
              <div
                ref={(node) => {
                  sortMenuRef.current = node
                  sortNav.containerRef.current = node
                }}
                role="listbox"
                aria-label="Sort options"
                className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[100px] py-1"
                onKeyDown={sortNav.handleKeyDown}
              >
                {sortOptions.map(option => (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="sm"
                    onClick={() => { onSortChange(option.value); setSortOpen(false); emitCardSortChanged(option.value, cardType) }}
                    role="option"
                    aria-selected={sortBy === option.value}
                    tabIndex={0}
                    className={cn(
                      'w-full justify-start px-3 py-1.5 text-xs',
                      sortBy === option.value ? 'text-primary bg-primary/10' : 'text-foreground'
                    )}
                    fullWidth
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {onSortDirectionChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDirection}
              className="p-1 bg-secondary/50 hover:bg-secondary"
              title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
              aria-label={sortDirection === 'asc' ? 'Sort ascending, click to sort descending' : 'Sort descending, click to sort ascending'}
              icon={sortDirection === 'asc' ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}
