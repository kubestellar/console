// Modal safety: the ApiKeyPromptModal used here is the shared BaseModal-based
// prompt that already guards its own close behavior; no form state on this
// card can be lost to a backdrop click. Treat as closeOnBackdropClick={false}.
import { useMemo } from 'react'
import { useCardDemoState } from '../CardDataContext'
import { useMissions } from '../../../hooks/useMissions'
import { useClusters } from '../../../hooks/useMCP'
import { useCachedPodIssues, useCachedGPUNodes } from '../../../hooks/useCachedData'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { usePredictionSettings } from '../../../hooks/usePredictionSettings'
import { useAIPredictions } from '../../../hooks/useAIPredictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { useMetricsHistory } from '../../../hooks/useMetricsHistory'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useClusterFiltering } from '../../clusters/useClusterFiltering'

// Extracted subcomponents and helpers
import { SORT_OPTIONS } from './offlineDataTransforms'
import { UnifiedItemsList } from './UnifiedItemsList'
import { RootCauseAnalyzer } from './RootCauseAnalyzer'
import { AIAnalysisPanel } from './AIAnalysisPanel'
import { useOfflineDetection } from './useOfflineDetection'
import { OfflineStatusDisplay } from './OfflineStatusDisplay'
import { ViewModeToggle } from './ViewModeToggle'
import { useOfflineNodesData } from './useOfflineNodesData'
import { useOfflineCardLoadState } from './useOfflineCardLoadState'
import { useOfflineIssueDetection } from './useOfflineIssueDetection'
import { useUnifiedItemsState } from './useUnifiedItemsState'

