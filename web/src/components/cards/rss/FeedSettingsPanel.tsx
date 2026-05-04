import { memo } from 'react'
import { X, Star, Pencil } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { Button } from '../../ui/Button'
import { useTranslation } from 'react-i18next'
import { RSS_DEMO_FEEDS } from './demoData'
import { RSS_UI_STRINGS } from './strings'
import type { FeedConfig } from './types'
import { PRESET_FEEDS } from './constants'

interface FeedSettingsPanelProps {
  feeds?: FeedConfig[]
  activeFeedIndex?: number
  newFeedUrl?: string
  newFeedName?: string
  showAggregateCreator?: boolean
  editingAggregateIndex?: number | null
  aggregateName?: string
  selectedSourceUrls?: string[]
  aggregateIncludeTerms?: string
  aggregateExcludeTerms?: string
  onClose?: () => void
  onNewFeedUrlChange?: (value: string) => void
  onNewFeedNameChange?: (value: string) => void
  onAddCustomFeed?: () => void
  onAddPresetFeed?: (feed: FeedConfig) => void
  onSelectFeed?: (index: number) => void
  onEditAggregate?: (index: number) => void
  onRemoveFeed?: (index: number) => void
  onToggleAggregateCreator?: () => void
  onAggregateNameChange?: (value: string) => void
  onSelectedSourceUrlsChange?: (urls: string[]) => void
  onAggregateIncludeChange?: (value: string) => void
  onAggregateExcludeChange?: (value: string) => void
  onSaveAggregate?: () => void
  onCancelAggregateEdit?: () => void
}

