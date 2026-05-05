import { Loader2, Stethoscope, Wrench, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../../../lib/cn'
import { ConsoleAIIcon } from '../../../ui/ConsoleAIIcon'
import { useTranslation } from 'react-i18next'

export interface PodAiAnalysisProps {
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  aiAnalysisError?: string | null
  backendUnavailable?: boolean
  fetchAiAnalysis: () => void
  handleRepairPod: () => void
}

export function PodAiAnalysis({
  aiAnalysis,
  aiAnalysisLoading,
  aiAnalysisError,
  backendUnavailable,
  fetchAiAnalysis,
  handleRepairPod,
}: PodAiAnalysisProps) {
  const { t } = useTranslation()

  return (
    <>
      {/* Backend unavailable warning */}
      {backendUnavailable && (
        <div className="p-4 pb-0">
          <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{t('layout.connectionLostHint')}</span>
            </div>
          </div>
        </div>
      )}
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
              className="mt-2 flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
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
                    <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
          disabled={aiAnalysisLoading || backendUnavailable}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
            'bg-purple-600/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/50',
            'shadow-[0_0_15px_rgba(147,51,234,0.2)] hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]',
            aiAnalysisLoading && 'opacity-70 cursor-wait',
            backendUnavailable && 'opacity-50 cursor-not-allowed'
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
          disabled={backendUnavailable}
          className={cn(
            'flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium',
            'bg-orange-600/20 text-orange-200 hover:bg-orange-500/30 border border-orange-500/50',
            'shadow-[0_0_15px_rgba(234,88,12,0.2)] hover:shadow-[0_0_20px_rgba(234,88,12,0.3)]',
            backendUnavailable && 'opacity-50 cursor-not-allowed'
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
