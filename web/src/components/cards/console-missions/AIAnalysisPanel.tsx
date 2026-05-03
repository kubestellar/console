/**
 * AIAnalysisPanel — Action button + status summary for triggering AI analysis.
 * Displays current issue/prediction counts and launches the analysis mission.
 */
import { AlertCircle, CheckCircle, Clock, TrendingUp, Sparkles } from 'lucide-react'
import { cn } from '../../../lib/cn'

type AIAnalysisPanelProps = {
  filteredTotalIssues: number
  filteredTotalPredicted: number
  filteredOfflineCount: number
  filteredAIPredictionCount: number
  isFiltered: boolean
  runningMission: boolean
  onStartAnalysis: () => void
}

export function AIAnalysisPanel({
  filteredTotalIssues,
  filteredTotalPredicted,
  filteredOfflineCount,
  filteredAIPredictionCount,
  isFiltered,
  runningMission,
  onStartAnalysis,
}: AIAnalysisPanelProps) {
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
          {isFiltered ? 'No matching items' : 'All Healthy'}
        </>
      ) : runningMission ? (
        <>
          <Clock className="w-4 h-4 animate-pulse" />
          Analyzing...
        </>
      ) : filteredTotalIssues > 0 ? (
        <>
          <AlertCircle className="w-4 h-4" />
          Analyze {filteredTotalIssues} Issue{filteredTotalIssues !== 1 ? 's' : ''}{filteredTotalPredicted > 0 ? ` + ${filteredTotalPredicted} Risks` : ''}
        </>
      ) : (
        <>
          {filteredAIPredictionCount > 0 ? <Sparkles className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          Analyze {filteredTotalPredicted} Predicted Risk{filteredTotalPredicted !== 1 ? 's' : ''}
          {filteredAIPredictionCount > 0 && (
            <span className="text-xs opacity-75">({filteredAIPredictionCount} AI)</span>
          )}
        </>
      )}
    </button>
  )
}
