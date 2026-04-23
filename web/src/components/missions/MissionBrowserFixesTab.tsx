/**
 * MissionBrowserFixesTab
 *
 * Content panel for the "Fixes" tab inside the Mission Browser.
 * Renders: search input, type filter, fetch-error banner, and a virtualised
 * grid/list of FixerCard items.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { Search, Filter, Loader2 } from 'lucide-react'
import { FixerCard } from './FixerCard'
import { EmptyState, MissionFetchErrorBanner, VirtualizedMissionGrid } from './browser'
import type { ViewMode } from './browser'
import type { MissionExport } from '../../lib/missions/types'
import { CATEGORY_FILTERS } from './missionBrowserConstants'

interface MissionBrowserFixesTabProps {
  fixerMissions: MissionExport[]
  filteredFixers: MissionExport[]
  loadingFixers: boolean
  missionFetchError: string | null

  fixerSearch: string
  onFixerSearchChange: (value: string) => void
  /** When the user types in the tab-local search but a global search is also active */
  globalSearchActive: boolean
  globalSearchQuery: string

  fixerTypeFilter: string
  onFixerTypeFilterChange: (value: string) => void

  viewMode: ViewMode
  onSelectMission: (mission: MissionExport) => void
  onImportMission: (mission: MissionExport) => void
  onCopyLink: (mission: MissionExport, e: React.MouseEvent) => void
}

export function MissionBrowserFixesTab({
  fixerMissions,
  filteredFixers,
  loadingFixers,
  missionFetchError,
  fixerSearch,
  onFixerSearchChange,
  globalSearchActive,
  globalSearchQuery,
  fixerTypeFilter,
  onFixerTypeFilterChange,
  viewMode,
  onSelectMission,
  onImportMission,
  onCopyLink,
}: MissionBrowserFixesTabProps) {
  return (
    <div className="space-y-4">
      {/* Fixer filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={fixerSearch}
            onChange={(e) => onFixerSearchChange(e.target.value)}
            placeholder="Search fixes…"
            className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/40"
          />
        </div>
        {!fixerSearch && globalSearchActive && (
          <span className="text-xs text-purple-400 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Filtered by global search: &quot;{globalSearchQuery}&quot;
          </span>
        )}
        <select
          value={fixerTypeFilter}
          onChange={(e) => onFixerTypeFilterChange(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
        >
          {CATEGORY_FILTERS.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'All' ? 'All Types' : cat}
            </option>
          ))}
        </select>
      </div>

      {/* Fetch error banner */}
      {missionFetchError && fixerMissions.length === 0 && (
        <MissionFetchErrorBanner message={missionFetchError} />
      )}

      {/* Fixer grid */}
      {loadingFixers && filteredFixers.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          Loading fixes…
        </div>
      ) : filteredFixers.length === 0 && !loadingFixers ? (
        <EmptyState
          message={
            fixerMissions.length > 0 ? 'No fixes match your filters' : 'No fixer missions found'
          }
        />
      ) : (
        <>
          {loadingFixers && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              Loading… {fixerMissions.length} found so far
            </div>
          )}
          <VirtualizedMissionGrid
            items={filteredFixers}
            viewMode={viewMode}
            maxColumns={3}
            className="flex-1 h-[calc(90vh-280px)]"
            renderItem={(mission) => (
              <FixerCard
                mission={mission}
                compact={viewMode === 'list'}
                onSelect={() => onSelectMission(mission)}
                onImport={() => onImportMission(mission)}
                onCopyLink={(e) => onCopyLink(mission, e)}
              />
            )}
          />
        </>
      )}

      {/* Count footer */}
      {filteredFixers.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          {loadingFixers
            ? `${filteredFixers.length} loaded…`
            : `Showing ${filteredFixers.length} of ${fixerMissions.length} fixer missions`}
        </p>
      )}
    </div>
  )
}
