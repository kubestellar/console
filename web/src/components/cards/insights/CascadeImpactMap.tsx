import { useMemo } from 'react'
import { Workflow, ArrowRight, AlertTriangle } from 'lucide-react'
import { useMultiClusterInsights } from '../../../hooks/useMultiClusterInsights'
import { useCardLoadingState } from '../CardDataContext'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { InsightSourceBadge } from './InsightSourceBadge'
import { StatusBadge } from '../../ui/StatusBadge'
import type { InsightSeverity } from '../../../types/insights'

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: 'border-red-500/40 bg-red-500/10',
  warning: 'border-yellow-500/40 bg-yellow-500/10',
  info: 'border-blue-500/40 bg-blue-500/10',
}

const SEVERITY_DOT_COLORS: Record<InsightSeverity, string> = {
  critical: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
}

export function CascadeImpactMap() {
  const { insightsByCategory, isLoading, isDemoData } = useMultiClusterInsights()
  const { selectedClusters } = useGlobalFilters()

  const cascadeInsights = useMemo(() => {
    const all = insightsByCategory['cascade-impact'] || []
    if (selectedClusters.length === 0) return all
    return all.filter(i =>
      (i.affectedClusters || []).some(c => selectedClusters.includes(c)),
    )
  }, [insightsByCategory, selectedClusters])

  useCardLoadingState({
    isLoading,
    hasAnyData: cascadeInsights.length > 0,
    isDemoData,
  })

  if (!isLoading && cascadeInsights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
        <Workflow className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No cascade patterns detected</p>
        <p className="text-xs mt-1">Issues are not propagating across clusters</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-1">
      {(cascadeInsights || []).map(insight => (
        <div key={insight.id} className="space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <InsightSourceBadge source={insight.source} confidence={insight.confidence} />
            <StatusBadge
              color={insight.severity === 'critical' ? 'red' : 'yellow'}
              size="xs"
            >
              {insight.severity}
            </StatusBadge>
            <span className="text-xs font-medium flex-1">{insight.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{insight.description}</p>

          {/* Cascade chain */}
          {insight.chain && insight.chain.length > 0 && (
            <div className="flex items-start gap-1 overflow-x-auto pb-1">
              {(insight.chain || []).map((link, i) => (
                <div key={`${link.cluster}-${i}`} className="flex items-center gap-1 flex-shrink-0">
                  {/* Chain node */}
                  <div className={`border rounded-lg p-2 min-w-28 ${SEVERITY_COLORS[link.severity]}`}>
                    <div className="flex items-center gap-1 mb-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT_COLORS[link.severity]}`} />
                      <span className="text-2xs font-medium">{link.cluster}</span>
                    </div>
                    <div className="text-2xs text-muted-foreground">{link.resource}</div>
                    <div className="flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-2.5 h-2.5 text-yellow-400" />
                      <span className="text-2xs">{link.event}</span>
                    </div>
                    {link.timestamp && (
                      <div className="text-[9px] text-muted-foreground mt-1">
                        {new Date(link.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    )}
                  </div>

                  {/* Arrow connector */}
                  {i < (insight.chain || []).length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI remediation */}
          {insight.remediation && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-2">
              <div className="flex items-center gap-1 mb-1">
                <StatusBadge color="blue" size="xs">AI Suggestion</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{insight.remediation}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
