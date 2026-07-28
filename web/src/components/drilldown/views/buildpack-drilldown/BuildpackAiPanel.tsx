import { Check, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../../ui/ConsoleAIIcon'

interface BuildpackAiPanelProps {
  isAgentConnected: boolean
  onDiagnose: () => void
}

export function BuildpackAiPanel({ isAgentConnected, onDiagnose }: BuildpackAiPanelProps) {
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
          Analyze Buildpack
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI agent not connected</p>
          <p className="text-xs mt-1">Configure the local agent in Settings to enable AI analysis</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <h5 className="text-sm font-medium text-purple-400 mb-2">{t('drilldown.buildpack.availableAIActions')}</h5>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5" />
                <span>{t('drilldown.buildpack.buildHealthAnalysis')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5" />
                <span>{t('drilldown.buildpack.builderConfigReview')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5" />
                <span>{t('drilldown.buildpack.buildFailureDiagnosis')}</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-400 mt-0.5" />
                <span>{t('drilldown.buildpack.optimizationRecommendations')}</span>
              </li>
            </ul>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('drilldown.buildpack.clickAnalyze')}</p>
            <p className="text-xs mt-1">{t('drilldown.buildpack.analyzeHint')}</p>
          </div>
        </div>
      )}
    </div>
  )
}