// Card 4: AI Cluster Issue Predictor - Detect issues, predict failures, group by root cause
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { startMission, missions } = useMissions()
  const {
    nodes: gpuNodes,
    isLoading: gpuLoading,
    isRefreshing: gpuRefreshing,
    isDemoFallback: gpuDemoFallback,
    isFailed: gpuFailed,
    consecutiveFailures: gpuFailures,
  } = useCachedGPUNodes()
  const {
    issues: podIssues,
    isLoading: podsLoading,
    isRefreshing: podsRefreshing,
    isDemoFallback: podsDemoFallback,
    isFailed: podsFailed,
    consecutiveFailures: podsFailures,
  } = useCachedPodIssues()
  const { deduplicatedClusters: clusters } = useClusters()
  const {
    selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
  } = useGlobalFilters()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })
  const { isDemoMode } = useDemoMode()

  // Prediction hooks
  const { settings: predictionSettings } = usePredictionSettings()
  const { predictions: aiPredictions, isAnalyzing, analyze: triggerAIAnalysis, isEnabled: aiEnabled } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()

  // Get thresholds from settings
  const THRESHOLDS = predictionSettings.thresholds

  // Get all nodes from shared cache
  const { allNodes, nodesLoading, nodesRefreshing, nodesFailures } = useOfflineNodesData(shouldUseDemoData)

  const cardLoadState = useOfflineCardLoadState({
    shouldUseDemoData,
    isDemoMode,
    allNodesCount: allNodes.length,
    nodesLoading,
    nodesRefreshing,
    nodesFailures,
    gpuNodesCount: gpuNodes.length,
    gpuLoading,
    gpuRefreshing,
    gpuDemoFallback,
    gpuFailed,
    gpuFailures,
    podIssuesCount: podIssues.length,
    podsLoading,
    podsRefreshing,
    podsDemoFallback,
    podsFailed,
    podsFailures,
  })

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState(cardLoadState)

  const { globalFilteredClusters } = useClusterFiltering({
    clusters,
    filter: 'all',
    globalSelectedClusters: selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
    sortBy: 'name',
    sortAsc: true,
    customOrder: [],
  })

  // Filter nodes by global cluster filter
  const nodes = useMemo(() => {
    let result = allNodes

    if (!isAllClustersSelected) {
      result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        (n.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allNodes, isAllClustersSelected, selectedClusters, customFilter])

  const {
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    predictedRisks,
    unifiedItems,
    totalPredicted,
    criticalPredicted,
    aiPredictionCount,
    heuristicPredictionCount,
  } = useOfflineIssueDetection({
    nodes,
    globalFilteredClusters,
    gpuNodes,
    podIssues,
    clusters,
    selectedClusters,
    isAllClustersSelected,
    thresholds: THRESHOLDS,
    aiPredictions,
    aiEnabled,
    getClusterTrend,
    getPodRestartTrend,
    t,
  })

  const {
    search,
    setSearch,
    localClusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    viewMode,
    setViewMode,
    expandedGroups,
    clusterFilterRef,
    availableClustersForFilter,
    sortedItems,
    effectivePerPage,
    totalPages,
    needsPagination,
    paginatedItems,
    toggleClusterFilter,
    clearClusterFilter,
    categorizedItems,
    rootCauseGroups,
    toggleGroupExpand,
    filteredOfflineCount,
    filteredTotalIssues,
    filteredTotalPredicted,
    filteredCriticalPredicted,
    filteredAIPredictionCount,
    isFiltered,
  } = useUnifiedItemsState(unifiedItems)

  const runningMission = missions.find(m =>
    (m.title.includes('Analysis') || m.title.includes('Diagnose')) && m.status === 'running'
  )

  const {
    currentClusterIssueCount,
    firstCurrentIssueCluster,
    analysisMissionConfig,
  } = useOfflineDetection({
    offlineNodes,
    clusterHealthIssues,
    gpuIssues,
    predictedRisks,
    unifiedItems,
    categorizedItems: {
      offline: categorizedItems.offline,
      gpu: categorizedItems.gpu,
      prediction: categorizedItems.prediction,
    },
    filteredTotalIssues,
    filteredTotalPredicted,
    filteredCriticalPredicted,
    isFiltered,
  })

  const handleStartAnalysis = () => checkKeyAndRun(() => { startMission(analysisMissionConfig) })

  const isDemoData = gpuDemoFallback || podsDemoFallback || shouldUseDemoData || isDemoMode

  return (
    <div className="h-full flex flex-col relative">
      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="flex items-center justify-end mb-4">
      </div>

      <OfflineStatusDisplay
        currentClusterIssueCount={currentClusterIssueCount}
        firstCurrentIssueCluster={firstCurrentIssueCluster}
        gpuIssueCount={gpuIssues.length}
        firstGpuIssueCluster={gpuIssues[0]?.cluster || null}
        totalPredicted={totalPredicted}
        aiEnabled={aiEnabled}
        isAnalyzing={isAnalyzing}
        aiPredictionCount={aiPredictionCount}
        criticalPredicted={criticalPredicted}
        heuristicPredictionCount={heuristicPredictionCount}
        thresholds={THRESHOLDS}
        predictionIntervalMinutes={predictionSettings.interval}
        onDrillToCluster={drillToCluster}
        onTriggerAnalysis={triggerAIAnalysis}
        t={t}
      />

      {/* Card Controls: Search, Cluster Filter, Sort */}
      <CardControlsRow
        clusterFilter={{
          availableClusters: availableClustersForFilter.map(c => ({ name: c })),
          selectedClusters: localClusterFilter,
          onToggle: toggleClusterFilter,
          onClear: clearClusterFilter,
          isOpen: showClusterFilter,
          setIsOpen: setShowClusterFilter,
          containerRef: clusterFilterRef,
          minClusters: 1 }}
        clusterIndicator={localClusterFilter.length > 0 ? {
          selectedCount: localClusterFilter.length,
          totalCount: availableClustersForFilter.length } : undefined}
        cardControls={{
          limit: itemsPerPage,
          onLimitChange: setItemsPerPage,
          sortBy: sortField,
          sortOptions: SORT_OPTIONS,
          onSortChange: (s) => setSortField(s as typeof sortField),
          sortDirection,
          onSortDirectionChange: setSortDirection }}
      />

      {/* Search and View Mode Toggle */}
      <div className="flex items-center gap-2 mb-3">
        <CardSearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('common:common.searchIssues')}
          className="flex-1 mb-0!"
        />
        {rootCauseGroups.length > 0 && rootCauseGroups.some(g => g.items.length > 1) && (
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
      </div>

      {/* Items - List or Grouped View */}
      <div className="flex-1 space-y-1.5 overflow-y-auto mb-2">
        <DynamicCardErrorBoundary
          cardId="ConsoleOfflineDetectionAI"
          fallbackTitle={t('cards:consoleOfflineDetection.aiRenderErrorTitle')}
          fallbackMessage={t('cards:consoleOfflineDetection.aiRenderErrorDescription')}
        >
          {viewMode === 'grouped' ? (
            <RootCauseAnalyzer
              rootCauseGroups={rootCauseGroups}
              expandedGroups={expandedGroups}
              toggleGroupExpand={toggleGroupExpand}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              startMission={startMission as (config: { title: string; description: string; type: string; initialPrompt: string; context: Record<string, unknown> }) => void}
              isDemoData={isDemoData}
            />
          ) : (
            <UnifiedItemsList
              paginatedItems={paginatedItems}
              sortedItemsLength={sortedItems.length}
              search={search}
              localClusterFilter={localClusterFilter}
              drillToNode={drillToNode}
              drillToCluster={drillToCluster}
              getFeedback={getFeedback}
              submitFeedback={submitFeedback as (id: string, feedback: string, type: string, provider?: string) => void}
              isDemoData={isDemoData}
            />
          )}
        </DynamicCardErrorBoundary>
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={sortedItems.length}
        itemsPerPage={effectivePerPage}
        onPageChange={setCurrentPage}
        needsPagination={needsPagination}
      />

      {/* Action Button */}
      <AIAnalysisPanel
        filteredTotalIssues={filteredTotalIssues}
        filteredTotalPredicted={filteredTotalPredicted}
        filteredOfflineCount={filteredOfflineCount}
        filteredAIPredictionCount={filteredAIPredictionCount}
        isFiltered={isFiltered}
        runningMission={!!runningMission}
        onStartAnalysis={handleStartAnalysis}
        isDemoData={isDemoData}
      />
    </div>
  )
}
