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

  return (
    <div ref={sourceFilterRef} className="relative">
      <button
        onClick={onToggle}
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
        <div className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="p-1">
            <button
              onClick={() => onSetFilter([])}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded transition-colors',
                sourceFilter.length === 0 ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-secondary text-foreground'
              )}
            >
              {t('cards:rssFeed.allSources')} ({availableSources.length})
            </button>
            <div className="border-t border-border my-1" />
            {availableSources.map(source => (
              <button
                key={source.url}
                onClick={() => {
                  onSetFilter(
                    sourceFilter.includes(source.url)
                      ? sourceFilter.filter(u => u !== source.url)
                      : [...sourceFilter, source.url]
                  )
                }}
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
