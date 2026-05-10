/**
 * MissionBrowserTopBar
 *
 * The top control strip of the Mission Browser: global search input, filter
 * toggle button (with active-filter badge), grid/list view-mode toggle, and
 * close button.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { Search, Filter, Grid3X3, List, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { ViewMode, BrowserTab } from './browser'

interface MissionBrowserTopBarProps {
  searchQuery: string
  onSearchChange: (value: string) => void
  activeTab: BrowserTab
  showFilters: boolean
  onToggleFilters: () => void
  activeFilterCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onClose: () => void
  isSmallScreen: boolean
}

export function MissionBrowserTopBar({
  searchQuery,
  onSearchChange,
  activeTab,
  showFilters,
  onToggleFilters,
  activeFilterCount,
  viewMode,
  onViewModeChange,
  onClose,
  isSmallScreen,
}: MissionBrowserTopBarProps) {
  const { t } = useTranslation(['common'])
  const searchPlaceholder =
    activeTab === 'installers'
      ? 'Search installers… (AND logic: "argo events" = argo AND events)'
      : activeTab === 'fixes'
        ? 'Search fixes…'
        : activeTab === 'schedule'
          ? 'Search disabled on Schedule Action tab'
        : 'Search missions by name, tag, or description…'

  const filterLabel = showFilters
    ? t('missions.browser.hideFilters')
    : t('missions.browser.showFilters')

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-card border-b border-border sm:flex-nowrap">
      {/* Global search input */}
      <div className="relative w-full sm:flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          disabled={activeTab === 'schedule'}
          className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/40"
          data-testid="mission-search"
          autoFocus
        />
      </div>

      {/* Filter toggle */}
      <button
        onClick={onToggleFilters}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg transition-colors relative px-3 py-2',
          showFilters
            ? 'bg-purple-500/20 text-purple-400'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground',
        )}
        title={filterLabel}
        aria-label={filterLabel}
        aria-expanded={showFilters}
      >
        <Filter className="w-5 h-5 shrink-0" />
        {isSmallScreen && <span className="text-sm font-medium">{filterLabel}</span>}
        {activeFilterCount > 0 && (
          <span className={cn(
            'rounded-full bg-purple-500 text-white font-bold flex items-center justify-center',
            isSmallScreen ? 'min-w-5 h-5 px-1 text-[10px]' : 'absolute -top-1 -right-1 w-4 h-4 text-[9px]',
          )}>
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Grid / list view-mode toggle */}
      <div className="flex items-center border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => onViewModeChange('grid')}
          className={cn(
            'p-2 transition-colors',
            viewMode === 'grid'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground',
          )}
          title="Grid view"
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          className={cn(
            'p-2 transition-colors',
            viewMode === 'list'
              ? 'bg-purple-500/20 text-purple-400'
              : 'text-muted-foreground hover:text-foreground',
          )}
          title="List view"
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* Close button — right-aligned per #6308 to match BaseModal convention */}
      <button
        onClick={onClose}
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Close (Esc)"
        aria-label="Close mission browser"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
