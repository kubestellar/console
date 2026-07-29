import { Bot } from 'lucide-react'
import type { TFunction } from 'i18next'

interface AlertPreviewPanelProps {
  aiDiagnose: boolean
  onToggle: () => void
  t: TFunction
}

export function AlertPreviewPanel({ aiDiagnose, onToggle, t }: AlertPreviewPanelProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-foreground">{t('alerts.aiIntegration')}</h4>
      <button
        onClick={onToggle}
        className={`w-full p-3 rounded-lg text-left transition-colors ${
          aiDiagnose
            ? 'bg-purple-500/20 border border-purple-500/50'
            : 'bg-secondary border border-border hover:bg-secondary/80'
        }`}
        aria-label={aiDiagnose ? 'Disable AI diagnosis' : 'Enable AI diagnosis'}
        aria-pressed={aiDiagnose}
      >
        <span className="flex items-center gap-2">
          <Bot className={`w-5 h-5 ${aiDiagnose ? 'text-purple-400' : 'text-muted-foreground'}`} aria-hidden="true" />
          <span>
            <span className="block text-sm font-medium text-foreground">{t('alerts.aiDiagnosis')}</span>
            <span className="block text-xs text-muted-foreground">{t('alerts.aiDiagnosisDesc')}</span>
          </span>
        </span>
      </button>
    </div>
  )
}