export const FeedSettingsPanel = memo(function FeedSettingsPanel({
  feeds = RSS_DEMO_FEEDS,
  activeFeedIndex = 0,
  newFeedUrl = '',
  newFeedName = '',
  showAggregateCreator = false,
  editingAggregateIndex = null,
  aggregateName = '',
  selectedSourceUrls = [],
  aggregateIncludeTerms = '',
  aggregateExcludeTerms = '',
  onClose = () => {},
  onNewFeedUrlChange = () => {},
  onNewFeedNameChange = () => {},
  onAddCustomFeed = () => {},
  onAddPresetFeed = () => {},
  onSelectFeed = () => {},
  onEditAggregate = () => {},
  onRemoveFeed = () => {},
  onToggleAggregateCreator = () => {},
  onAggregateNameChange = () => {},
  onSelectedSourceUrlsChange = () => {},
  onAggregateIncludeChange = () => {},
  onAggregateExcludeChange = () => {},
  onSaveAggregate = () => {},
  onCancelAggregateEdit = () => {},
}: FeedSettingsPanelProps) {
  const { t } = useTranslation(['cards', 'common'])
  const nonAggregateFeeds = feeds.filter(f => !f.isAggregate)

  return (
    <div className="absolute inset-x-3 top-16 bottom-3 p-3 bg-card border border-border rounded-lg shadow-lg z-40 flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <span className="text-sm font-medium">{t('cards:rssFeed.manageFeeds')}</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Add custom feed */}
      <div className="space-y-2 mb-3">
        <input
          type="text"
          value={newFeedUrl}
          onChange={(e) => onNewFeedUrlChange(e.target.value)}
          placeholder={RSS_UI_STRINGS.feedUrlPlaceholder}
          className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={newFeedName}
            onChange={(e) => onNewFeedNameChange(e.target.value)}
            placeholder={RSS_UI_STRINGS.feedNamePlaceholder}
            className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={onAddCustomFeed}
            disabled={!newFeedUrl.trim()}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {t('common:common.add')}
          </button>
        </div>
        <p className="text-2xs text-muted-foreground">
          {RSS_UI_STRINGS.feedExamples}
        </p>
      </div>

      {/* Current feeds (favorites) */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-2">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span className="text-xs text-muted-foreground">{t('cards:rssFeed.yourSavedFeeds')} ({feeds.length}):</span>
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {feeds.map((feed, idx) => (
            <div
              key={feed.url}
              className={cn(
                "flex flex-wrap items-center justify-between gap-y-2 px-2 py-1.5 rounded transition-colors",
                idx === activeFeedIndex
                  ? "bg-primary/20 border border-primary/30"
                  : "bg-secondary/30 hover:bg-secondary/50"
              )}
            >
              <button
                onClick={() => onSelectFeed(idx)}
                className="flex-1 text-xs flex items-center gap-2 truncate text-left"
              >
                <span>{feed.icon || '📰'}</span>
                <span className={idx === activeFeedIndex ? 'text-primary font-medium' : ''}>{feed.name}</span>
                {feed.isAggregate && <span className="text-[9px] text-purple-400">{RSS_UI_STRINGS.aggregateBadge}</span>}
              </button>
              <div className="flex items-center">
                {feed.isAggregate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditAggregate(idx)
                    }}
                    className="p-1 text-muted-foreground hover:text-purple-400"
                    title={RSS_UI_STRINGS.editAggregateTitle}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
                {feeds.length > 1 && (
                  <button
                    onClick={() => onRemoveFeed(idx)}
                    className="p-1 text-muted-foreground hover:text-red-400"
                    title={RSS_UI_STRINGS.removeFavoriteTitle}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preset feeds by category */}
      <div>
        <span className="text-xs text-muted-foreground block mb-2">{t('cards:rssFeed.popularFeeds')}:</span>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {/* Reddit */}
          <div>
            <span className="text-2xs text-muted-foreground/70 uppercase tracking-wide">{t('cards:rssFeed.reddit')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_FEEDS.filter(p => p.category === 'reddit' && !feeds.some(f => f.url === p.url)).slice(0, 8).map(preset => (
                <button
                  key={preset.url}
                  onClick={() => onAddPresetFeed(preset)}
                  className="px-2 py-0.5 text-2xs rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:bg-orange-500/20 transition-colors"
                >
                  {preset.icon} {preset.name.replace('r/', '')}
                </button>
              ))}
            </div>
          </div>
          {/* Tech News */}
          <div>
            <span className="text-2xs text-muted-foreground/70 uppercase tracking-wide">{t('cards:rssFeed.techNews')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_FEEDS.filter(p => p.category === 'tech-news' && !feeds.some(f => f.url === p.url)).slice(0, 10).map(preset => (
                <button
                  key={preset.url}
                  onClick={() => onAddPresetFeed(preset)}
                  className="px-2 py-0.5 text-2xs rounded-full bg-secondary/50 border border-border text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                >
                  {preset.icon} {preset.name}
                </button>
              ))}
            </div>
          </div>
          {/* Cloud Native */}
          <div>
            <span className="text-2xs text-muted-foreground/70 uppercase tracking-wide">{t('cards:rssFeed.cloudNative')}</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_FEEDS.filter(p => p.category === 'cloud-native' && !feeds.some(f => f.url === p.url)).map(preset => (
                <button
                  key={preset.url}
                  onClick={() => onAddPresetFeed(preset)}
                  className="px-2 py-0.5 text-2xs rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 transition-colors"
                >
                  {preset.icon} {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground/60 mt-2">
          {t('cards:rssFeed.redditTip')}
        </p>
      </div>

      {/* Create Aggregate Feed */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <button
          onClick={onToggleAggregateCreator}
          className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          <span>📚</span>
          {showAggregateCreator
            ? t('common:common.hide')
            : editingAggregateIndex !== null
              ? t('cards:rssFeed.editAggregateFeed')
              : t('cards:rssFeed.createAggregateFeed')}
        </button>

        {showAggregateCreator && (
          <div className="mt-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <input
              type="text"
              value={aggregateName}
              onChange={(e) => onAggregateNameChange(e.target.value)}
              placeholder={RSS_UI_STRINGS.aggregateNamePlaceholder}
              className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500 mb-2"
            />

            {/* Source feed selector */}
            <div className="mb-2">
              <div className="flex flex-wrap items-center justify-between gap-y-2">
                <label className="text-2xs text-muted-foreground">{t('cards:rssFeed.selectSourceFeeds')}:</label>
                <button
                  type="button"
                  onClick={() => {
                    const nonAggregateUrls = nonAggregateFeeds.map(f => f.url)
                    if (selectedSourceUrls.length === nonAggregateUrls.length) {
                      onSelectedSourceUrlsChange([])
                    } else {
                      onSelectedSourceUrlsChange(nonAggregateUrls)
                    }
                  }}
                  className="text-2xs text-purple-400 hover:text-purple-300"
                >
                  {selectedSourceUrls.length === nonAggregateFeeds.length ? t('cards:rssFeed.deselectAll') : t('common:common.selectAll')}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
                {nonAggregateFeeds.map(feed => (
                  <label
                    key={feed.url}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-secondary/30 p-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSourceUrls.includes(feed.url)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedSourceUrlsChange([...selectedSourceUrls, feed.url])
                        } else {
                          onSelectedSourceUrlsChange(selectedSourceUrls.filter(u => u !== feed.url))
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span>{feed.icon || '📰'}</span>
                    <span className="truncate">{feed.name}</span>
                  </label>
                ))}
                {nonAggregateFeeds.length === 0 && (
                  <span className="text-2xs text-muted-foreground">{t('cards:rssFeed.addFeedsFirst')}</span>
                )}
              </div>
            </div>

            {/* Include/Exclude terms */}
            <div className="space-y-2 mb-2">
              <div>
                <label className="text-2xs text-muted-foreground">{t('cards:rssFeed.includeTerms')}</label>
                <input
                  type="text"
                  value={aggregateIncludeTerms}
                  onChange={(e) => onAggregateIncludeChange(e.target.value)}
                  placeholder={RSS_UI_STRINGS.aggregateIncludePlaceholder}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="text-2xs text-muted-foreground">{t('cards:rssFeed.excludeTerms')}</label>
                <input
                  type="text"
                  value={aggregateExcludeTerms}
                  onChange={(e) => onAggregateExcludeChange(e.target.value)}
                  placeholder={RSS_UI_STRINGS.aggregateExcludePlaceholder}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onSaveAggregate}
                disabled={!aggregateName.trim() || selectedSourceUrls.length === 0}
                className="flex-1 px-3 py-1.5 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingAggregateIndex !== null ? t('common:common.update') : t('common:common.create')} {RSS_UI_STRINGS.aggregateLabel} ({selectedSourceUrls.length} {RSS_UI_STRINGS.sourcesLabel})
              </button>
              {editingAggregateIndex !== null && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onCancelAggregateEdit}
                  className="rounded"
                >
                  {t('common:common.cancel')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
