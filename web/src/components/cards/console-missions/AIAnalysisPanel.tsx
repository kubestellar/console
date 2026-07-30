/**
 * AIAnalysisPanel — Action button + status summary for triggering AI analysis.
 * Displays current issue/prediction counts and launches the analysis mission.
 *
 * Pure UI component — renders analysis panel based on props; no data fetching.
 * Demo data support provided by parent mission cards.
 */
import { AlertCircle, CheckCircle, Clock, TrendingUp, Sparkles, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'

type AIAnalysisPanelProps = {
  filteredTotalIssues: number
  filteredTotalPredicted: number
  filteredOfflineCount: number
  filteredAIPredictionCount: number
  isFiltered: boolean
  runningMission: boolean
  onStartAnalysis: () => void
  dataLoading?: boolean
  dataError?: string | null
}

export function AIAnalysisPanel({
  filteredTotalIssues,
  filteredTotalPredicted,
  filteredOfflineCount,
  filteredAIPredictionCount,
  isFiltered,
  runningMission,
  onStartAnalysis,
  dataLoading,
  dataError,
}: AIAnalysisPanelProps) {
  const { t } = useTranslation(['cards', 'common'])

  if (dataLoading) {
    return (
      <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm text-muted-foreground bg-secondary/30">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('common:common.loading', 'Loading...')}
      </div>
    )
  }

  if (dataError) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {dataError}
      </div>
    )
  }

  return (
    <button
      onClick={onStartAnalysis}
      disabled={(filteredTotalIssues === 0 && filteredTotalPredicted === 0) || runningMission}
      className={cn(
        'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
        filteredTotalIssues === 0 && filteredTotalPredicted === 0
          ? 'bg-green-500/20 text-green-400 cursor-default'
          : runningMission
            ? 'bg-blue-500/20 text-blue-400 cursor-wait'
            : filteredTotalIssues > 0
              ? filteredOfflineCount > 0
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
              : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
      )}
    >
      {filteredTotalIssues === 0 && filteredTotalPredicted === 0 ? (
        <>
          <CheckCircle className="w-4 h-4" />
          {isFiltered ? t('common:common.noMatchingItems', 'No matching items') : t('cards:consoleOfflineDetection.allHealthy', 'All Healthy')}
        </>
      ) : runningMission ? (
        <>
          <Clock className="w-4 h-4 animate-pulse" />
          {t('cards:consoleOfflineDetection.analyzing', 'Analyzing...')}
        </>
      ) : filteredTotalIssues > 0 ? (
        <>
          <AlertCircle className="w-4 h-4" />
          {t('cards:consoleOfflineDetection.analyzeIssues', 'Analyze {{count}} Issue{{plural}}{{risks}}', {
            count: filteredTotalIssues,
            plural: filteredTotalIssues !== 1 ? 's' : '',
            risks: filteredTotalPredicted > 0 ? ` + ${filteredTotalPredicted} Risks` : '',
          })}
        </>
      ) : (
        <>
          {filteredAIPredictionCount > 0 ? <Sparkles className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          {t('cards:consoleOfflineDetection.analyzePredictions', 'Analyze {{count}} Predicted Risk{{plural}}', {
            count: filteredTotalPredicted,
            plural: filteredTotalPredicted !== 1 ? 's' : '',
          })}
          {filteredAIPredictionCount > 0 && (
            <span className="text-xs opacity-75">({filteredAIPredictionCount} AI)</span>
          )}
        </>
      )}
    </button>
  )
}
