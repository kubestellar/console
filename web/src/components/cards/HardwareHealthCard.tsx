import { XCircle } from 'lucide-react'
import { HardwareHealthCardContent } from './HardwareHealthCardContent'
import { HardwareHealthCardHeader } from './HardwareHealthCardHeader'
import { useHardwareHealthCard } from './useHardwareHealthCard'

export function HardwareHealthCard() {
  const {
    clearAlertError,
    criticalCount,
    warningCount,
    deduplicatedNodeCount,
    viewMode,
    handleViewModeChange,
    tabListProps,
    getTabProps,
    getTabPanelProps,
    deduplicatedInventory,
    activeAlertCount,
    snoozedAlertCount,
    showSnoozed,
    setShowSnoozed,
    visibleAlertIds,
    snoozeAllMenuOpen,
    setSnoozeAllMenuOpen,
    snoozeMultiple,
    clearAllSnoozed,
    snoozeAllMenuRef,
    availableClustersForFilter,
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    itemsPerPage,
    setItemsPerPage,
    sortField,
    currentSortOptions,
    setSortField,
    sortDirection,
    setSortDirection,
    search,
    setSearch,
    fetchError,
    retryError,
    handleRetry,
    isRetrying,
    isRefreshing,
    shouldUseDemoData,
    isDemoFallback,
    paginatedAlerts,
    sortedAlerts,
    totalPages,
    needsPagination,
    paginatedInventory,
    sortedInventory,
    inventoryTotalPages,
    inventoryNeedsPagination,
    drillToNode,
    isSnoozed,
    unsnoozeAlert,
    getSnoozeRemaining,
    snoozeMenuOpen,
    setSnoozeMenuOpen,
    snoozeMenuRef,
    snoozeAlert,
    clearAlert,
    currentPage,
    effectivePerPage,
    setCurrentPage,
    lastUpdate,
  } = useHardwareHealthCard()

  return (
    <div className="h-full flex flex-col">
      {clearAlertError && (
        <div className="mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{clearAlertError}</span>
        </div>
      )}

      <HardwareHealthCardHeader
        criticalCount={criticalCount}
        warningCount={warningCount}
        deduplicatedNodeCount={deduplicatedNodeCount}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        tabListProps={tabListProps}
        getTabProps={getTabProps}
        deduplicatedInventoryCount={deduplicatedInventory.length}
        activeAlertCount={activeAlertCount}
        snoozedAlertCount={snoozedAlertCount}
        showSnoozed={showSnoozed}
        onToggleShowSnoozed={() => setShowSnoozed(!showSnoozed)}
        visibleAlertIds={visibleAlertIds}
        snoozeAllMenuOpen={snoozeAllMenuOpen}
        onToggleSnoozeAllMenu={() => setSnoozeAllMenuOpen(!snoozeAllMenuOpen)}
        onSnoozeAll={duration => {
          snoozeMultiple(visibleAlertIds, duration)
          setSnoozeAllMenuOpen(false)
        }}
        onClearAllSnoozed={() => {
          clearAllSnoozed()
          setSnoozeAllMenuOpen(false)
        }}
        snoozeAllMenuRef={snoozeAllMenuRef}
        availableClustersForFilter={availableClustersForFilter}
        localClusterFilter={localClusterFilter}
        toggleClusterFilter={toggleClusterFilter}
        clearClusterFilter={clearClusterFilter}
        showClusterFilter={showClusterFilter}
        setShowClusterFilter={setShowClusterFilter}
        clusterFilterRef={clusterFilterRef}
        itemsPerPage={itemsPerPage}
        setItemsPerPage={setItemsPerPage}
        sortField={sortField}
        currentSortOptions={currentSortOptions}
        setSortField={setSortField}
        sortDirection={sortDirection}
        setSortDirection={setSortDirection}
        search={search}
        setSearch={setSearch}
        fetchError={fetchError}
        retryError={retryError}
        handleRetry={handleRetry}
        isRetrying={isRetrying}
        isRefreshing={isRefreshing}
        isDemoData={shouldUseDemoData || isDemoFallback}
      />

      <HardwareHealthCardContent
        viewMode={viewMode}
        getTabPanelProps={getTabPanelProps}
        paginatedAlerts={paginatedAlerts}
        sortedAlerts={sortedAlerts}
        alertsTotalPages={totalPages}
        alertsNeedsPagination={needsPagination}
        paginatedInventory={paginatedInventory}
        sortedInventory={sortedInventory}
        inventoryTotalPages={inventoryTotalPages}
        inventoryNeedsPagination={inventoryNeedsPagination}
        search={search}
        localClusterFilter={localClusterFilter}
        drillToNode={drillToNode}
        isSnoozed={isSnoozed}
        unsnoozeAlert={unsnoozeAlert}
        getSnoozeRemaining={getSnoozeRemaining}
        snoozeMenuOpen={snoozeMenuOpen}
        setSnoozeMenuOpen={setSnoozeMenuOpen}
        snoozeMenuRef={snoozeMenuRef}
        snoozeAlert={snoozeAlert}
        clearAlert={clearAlert}
        currentPage={currentPage}
        effectivePerPage={effectivePerPage}
        setCurrentPage={setCurrentPage}
        isRefreshing={isRefreshing}
        isDemoFallback={isDemoFallback}
        lastUpdate={lastUpdate}
      />
    </div>
  )
}
