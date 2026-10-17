import { Loader2, Stethoscope, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import { cn } from '../../../lib/cn'
import type { AppliedResource } from './useKustomizationDrillDown'

// ---------------------------------------------------------------------------
// Resources tab
// ---------------------------------------------------------------------------

interface KustomizationResourcesTabProps {
  appliedResources: AppliedResource[] | null
  resourcesLoading: boolean
  onResourceClick: (resource: AppliedResource) => void
}

export function KustomizationResourcesTab({ appliedResources, resourcesLoading, onResourceClick }: KustomizationResourcesTabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">Applied Resources ({appliedResources?.length || 0})</h4>
      {resourcesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : appliedResources && appliedResources.length > 0 ? (
        <div className="space-y-2">
          {appliedResources.map((resource, i) => (
            <div
              key={i}
              onClick={() => onResourceClick(resource)}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg border border-border bg-card/50',
                (resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace
                  ? 'cursor-pointer hover:bg-card/80 transition-colors'
                  : ''
              )}
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-blue-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{resource.name}</span>
                  {resource.namespace && (
                    <span className="text-xs text-muted-foreground ml-2">({resource.namespace})</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{resource.kind}</span>
                {(resource.kind === 'Pod' || resource.kind === 'Deployment') && resource.namespace && (
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.kustomization.noResources')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI tab
// ---------------------------------------------------------------------------

interface KustomizationAITabProps {
  isAgentConnected: boolean
  aiAnalysisLoading: boolean
  aiAnalysis: string | null
  onDiagnose: () => void
}

export function KustomizationAITab({ isAgentConnected, aiAnalysisLoading, aiAnalysis, onDiagnose }: KustomizationAITabProps) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <ConsoleAIIcon className="w-5 h-5" />
          AI Analysis
        </h4>
        <button
          onClick={onDiagnose}
          disabled={!isAgentConnected}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Stethoscope className="w-4 h-4" />
          Analyze Kustomization
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI agent not connected</p>
          <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
        </div>
      ) : aiAnalysisLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </div>
      ) : aiAnalysis ? (
        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <pre className="whitespace-pre-wrap text-sm text-foreground">{aiAnalysis}</pre>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.kustomization.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.kustomization.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
