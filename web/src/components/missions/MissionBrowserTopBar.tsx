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
}: MissionBrowserTopBarProps) {
  const searchPlaceholder =
    activeTab === 'installers'
      ? 'Search installers… (AND logic: "argo events" = argo AND events)'
      : activeTab === 'fixes'
        ? 'Search fixes…'
        : 'Search missions by name, tag, or description…'

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
      {/* Global search input */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/40"
          data-testid="mission-search"
          autoFocus
        />
      </div>

      {/* Filter toggle */}
      <button
        onClick={onToggleFilters}
        className={cn(
          'p-2 rounded-lg transition-colors relative',
          showFilters
            ? 'bg-purple-500/20 text-purple-400'
            : 'hover:bg-secondary text-muted-foreground hover:text-foreground',
        )}
        title="Toggle filters"
      >
        <Filter className="w-5 h-5" />
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center">
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
