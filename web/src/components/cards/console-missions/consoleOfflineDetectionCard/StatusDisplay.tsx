import { TrendingUp, RefreshCw, Info, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../../lib/cn'

interface StatusDisplayProps {
  currentClusterIssueCount: number
  firstCurrentIssueCluster: string | null
  onClusterClick: (clusterName: string) => void
  gpuIssueCount: number
  firstGpuCluster: string | null
  totalPredicted: number
  aiEnabled: boolean
  isAnalyzing: boolean
  triggerAIAnalysis: () => void
  thresholds: {
    highRestartCount: number
    cpuPressure: number
    memoryPressure: number
  }
  predictionInterval: number
  heuristicPredictionCount: number
  aiPredictionCount: number
  criticalPredicted: number
}

export function StatusDisplay({
  currentClusterIssueCount,
  firstCurrentIssueCluster,
  onClusterClick,
  gpuIssueCount,
  firstGpuCluster,
  totalPredicted,
  aiEnabled,
  isAnalyzing,
  triggerAIAnalysis,
  thresholds,
  predictionInterval,
  heuristicPredictionCount,
  aiPredictionCount,
  criticalPredicted,
}: StatusDisplayProps) {
  const { t } = useTranslation(['cards', 'common'])

  return (
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
            onClusterClick(firstCurrentIssueCluster)
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
          gpuIssueCount > 0
            ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
            : 'bg-green-500/10 border-green-500/20 cursor-default'
        )}
        onClick={() => {
          if (gpuIssueCount > 0 && firstGpuCluster) {
            onClusterClick(firstGpuCluster)
          }
        }}
        title={gpuIssueCount > 0 ? `${gpuIssueCount} GPU issue${gpuIssueCount !== 1 ? 's' : ''} - Click to view` : 'All GPUs available'}
      >
        <div className="text-xl font-bold text-foreground">{gpuIssueCount}</div>
        <div className={cn('text-2xs', gpuIssueCount > 0 ? 'text-yellow-400' : 'text-green-400')}>
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
  Pods with ${thresholds.highRestartCount}+ restarts → likely to crash
  Clusters with >${thresholds.cpuPressure}% CPU → throttling risk
  Clusters with >${thresholds.memoryPressure}% memory → OOM risk
  GPU nodes at full capacity → no headroom

 AI Analysis (${aiEnabled ? `every ${predictionInterval}m` : 'disabled'}):
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
  )
}
