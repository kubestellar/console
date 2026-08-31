import { Rocket, Loader2, Orbit, XCircle } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge'
import { CardControlsRow, CardSearchInput, CardPaginationFooter, CardEmptyState } from '../../lib/cards/CardComponents'
import { ApiKeyPromptModal } from './console-missions/shared'
import { useMissionsData } from './useMissionsData'
import { MissionRow } from './MissionsDisplay'

interface MissionsProps {
  config?: Record<string, unknown>
}

export function Missions(_props: MissionsProps) {
  const {
    t,
    STATUS_CONFIG,
    CLUSTER_STATUS_CONFIG,
    SORT_OPTIONS,
    DEP_ACTION_STYLES,
    activeMissions,
    completedMissions,
    expandedMissions,
    toggleMission,
    hideCompleted,
    setHideCompleted,
    clusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    orbitMissionsByProject,
    showKeyPrompt,
    dismissPrompt,
    goToSettings,
    handleDiagnose,
    handleRepair,
    items: visibleMissions,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: { search: localSearch, setSearch: setLocalSearch },
    sorting: { sortBy, setSortBy, sortDirection, setSortDirection },
    containerRef,
    containerStyle,
  } = useMissionsData()

  return (
    <div className="h-full flex flex-col">
      {/* Controls row: cluster filter + sort + limit */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          {activeMissions.length > 0 ? (
            <StatusBadge color="blue" size="xs">
              {activeMissions.length} active
            </StatusBadge>
          ) : (
            <span className="text-2xs text-muted-foreground">No active</span>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: clusterFilter.length,
            totalCount: availableClusters.length }}
          clusterFilter={{
            availableClusters,
            selectedClusters: clusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1 }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as Parameters<typeof setSortBy>[0]),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
          extra={
            completedMissions.length > 0 ? (
              <button
                onClick={() => setHideCompleted(!hideCompleted)}
                className="text-2xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {hideCompleted ? `Show done (${completedMissions.length})` : 'Hide done'}
              </button>
            ) : undefined
          }
          className="mb-0!"
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common:searchMissions', 'Search missions...')}
        className="mb-2 shrink-0"
      />

      {/* Mission list — scrollable */}
      {visibleMissions.length === 0 ? (
        <CardEmptyState
          icon={Rocket}
          title={t('cards:missionsCard.noMissionsFound')}
          message={localSearch || clusterFilter.length > 0
            ? 'Try adjusting your filters'
            : 'Deploy a workload to start a mission'}
        />
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto scroll-enhanced space-y-2" style={containerStyle}>
          {visibleMissions.map(mission => {
            const isActive = mission.status === 'launching' || mission.status === 'deploying'
            return (
              <MissionRow
                key={mission.id}
                mission={mission}
                isExpanded={expandedMissions.has(mission.id)}
                onToggle={() => toggleMission(mission.id)}
                isActive={isActive}
                onDiagnose={handleDiagnose}
                onRepair={handleRepair}
                orbitStatus={mission.status === 'orbit' ? orbitMissionsByProject.get(mission.workload.toLowerCase()) : undefined}
                statusConfig={STATUS_CONFIG}
                clusterStatusConfig={CLUSTER_STATUS_CONFIG}
                depActionStyles={DEP_ACTION_STYLES}
              />
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Status legend — pinned to bottom */}
      <div className="pt-2 border-t border-border shrink-0">
        <div className="flex items-center justify-center gap-3 text-2xs text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Rocket className="w-2.5 h-2.5 text-blue-400" /> Launch
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 text-yellow-400" /> Deploy
          </span>
          <span className="flex items-center gap-1">
            <Orbit className="w-2.5 h-2.5 text-green-400" /> Orbit
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5 text-red-400" /> Abort
          </span>
        </div>
      </div>

      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />
    </div>
  )
}
