import { Loader2, Stethoscope, Wrench, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { ConsoleAIIcon } from '../../../ui/ConsoleAIIcon'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'

// Inline style constants
const POD_AI_ANALYSIS_SPAN_STYLE_1: CSSProperties = { animationDelay: '0ms' }
const POD_AI_ANALYSIS_SPAN_STYLE_2: CSSProperties = { animationDelay: '150ms' }
const POD_AI_ANALYSIS_SPAN_STYLE_3: CSSProperties = { animationDelay: '300ms' }


export interface PodAiAnalysisProps {
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  aiAnalysisError?: string | null
  actionsDisabled?: boolean
  actionsDisabledReason?: string
  fetchAiAnalysis: () => void
  handleRepairPod: () => void
}

export function PodAiAnalysis({
  aiAnalysis,
  aiAnalysisLoading,
  aiAnalysisError,
  actionsDisabled = false,
  actionsDisabledReason,
  fetchAiAnalysis,
  handleRepairPod,
}: PodAiAnalysisProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Error state */}
      {aiAnalysisError && !aiAnalysisLoading && (
        <div className="p-4 pb-0">
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{aiAnalysisError}</span>
            </div>
            <button
              onClick={fetchAiAnalysis}
              disabled={actionsDisabled}
              title={actionsDisabledReason}
              className={cn(
                'mt-2 flex items-center gap-1.5 text-xs text-red-400 transition-colors',
                actionsDisabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'hover:text-red-300'
              )}
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t('common.retry')}</span>
            </button>
          </div>
        </div>
      )}

      {/* AI Analysis Results - visible on all tabs */}
      {(aiAnalysis || aiAnalysisLoading) && !aiAnalysisError && (
        <div className="p-4 pb-0">
          <div className="rounded-lg bg-linear-to-br from-purple-500/10 via-blue-500/10 to-cyan-500/10 border border-purple-500/30 overflow-hidden">
            {aiAnalysisLoading ? (
              <div className="p-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={POD_AI_ANALYSIS_SPAN_STYLE_1} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={POD_AI_ANALYSIS_SPAN_STYLE_2} />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={POD_AI_ANALYSIS_SPAN_STYLE_3} />
                  </div>
                  <span className="font-mono text-xs">Analyzing pod status, events, logs, owner resources...</span>
                </div>
              </div>
            ) : (
              <div className="p-4 max-h-48 overflow-y-auto">
                <div className="flex items-center gap-2 text-xs text-purple-400 mb-2">
                  <ConsoleAIIcon size="sm" />
                  <span className="font-semibold tracking-wide">{t('drilldown.ai.aiDiagnosis')}</span>
                  <span className="text-purple-400/75 font-mono">// powered by KubeStellar</span>
                </div>
                <div className="font-mono text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  <span className="text-purple-400">{'>'}</span> {aiAnalysis}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 p-4">
        <button
          onClick={fetchAiAnalysis}
          disabled={aiAnalysisLoading || actionsDisabled}
          title={actionsDisabledReason}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
            actionsDisabled
              ? 'bg-secondary/30 text-muted-foreground border border-border cursor-not-allowed opacity-60 shadow-none'
              : 'bg-purple-600/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/50 shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]',
            aiAnalysisLoading && 'opacity-70 cursor-wait'
          )}
        >
          {aiAnalysisLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('common.analyzing')}</span>
            </>
          ) : (
            <>
              <div className="relative">
                <Stethoscope className="w-4 h-4" />
                <Sparkles className="absolute -top-0.5 -right-0.5 w-2 h-2 text-purple-400 animate-pulse" />
              </div>
              <span>{aiAnalysis ? t('drilldown.actions.reAnalyze') : t('drilldown.actions.diagnose')}</span>
            </>
          )}
        </button>
        <button
          onClick={handleRepairPod}
          disabled={actionsDisabled}
          title={actionsDisabledReason}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
            actionsDisabled
              ? 'bg-secondary/30 text-muted-foreground border border-border cursor-not-allowed opacity-60 shadow-none'
              : 'bg-orange-600/20 text-orange-200 hover:bg-orange-500/30 border border-orange-500/50 shadow-[0_0_15px_rgba(234,88,12,0.2)] hover:shadow-[0_0_20px_rgba(234,88,12,0.3)]'
          )}
        >
          <div className="relative">
            <Wrench className="w-4 h-4" />
            <Sparkles className="absolute -top-0.5 -right-0.5 w-2 h-2 text-purple-400 animate-pulse" />
          </div>
          <span>{t('drilldown.actions.repair')}</span>
        </button>
      </div>
    </>
  )
}
