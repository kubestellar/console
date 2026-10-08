import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { QUICK_LINKS, type SavedBookmark, type Tab } from './MobileBrowser.constants'

interface NewTabPageProps {
  bookmarks: SavedBookmark[]
  onNavigate: (url: string) => void
}

export function MobileBrowserNewTabPage({ bookmarks, onNavigate }: NewTabPageProps) {
  const { t } = useTranslation('cards')
  return (
    <div className="h-full p-4 overflow-auto">
      {/* Bookmarks */}
      {bookmarks.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">{t('mobileBrowser.favorites')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {bookmarks.slice(0, 8).map((bookmark, i) => (
              <button
                key={i}
                onClick={() => onNavigate(bookmark.url)}
                className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg">
                  {bookmark.title.charAt(0).toUpperCase()}
                </div>
                <span className="text-2xs text-gray-600 dark:text-muted-foreground truncate max-w-full">
                  {bookmark.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">{t('mobileBrowser.quickLinks')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.url}
              onClick={() => onNavigate(link.url)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-secondary flex items-center justify-center text-xl">
                {link.icon}
              </div>
              <span className="text-2xs text-gray-600 dark:text-muted-foreground truncate max-w-full">
                {link.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

interface TabSwitcherProps {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string, e: MouseEvent) => void
  onNewTab: () => void
  onClose: () => void
}

export function MobileBrowserTabSwitcher({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onClose,
}: TabSwitcherProps) {
  const { t } = useTranslation('cards')
  return (
    <div className="absolute inset-0 bg-gray-100 dark:bg-background z-30 p-4 overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-gray-700 dark:text-foreground">
          {t('mobileBrowser.tabsLabel', { count: tabs.length })}
        </span>
        <button
          onClick={onClose}
          className="text-blue-500 text-sm font-medium"
        >
          {t('mobileBrowser.done')}
        </button>
      </div>
      <div className="grid gap-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
              tab.id === activeTabId
                ? 'border-blue-500'
                : 'border-gray-200 dark:border-border'
            }`}
          >
            <div className="bg-white dark:bg-secondary p-3">
              <div className="flex flex-wrap items-center justify-between gap-y-2">
                <span className="text-xs font-medium text-gray-700 dark:text-foreground truncate">
                  {tab.title || t('mobileBrowser.newTab')}
                </span>
                <button
                  onClick={(e) => onCloseTab(tab.id, e)}
                  className="text-muted-foreground hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {tab.url && (
                <span className="text-2xs text-muted-foreground truncate block">
                  {tab.url}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={onNewTab}
        className="mt-4 w-full py-2 bg-gray-200 dark:bg-secondary rounded-lg text-sm text-gray-700 dark:text-foreground flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        {t('mobileBrowser.newTab')}
      </button>
    </div>
  )
}

interface BookmarksOverlayProps {
  bookmarks: SavedBookmark[]
  onOpenBookmark: (url: string) => void
  onRemoveBookmark: (index: number) => void
  onClose: () => void
}

export function MobileBrowserBookmarksOverlay({
  bookmarks,
  onOpenBookmark,
  onRemoveBookmark,
  onClose,
}: BookmarksOverlayProps) {
  const { t } = useTranslation('cards')
  return (
    <div className="absolute inset-0 bg-gray-100 dark:bg-background z-30 p-4 overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-gray-700 dark:text-foreground">
          {t('mobileBrowser.bookmarks')}
        </span>
        <button
          onClick={onClose}
          className="text-blue-500 text-sm font-medium"
        >
          {t('mobileBrowser.done')}
        </button>
      </div>
      {bookmarks.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          {t('mobileBrowser.noBookmarks')}
        </p>
      ) : (
        <div className="space-y-2">
          {bookmarks.map((bookmark, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 bg-white dark:bg-secondary rounded-lg"
            >
              <div className="w-8 h-8 rounded bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm">
                {bookmark.title.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onOpenBookmark(bookmark.url)}
                  className="text-left"
                >
                  <span className="text-xs font-medium text-gray-700 dark:text-foreground block truncate">
                    {bookmark.title}
                  </span>
                  <span className="text-2xs text-muted-foreground truncate block">
                    {bookmark.url}
                  </span>
                </button>
              </div>
              <button
                onClick={() => onRemoveBookmark(i)}
                className="text-red-500 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
