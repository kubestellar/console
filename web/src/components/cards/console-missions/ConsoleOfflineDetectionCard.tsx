// Modal safety: the ApiKeyPromptModal used here is the shared BaseModal-based
// prompt that already guards its own close behavior; no form state on this
// card can be lost to a backdrop click. Treat as closeOnBackdropClick={false}.
import { useState, useEffect, useRef, useCallback } from 'react'
import { TrendingUp, RefreshCw, Info, Sparkles, Layers, List } from 'lucide-react'
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
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import type { SortField } from './offlineDataTransforms'
import { SORT_OPTIONS } from './offlineDataTransforms'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { useTranslation } from 'react-i18next'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { POLL_INTERVAL_MS } from '../../../lib/constants/network'
import { useDemoMode } from '../../../hooks/useDemoMode'
import { useClusterFiltering } from '../../clusters/useClusterFiltering'

// Extracted subcomponents and helpers
import {
  type NodeData,
  buildOfflineDetectionCardLoadState,
} from './offlineDataTransforms'
import { UnifiedItemsList } from './UnifiedItemsList'
import { RootCauseAnalyzer } from './RootCauseAnalyzer'
import { AIAnalysisPanel } from './AIAnalysisPanel'
import { buildAnalysisMissionConfig } from './offlineAnalysis'
import {
  getNodesCache,
  subscribeToNodes,
  fetchAllNodes,
  OFFLINE_DETECTION_FAILURE_THRESHOLD,
} from './nodeCache'
import { useDetectionItems } from './useDetectionItems'

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
  const { settings: predictionSettings } = usePredictionSettings()
  const { predictions: aiPredictions, isAnalyzing, analyze: triggerAIAnalysis, isEnabled: aiEnabled } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()
  const THRESHOLDS = predictionSettings.thresholds

  // Node data from shared cache
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => getNodesCache())
  const [nodesLoading, setNodesLoading] = useState(() => !shouldUseDemoData && getNodesCache().length === 0)
  const [nodesRefreshing, setNodesRefreshing] = useState(false)
  const [nodesFailures, setNodesFailures] = useState(0)

  const cardLoadState = buildOfflineDetectionCardLoadState([
    {
      hasData: allNodes.length > 0,
      isLoading: !shouldUseDemoData && nodesLoading,
      isRefreshing: !shouldUseDemoData && nodesRefreshing,
      consecutiveFailures: shouldUseDemoData ? 0 : nodesFailures,
      isFailed: !shouldUseDemoData && nodesFailures >= OFFLINE_DETECTION_FAILURE_THRESHOLD,
    },
    {
      hasData: gpuNodes.length > 0,
      isLoading: gpuLoading,
      isRefreshing: gpuRefreshing,
      isDemoData: gpuDemoFallback,
      isFailed: gpuFailed,
      consecutiveFailures: gpuFailures,
    },
    {
      hasData: podIssues.length > 0,
      isLoading: podsLoading,
      isRefreshing: podsRefreshing,
      isDemoData: podsDemoFallback,
      isFailed: podsFailed,
      consecutiveFailures: podsFailures,
    },
  ], shouldUseDemoData || isDemoMode)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState(cardLoadState)

  // Subscribe to cache updates and fetch nodes
  useEffect(() => {
    if (shouldUseDemoData) return

    let isMounted = true
    const handleUpdate = (nodes: NodeData[]) => {
      if (!isMounted) return
      setAllNodes(nodes)
      setNodesLoading(false)
    }
    const unsubscribe = subscribeToNodes(handleUpdate)

    const refreshNodes = () => {
      if (!isMounted) return
      setNodesRefreshing(getNodesCache().length > 0)
      fetchAllNodes().then(result => {
        if (!isMounted) return
        setAllNodes(result.nodes)
        setNodesLoading(false)
        setNodesRefreshing(false)
        setNodesFailures(result.consecutiveFailures)
      }).catch(() => {
        if (!isMounted) return
        setNodesRefreshing(false)
      })
    }

    refreshNodes()
    const interval = setInterval(refreshNodes, POLL_INTERVAL_MS)
    return () => {
      isMounted = false
      unsubscribe()
      clearInterval(interval)
    }
  }, [shouldUseDemoData])

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

  // Card controls state
  const [search, setSearch] = useState('')
  const [localClusterFilter, setLocalClusterFilter] = useState<string[]>([])
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number | 'unlimited'>(5)
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const clusterFilterRef = useRef<HTMLDivElement>(null)

  // Close cluster dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(target)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [search, localClusterFilter, sortField])

  // Detection items hook — all data processing and derived values
  const detection = useDetectionItems({
    allNodes,
    gpuNodes,
    podIssues,
    globalFilteredClusters,
    clusters,
    selectedClusters,
    isAllClustersSelected,
    customFilter,
    selectedDistributions,
    isAllDistributionsSelected,
    THRESHOLDS,
    getPodRestartTrend,
    getClusterTrend,
    aiPredictions,
    aiEnabled,
    search,
    localClusterFilter,
    sortField,
    sortDirection,
    itemsPerPage,
    currentPage,
  })

  const {
    unifiedItems, sortedItems, paginatedItems, availableClustersForFilter,
    categorizedItems, filteredOfflineCount, filteredGpuCount, filteredPredictionCount,
    totalPredicted, criticalPredicted, aiPredictionCount, heuristicPredictionCount,
    effectivePerPage, totalPages, needsPagination,
    filteredTotalIssues, filteredTotalPredicted, filteredCriticalPredicted, filteredAIPredictionCount,
    rootCauseGroups, currentClusterIssueCount, firstCurrentIssueCluster, isFiltered,
    gpuIssues, predictedRisks,
  } = detection

  // Ensure current page is valid (#5762)
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages)
  }, [totalPages, currentPage])

  const toggleClusterFilter = useCallback((cluster: string) => {
    setLocalClusterFilter(prev => prev.includes(cluster) ? prev.filter(c => c !== cluster) : [...prev, cluster])
  }, [])

  const clearClusterFilter = useCallback(() => { setLocalClusterFilter([]) }, [])

  const toggleGroupExpand = useCallback((cause: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(cause)) next.delete(cause)
      else next.add(cause)
      return next
    })
  }, [])

  const runningMission = missions.find(m =>
    (m.title.includes('Analysis') || m.title.includes('Diagnose')) && m.status === 'running'
  )

  const doStartAnalysis = () => {
    const missionConfig = buildAnalysisMissionConfig({
      unifiedItems,
      categorizedItems: {
        offline: categorizedItems.offline,
        gpu: categorizedItems.gpu,
        prediction: categorizedItems.prediction,
      },
      gpuIssues,
      predictedRisks,
      filteredTotalIssues,
      filteredTotalPredicted,
      filteredCriticalPredicted,
      isFiltered,
    })
    startMission(missionConfig)
  }

  const handleStartAnalysis = () => checkKeyAndRun(doStartAnalysis)

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

      {/* Status Summary */}
      <div className="grid grid-cols-2 @md:grid-cols-3 gap-2 mb-4">
        <div
          className={cn(
            'p-2 rounded-lg border',
            currentClusterIssueCount > 0
              ? 'bg-red-500/10 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => { if (firstCurrentIssueCluster) drillToCluster(firstCurrentIssueCluster) }}
          title={currentClusterIssueCount > 0
            ? t('common:healthCheck.issuesTooltip', { count: currentClusterIssueCount })
            : t('cards:consoleOfflineDetection.allHealthy')}
        >
          <div className="text-xl font-bold text-foreground">{currentClusterIssueCount}</div>
          <div className={cn('text-2xs', currentClusterIssueCount > 0 ? 'text-red-400' : 'text-green-400')}>
            {t('common:common.issues', { defaultValue: 'Issues' })}
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            gpuIssues.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => { if (gpuIssues.length > 0 && gpuIssues[0]) drillToCluster(gpuIssues[0].cluster) }}
          title={gpuIssues.length > 0 ? `${gpuIssues.length} GPU issue${gpuIssues.length !== 1 ? 's' : ''} - Click to view` : 'All GPUs available'}
        >
          <div className="text-xl font-bold text-foreground">{gpuIssues.length}</div>
          <div className={cn('text-2xs', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            {t('cards:consoleOfflineDetection.gpuIssues')}
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            totalPredicted > 0 && aiEnabled && !isAnalyzing
              ? 'bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors'
              : totalPredicted > 0
                ? 'bg-blue-500/10 border-blue-500/20 cursor-default'
                : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={aiEnabled && !isAnalyzing ? () => triggerAIAnalysis() : undefined}
          title={`Predictive Failure Detection:\n\nHeuristic Rules (instant):\n Pods with ${THRESHOLDS.highRestartCount}+ restarts → likely to crash\n Clusters with >${THRESHOLDS.cpuPressure}% CPU → throttling risk\n Clusters with >${THRESHOLDS.memoryPressure}% memory → OOM risk\n GPU nodes at full capacity → no headroom\n\nAI Analysis (${aiEnabled ? `every ${predictionSettings.interval}m` : 'disabled'}):\n${aiEnabled ? '• Trend detection over time\n• Correlated failure patterns\n• Anomaly detection' : '• Enable in Settings > Predictions'}\n\n${totalPredicted > 0 ? `Current: ${heuristicPredictionCount} heuristic, ${aiPredictionCount} AI${criticalPredicted > 0 ? ` (${criticalPredicted} critical)` : ''}` : 'No predicted risks detected'}\n${aiEnabled ? '\nClick to run AI analysis now' : ''}`}
        >
          <div className="flex items-center gap-1">
            {aiPredictionCount > 0 ? (
              <Sparkles className="w-3 h-3 text-blue-400" />
            ) : (
              <TrendingUp className={cn('w-3 h-3', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')} />
            )}
            <span className="text-xl font-bold text-foreground">{totalPredicted}</span>
            {isAnalyzing && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
          </div>
          <div className={cn('text-2xs flex items-center gap-1', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')}>
            {t('cards:consoleOfflineDetection.predicted')}
            <Info className="w-3 h-3 opacity-60" />
          </div>
        </div>
      </div>

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
          onSortChange: (s) => setSortField(s as SortField),
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
          <div className="flex bg-secondary/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground')}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={cn('p-1.5 rounded transition-colors', viewMode === 'grouped' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground')}
              title="Group by root cause - see which fixes solve multiple issues"
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
          </div>
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
      />
    </div>
  )
}
