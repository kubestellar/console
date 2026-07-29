// Modal safety: the ApiKeyPromptModal used here is the shared BaseModal-based
// prompt that already guards its own close behavior; no form state on this
// card can be lost to a backdrop click. Treat as closeOnBackdropClick={false}.
import { TrendingUp, RefreshCw, Info, Sparkles, Layers, List } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { CardControlsRow, CardSearchInput, CardPaginationFooter } from '../../../lib/cards/CardComponents'
import { DynamicCardErrorBoundary } from '../DynamicCardErrorBoundary'
import { UnifiedItemsList } from './UnifiedItemsList'
import { RootCauseAnalyzer } from './RootCauseAnalyzer'
import { AIAnalysisPanel } from './AIAnalysisPanel'
import { SORT_OPTIONS, type SortField } from './offlineDataTransforms'
import { useOfflineDetection } from './useOfflineDetection'

// Card 4: AI Cluster Issue Predictor - Detect issues, predict failures, group by root cause
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const {
    t,
    showKeyPrompt, dismissPrompt, goToSettings,
    drillToCluster, drillToNode,
    currentClusterIssueCount, firstCurrentIssueCluster,
    gpuIssues,
    totalPredicted, criticalPredicted, aiPredictionCount, heuristicPredictionCount,
    aiEnabled, isAnalyzing, triggerAIAnalysis, predictionSettings, THRESHOLDS,
    paginatedItems, sortedItems,
    availableClustersForFilter,
    search, setSearch,
    localClusterFilter, toggleClusterFilter, clearClusterFilter,
    showClusterFilter, setShowClusterFilter, clusterFilterRef,
    sortField, setSortField, sortDirection, setSortDirection,
    itemsPerPage, setItemsPerPage,
    currentPage, setCurrentPage,
    effectivePerPage, totalPages, needsPagination,
    viewMode, setViewMode,
    expandedGroups, toggleGroupExpand,
    rootCauseGroups,
    filteredOfflineCount, filteredAIPredictionCount,
    filteredTotalIssues, filteredTotalPredicted, filteredCriticalPredicted,
    isFiltered, runningMission, handleStartAnalysis,
    getFeedback, submitFeedback,
    startMission,
  } = useOfflineDetection()
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
          onClick={() => {
            if (firstCurrentIssueCluster) {
              drillToCluster(firstCurrentIssueCluster)
            }
          }}
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
          onClick={() => {
            if (gpuIssues.length > 0 && gpuIssues[0]) {
              drillToCluster(gpuIssues[0].cluster)
            }
          }}
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
          title={`Predictive Failure Detection:

Heuristic Rules (instant):
 Pods with ${THRESHOLDS.highRestartCount}+ restarts → likely to crash
 Clusters with >${THRESHOLDS.cpuPressure}% CPU → throttling risk
 Clusters with >${THRESHOLDS.memoryPressure}% memory → OOM risk
 GPU nodes at full capacity → no headroom

AI Analysis (${aiEnabled ? `every ${predictionSettings.interval}m` : 'disabled'}):
${aiEnabled ? '• Trend detection over time\n• Correlated failure patterns\n• Anomaly detection' : '• Enable in Settings > Predictions'}

${totalPredicted > 0 ? `Current: ${heuristicPredictionCount} heuristic, ${aiPredictionCount} AI${criticalPredicted > 0 ? ` (${criticalPredicted} critical)` : ''}` : 'No predicted risks detected'}
${aiEnabled ? '\nClick to run AI analysis now' : ''}`}
        >
          <div className="flex items-center gap-1">
            {aiPredictionCount > 0 ? (
              <Sparkles className="w-3 h-3 text-blue-400" />
            ) : (
              <TrendingUp className={cn('w-3 h-3', totalPredicted > 0 ? 'text-blue-400' : 'text-green-400')} />
            )}
            <span className="text-xl font-bold text-foreground">{totalPredicted}</span>
            {isAnalyzing && (
              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
            )}
          </div>
          <div className={cn(
            'text-2xs flex items-center gap-1',
            totalPredicted > 0 ? 'text-blue-400' : 'text-green-400'
          )}>
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
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grouped' ? 'bg-background text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
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
