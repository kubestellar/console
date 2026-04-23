/**
 * MissionBrowserInstallersTab
 *
 * Content panel for the "Installers" tab inside the Mission Browser.
 * Renders: search input, category/maturity filters, fetch-error banner,
 * and a virtualised grid/list of InstallerCard items.
 *
 * Extracted from MissionBrowser.tsx (issue #8624).
 */

import { Search, Filter, Loader2 } from 'lucide-react'
import { InstallerCard } from './InstallerCard'
import { EmptyState, MissionFetchErrorBanner, VirtualizedMissionGrid } from './browser'
import type { ViewMode } from './browser'
import type { MissionExport } from '../../lib/missions/types'
import { CNCF_CATEGORIES, MATURITY_LEVELS } from './missionBrowserConstants'

interface MissionBrowserInstallersTabProps {
  installerMissions: MissionExport[]
  filteredInstallers: MissionExport[]
  loadingInstallers: boolean
  missionFetchError: string | null

  installerSearch: string
  onInstallerSearchChange: (value: string) => void
  /** When the user types in the tab-local search but a global search is active */
  globalSearchActive: boolean
  globalSearchQuery: string

  installerCategoryFilter: string
  onInstallerCategoryFilterChange: (value: string) => void

  installerMaturityFilter: string
  onInstallerMaturityFilterChange: (value: string) => void

  viewMode: ViewMode
  onSelectMission: (mission: MissionExport) => void
  onImportMission: (mission: MissionExport) => void
  onCopyLink: (mission: MissionExport, e: React.MouseEvent) => void
}

export function MissionBrowserInstallersTab({
  installerMissions,
  filteredInstallers,
  loadingInstallers,
  missionFetchError,
  installerSearch,
  onInstallerSearchChange,
  globalSearchActive,
  globalSearchQuery,
  installerCategoryFilter,
  onInstallerCategoryFilterChange,
  installerMaturityFilter,
  onInstallerMaturityFilterChange,
  viewMode,
  onSelectMission,
  onImportMission,
  onCopyLink,
}: MissionBrowserInstallersTabProps) {
  return (
    <div className="space-y-4">
      {/* Installer filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={installerSearch}
            onChange={(e) => onInstallerSearchChange(e.target.value)}
            placeholder="Search installers…"
            className="w-full pl-10 pr-4 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-purple-500/40"
          />
        </div>
        {!installerSearch && globalSearchActive && (
          <span className="text-xs text-purple-400 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Filtered by global search: &quot;{globalSearchQuery}&quot;
          </span>
        )}
        <select
          value={installerCategoryFilter}
          onChange={(e) => onInstallerCategoryFilterChange(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
        >
          {CNCF_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat === 'All' ? 'All Categories' : cat}
            </option>
          ))}
        </select>
        <select
          value={installerMaturityFilter}
          onChange={(e) => onInstallerMaturityFilterChange(e.target.value)}
          className="px-2.5 py-1.5 text-xs bg-secondary border border-border rounded-lg text-foreground"
        >
          {MATURITY_LEVELS.map((m) => (
            <option key={m} value={m}>
              {m === 'All' ? 'All Maturity' : m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Fetch error banner */}
      {missionFetchError && installerMissions.length === 0 && (
        <MissionFetchErrorBanner message={missionFetchError} />
      )}

      {/* Installer grid */}
      {loadingInstallers && filteredInstallers.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          Loading CNCF installers…
        </div>
      ) : filteredInstallers.length === 0 && !loadingInstallers ? (
        <EmptyState
          message={
            installerMissions.length > 0
              ? 'No installers match your filters'
              : 'No installer missions found'
          }
        />
      ) : (
        <>
          {loadingInstallers && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
              Loading… {installerMissions.length} found so far
            </div>
          )}
          <VirtualizedMissionGrid
            items={filteredInstallers}
            viewMode={viewMode}
            maxColumns={4}
            className="flex-1 h-[calc(90vh-280px)]"
            renderItem={(mission) => (
              <InstallerCard
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
      {filteredInstallers.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          {loadingInstallers
            ? `${filteredInstallers.length} loaded…`
            : `Showing ${filteredInstallers.length} of ${installerMissions.length} installer missions`}
        </p>
      )}
    </div>
  )
}
