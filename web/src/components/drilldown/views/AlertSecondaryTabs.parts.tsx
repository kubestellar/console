import { Tag, Loader2, Copy, Check, Code, Stethoscope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'

// ---------------------------------------------------------------------------
// Labels tab
// ---------------------------------------------------------------------------

interface AlertLabelsTabProps {
  tabPanelProps: Record<string, unknown>
  labelEntries: [string, string][]
  copiedField: string | null
  onCopy: (field: string, value: string) => void
}

export function AlertLabelsTab({ tabPanelProps, labelEntries, copiedField, onCopy }: AlertLabelsTabProps) {
  const { t } = useTranslation()
  return (
    <div {...tabPanelProps} className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{t('drilldown.alertDetail.allLabels', { count: labelEntries.length })}</h4>
      </div>
      <div className="space-y-2">
        {labelEntries.map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Tag className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-sm text-muted-foreground">{key}</span>
                <span className="text-sm text-muted-foreground mx-2">=</span>
                <span className="text-sm text-foreground font-mono break-all">{value}</span>
              </div>
            </div>
            <button
              onClick={() => onCopy(key, `${key}=${value}`)}
              className="p-1.5 rounded hover:bg-secondary transition-colors shrink-0"
              title={t('drilldown.alertDetail.copyLabel')}
              aria-label={t('drilldown.alertDetail.copyLabel')}
            >
              {copiedField === key ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Source tab
// ---------------------------------------------------------------------------

interface AlertSourceTabProps {
  tabPanelProps: Record<string, unknown>
  sourceLoading: boolean
  sourceRule: string | null
}

export function AlertSourceTab({ tabPanelProps, sourceLoading, sourceRule }: AlertSourceTabProps) {
  const { t } = useTranslation()
  return (
    <div {...tabPanelProps} className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('drilldown.alertDetail.alertRuleSource')}</h4>
      {sourceLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sourceRule ? (
        <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground">
          {sourceRule}
        </pre>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.alertDetail.ruleNotAvailable')}</p>
          <p className="text-xs mt-1">{t('drilldown.alertDetail.connectAgentRule')}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI tab
// ---------------------------------------------------------------------------

interface AlertAITabProps {
  tabPanelProps: Record<string, unknown>
  isAgentConnected: boolean
  aiAnalysisLoading: boolean
  aiAnalysis: string | null
  onDiagnose: () => void
}

export function AlertAITab({ tabPanelProps, isAgentConnected, aiAnalysisLoading, aiAnalysis, onDiagnose }: AlertAITabProps) {
  const { t } = useTranslation()
  return (
    <div {...tabPanelProps} className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
          <ConsoleAIIcon className="w-5 h-5" />
          {t('drilldown.ai.title')}
        </h4>
        <button
          onClick={onDiagnose}
          disabled={!isAgentConnected}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          <Stethoscope className="w-4 h-4" />
          {t('drilldown.alertDetail.diagnoseAlert')}
        </button>
      </div>

      {!isAgentConnected ? (
        <div className="text-center py-12 text-muted-foreground">
          <ConsoleAIIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.ai.notConnected')}</p>
          <p className="text-xs mt-1">{t('drilldown.ai.configureAgent')}</p>
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
          <p>{t('drilldown.alertDetail.clickDiagnose')}</p>
          <p className="text-xs mt-1">{t('drilldown.alertDetail.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
