import { memo } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../ui/Button'
import { useTranslation } from 'react-i18next'
import { RSS_DEMO_ACTIVE_FEED } from './demoData'
import { RSS_UI_STRINGS } from './strings'
import type { FeedConfig } from './types'

interface FeedFilterEditorProps {
  activeFeed?: FeedConfig
  tempIncludeTerms?: string
  tempExcludeTerms?: string
  onIncludeChange?: (value: string) => void
  onExcludeChange?: (value: string) => void
  onSave?: () => void
  onClear?: () => void
  onClose?: () => void
}

export const FeedFilterEditor = memo(function FeedFilterEditor({
  activeFeed = RSS_DEMO_ACTIVE_FEED,
  tempIncludeTerms = '',
  tempExcludeTerms = '',
  onIncludeChange = () => {},
  onExcludeChange = () => {},
  onSave = () => {},
  onClear = () => {},
  onClose = () => {},
}: FeedFilterEditorProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
    <div className="mb-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg shrink-0 max-h-36 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
        <span className="text-xs font-medium text-purple-300">{RSS_UI_STRINGS.filterPrefix} {activeFeed.name}</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-secondary text-muted-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="space-y-2">
        <div>
          <label className="text-2xs text-muted-foreground">{t('cards:rssFeed.includeDesc')}</label>
          <input
            type="text"
            value={tempIncludeTerms}
            onChange={(e) => onIncludeChange(e.target.value)}
            placeholder={RSS_UI_STRINGS.includeTermsPlaceholder}
            className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="text-2xs text-muted-foreground">{t('cards:rssFeed.excludeDesc')}</label>
          <input
            type="text"
            value={tempExcludeTerms}
            onChange={(e) => onExcludeChange(e.target.value)}
            placeholder={RSS_UI_STRINGS.excludeTermsPlaceholder}
            className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-hidden focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onSave}
            className="px-3 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
          >
            {t('cards:rssFeed.applyFilter')}
          </button>
          {activeFeed.filter && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onClear}
              className="rounded"
            >
              {t('cards:rssFeed.clearFilter')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})
