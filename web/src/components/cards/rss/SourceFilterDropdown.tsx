import { memo, useRef, useEffect } from 'react'
import { Rss, ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { RSS_DEMO_SOURCE_INFO } from './demoData'
import { RSS_UI_STRINGS } from './strings'

interface SourceInfo {
  url: string
  name: string
  icon: string
}

interface SourceFilterDropdownProps {
  availableSources?: SourceInfo[]
  sourceFilter?: string[]
  showSourceFilter?: boolean
  onToggle?: () => void
  onSetFilter?: (filter: string[]) => void
  onClose?: () => void
}

export const SourceFilterDropdown = memo(function SourceFilterDropdown({
  availableSources = RSS_DEMO_SOURCE_INFO,
  sourceFilter = [],
  showSourceFilter = false,
  onToggle = () => {},
  onSetFilter = () => {},
  onClose = () => {},
}: SourceFilterDropdownProps) {
  const { t } = useTranslation(['cards', 'common'])
  const sourceFilterRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pendingFocusIndexRef = useRef<number | null>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sourceFilterRef.current && !sourceFilterRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    if (showSourceFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSourceFilter, onClose])

  useEffect(() => {
    if (!showSourceFilter) return
    const selectedIndex = sourceFilter.length === 0
      ? 0
      : Math.max(1, availableSources.findIndex(source => sourceFilter.includes(source.url)) + 1)
    const nextIndex = pendingFocusIndexRef.current ?? selectedIndex
    const target = optionRefs.current[nextIndex] ?? optionRefs.current[0]
    pendingFocusIndexRef.current = null
    if (target) requestAnimationFrame(() => target.focus())
  }, [availableSources, showSourceFilter, sourceFilter])

  const focusOption = (index: number) => {
    optionRefs.current[Math.max(0, Math.min(index, availableSources.length))]?.focus()
  }

  const openDropdown = (index: number) => {
    pendingFocusIndexRef.current = Math.max(0, Math.min(index, availableSources.length))
    if (!showSourceFilter) onToggle()
  }

  return (
    <div ref={sourceFilterRef} className="relative">
      <button
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openDropdown(0)
          } else if (e.key === 'ArrowUp' || e.key === 'End') {
            e.preventDefault()
            openDropdown(availableSources.length)
          } else if (e.key === 'Home') {
            e.preventDefault()
            openDropdown(0)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={showSourceFilter}
        className={cn(
          'flex items-center gap-1 px-2 py-0.5 text-2xs rounded border transition-colors',
          sourceFilter.length > 0
            ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
            : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground'
        )}
        title={RSS_UI_STRINGS.sourceFilterTitle}
      >
        <Rss className="w-3 h-3" />
        {sourceFilter.length > 0 ? `${sourceFilter.length}/${availableSources.length}` : t('cards:rssFeed.sources')}
        <ChevronDown className={cn('w-3 h-3 transition-transform', showSourceFilter && 'rotate-180')} />
      </button>

      {showSourceFilter && (
        <div
          role="listbox"
          aria-label={t('cards:rssFeed.sources')}
          className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50"
          onKeyDown={(e) => {
            const currentIndex = optionRefs.current.findIndex(option => option === document.activeElement)
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              focusOption(currentIndex < 0 ? 0 : currentIndex + 1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              focusOption(currentIndex <= 0 ? 0 : currentIndex - 1)
            } else if (e.key === 'Home') {
              e.preventDefault()
              focusOption(0)
            } else if (e.key === 'End') {
              e.preventDefault()
              focusOption(availableSources.length)
            }
          }}
        >
          <div className="p-1">
            <button
              ref={node => { optionRefs.current[0] = node }}
              onClick={() => onSetFilter([])}
              role="option"
              aria-selected={sourceFilter.length === 0}
              tabIndex={sourceFilter.length === 0 ? 0 : -1}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded transition-colors',
                sourceFilter.length === 0 ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-secondary text-foreground'
              )}
            >
              {t('cards:rssFeed.allSources')} ({availableSources.length})
            </button>
            <div className="border-t border-border my-1" />
            {availableSources.map((source, index) => (
              <button
                key={source.url}
                ref={node => { optionRefs.current[index + 1] = node }}
                onClick={() => {
                  onSetFilter(
                    sourceFilter.includes(source.url)
                      ? sourceFilter.filter(u => u !== source.url)
                      : [...sourceFilter, source.url]
                  )
                }}
                role="option"
                aria-selected={sourceFilter.includes(source.url)}
                tabIndex={sourceFilter.includes(source.url) ? 0 : -1}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded transition-colors',
                  sourceFilter.includes(source.url) ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-secondary text-foreground'
                )}
              >
                <span title={source.name}>{source.icon}</span>
                <span className="truncate">{source.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
