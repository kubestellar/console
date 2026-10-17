import { Loader2, Package, FileText, Stethoscope } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useTranslation } from 'react-i18next'
import { ConsoleAIIcon } from '../../ui/ConsoleAIIcon'
import type { CSVInfo, CRDInfo } from './operator-drilldown'

interface OperatorCSVTabProps {
  csvInfo: CSVInfo | null
  csvLoading: boolean
  phaseStyle: { bg: string; text: string; border: string }
}

export function OperatorCSVTab({ csvInfo, csvLoading, phaseStyle }: OperatorCSVTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">{t('drilldown.operator.csvDetails')}</h4>
      {csvLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : csvInfo ? (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-border bg-card/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <span className="ml-2 text-foreground font-mono">{csvInfo.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Display Name:</span>
                <span className="ml-2 text-foreground">{csvInfo.displayName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Version:</span>
                <span className="ml-2 text-foreground">{csvInfo.version}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Phase:</span>
                <span className={cn('ml-2 px-2 py-0.5 rounded text-xs', phaseStyle.bg, phaseStyle.text)}>
                  {csvInfo.phase}
                </span>
              </div>
              {csvInfo.maturity && (
                <div>
                  <span className="text-muted-foreground">Maturity:</span>
                  <span className="ml-2 text-foreground capitalize">{csvInfo.maturity}</span>
                </div>
              )}
              {csvInfo.provider && (
                <div>
                  <span className="text-muted-foreground">Provider:</span>
                  <span className="ml-2 text-foreground">{csvInfo.provider}</span>
                </div>
              )}
            </div>
          </div>

          {csvInfo.maintainers && csvInfo.maintainers.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.maintainers')}</h5>
              <div className="space-y-1">
                {csvInfo.maintainers.map((m, i) => (
                  <div key={i} className="text-sm text-muted-foreground">
                    {m.name} {m.email && `<${m.email}>`}
                  </div>
                ))}
              </div>
            </div>
          )}

          {csvInfo.installModes && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <h5 className="text-sm font-medium text-foreground mb-2">{t('drilldown.operator.installModes')}</h5>
              <div className="flex flex-wrap gap-2">
                {csvInfo.installModes.map((mode) => (
                  <span
                    key={mode.type}
                    className={cn(
                      'px-2 py-1 rounded text-xs',
                      mode.supported ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    )}
                  >
                    {mode.type}: {mode.supported ? t('drilldown.operator.yes') : t('drilldown.operator.no')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.operator.csvNotAvailable')}</p>
        </div>
      )}
    </div>
  )
}

interface OperatorCRDsTabProps {
  operatorCRDs: CRDInfo[] | null
  crdsLoading: boolean
  onCRDClick: (crdName: string) => void
}

export function OperatorCRDsTab({ operatorCRDs, crdsLoading, onCRDClick }: OperatorCRDsTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium text-foreground">
        {t('drilldown.operator.ownedCRDs', { count: operatorCRDs?.length || 0 })}
      </h4>
      {crdsLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : operatorCRDs && operatorCRDs.length > 0 ? (
        <div className="space-y-2">
          {operatorCRDs.map((crd) => (
            <div
              key={crd.name}
              onClick={() => onCRDClick(crd.name)}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 hover:bg-card/80 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-purple-400" />
                <div>
                  <span className="text-sm font-medium text-foreground">{crd.kind}</span>
                  <span className="text-xs text-muted-foreground ml-2">({crd.version})</span>
                  {crd.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{crd.description}</p>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-mono">{crd.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.operator.noCRDs')}</p>
        </div>
      )}
    </div>
  )
}

interface OperatorAITabProps {
  isAgentConnected: boolean
  aiAnalysis: string | null
  aiAnalysisLoading: boolean
  onDiagnose: () => void
}

export function OperatorAITab({
  isAgentConnected,
  aiAnalysis,
  aiAnalysisLoading,
  onDiagnose,
}: OperatorAITabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
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
          {t('drilldown.operator.analyzeOperator')}
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
          <p>{t('drilldown.operator.clickAnalyze')}</p>
          <p className="text-xs mt-1">{t('drilldown.operator.analyzeHint')}</p>
        </div>
      )}
    </div>
  )
}
