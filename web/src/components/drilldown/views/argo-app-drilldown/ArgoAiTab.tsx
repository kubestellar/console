import { Loader2, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../../ui/ConsoleAIIcon'
import type { ArgoAiTabProps } from './types'

export function ArgoAiTab({ isAgentConnected, aiAnalysisLoading, aiAnalysis, onDiagnose }: ArgoAiTabProps) {
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
          Analyze Application
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
          <p>{t('drilldown.argoApp.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.argoApp.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
