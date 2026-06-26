import { memo, useEffect, useRef } from 'react'
import { ChevronDown, Plus, Filter } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { RSS_DEMO_FEEDS, RSS_DEMO_ITEMS } from './demoData'
import { RSS_UI_STRINGS } from './strings'
import type { FeedConfig } from './types'

interface FeedSelectorProps {
  feeds?: FeedConfig[]
  activeFeedIndex?: number
  showFeedSelector?: boolean
  totalItems?: number
  onToggleSelector?: () => void
  onSelectFeed?: (index: number) => void
  onOpenSettings?: () => void
}

export const FeedSelector = memo(function FeedSelector({
  feeds = RSS_DEMO_FEEDS,
  activeFeedIndex = 0,
  showFeedSelector = false,
  totalItems = RSS_DEMO_ITEMS.length,
  onToggleSelector = () => {},
  onSelectFeed = () => {},
  onOpenSettings = () => {},
}: FeedSelectorProps) {
  const { t } = useTranslation(['cards', 'common'])
  const activeFeed = feeds[activeFeedIndex] || feeds[0]
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const pendingFocusIndexRef = useRef<number | null>(null)

  useEffect(() => {
    if (!showFeedSelector) return
    const nextIndex = pendingFocusIndexRef.current ?? activeFeedIndex
    const target = optionRefs.current[nextIndex] ?? optionRefs.current[0]
    pendingFocusIndexRef.current = null
    if (target) requestAnimationFrame(() => target.focus())
  }, [showFeedSelector, activeFeedIndex])

  const focusOption = (index: number) => {
    optionRefs.current[Math.max(0, Math.min(index, feeds.length - 1))]?.focus()
  }

  const openSelector = (index: number) => {
    pendingFocusIndexRef.current = Math.max(0, Math.min(index, feeds.length - 1))
    if (!showFeedSelector) onToggleSelector()
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      {/* Feed Selector Dropdown */}
      <div className="relative">
        <button
          onClick={onToggleSelector}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openSelector(activeFeedIndex)
            } else if (e.key === 'ArrowUp' || e.key === 'End') {
              e.preventDefault()
              openSelector(feeds.length - 1)
            } else if (e.key === 'Home') {
              e.preventDefault()
              openSelector(0)
            }
          }}
          aria-haspopup="listbox"
          aria-expanded={showFeedSelector}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
        >
          <span>{activeFeed?.icon || '📰'}</span>
          <span className="truncate max-w-[150px]">{activeFeed?.name || RSS_UI_STRINGS.selectFeed}</span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', showFeedSelector && 'rotate-180')} />
        </button>

        {showFeedSelector && (
          <div
            role="listbox"
            aria-label={t('cards:rssFeed.selectFeed', 'Select feed')}
            className="absolute top-full left-0 mt-1 w-56 max-h-64 overflow-y-auto bg-card border border-border rounded-lg shadow-lg z-50"
            onKeyDown={(e) => {
              const currentIndex = optionRefs.current.findIndex(option => option === document.activeElement)
              if (e.key === 'Escape') {
                e.preventDefault()
                onToggleSelector()
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
                focusOption(feeds.length - 1)
              }
            }}
          >
            <div className="p-1">
              {feeds.map((feed, idx) => (
                <button
                  key={feed.url}
                  ref={node => { optionRefs.current[idx] = node }}
                  onClick={() => onSelectFeed(idx)}
                  role="option"
                  aria-selected={idx === activeFeedIndex}
                  tabIndex={idx === activeFeedIndex ? 0 : -1}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors',
                    idx === activeFeedIndex
                      ? 'bg-primary/20 text-primary'
                      : 'hover:bg-secondary text-foreground'
                  )}
                >
                  <span>{feed.icon || '📰'}</span>
                  <span className="truncate">{feed.name}</span>
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={onOpenSettings}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-secondary rounded"
                >
                  <Plus className="w-4 h-4" />
                  {t('cards:rssFeed.addFeed')}...
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Count badge */}
      <span className="text-sm font-medium text-muted-foreground">
        {totalItems} {t('cards:rssFeed.items')}
      </span>
    </div>
  )
})

interface FeedPillsProps {
  feeds?: FeedConfig[]
  activeFeedIndex?: number
  onSelectFeed?: (index: number) => void
}

export const FeedPills = memo(function FeedPills({
  feeds = RSS_DEMO_FEEDS,
  activeFeedIndex = 0,
  onSelectFeed = () => {},
}: FeedPillsProps) {
  if (feeds.length <= 1) return null

  return (
    <div className="flex items-center gap-1 mb-2 overflow-x-auto scrollbar-thin shrink-0 h-6">
      {feeds.map((feed, idx) => (
        <button
          key={feed.url}
          onClick={() => onSelectFeed(idx)}
          className={cn(
            'flex items-center gap-1 px-2 py-0.5 text-2xs rounded-full whitespace-nowrap transition-colors shrink-0',
            idx === activeFeedIndex
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent'
          )}
        >
          <span>{feed.icon || '📰'}</span>
          <span className="max-w-[80px] truncate">{feed.name}</span>
          {feed.filter && <Filter className="w-2.5 h-2.5 text-purple-400" />}
        </button>
      ))}
    </div>
  )
})
