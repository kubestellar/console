import { Check, Copy, FileText, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { HelmValuesPanelProps } from './types'

export function HelmValuesPanel({ releaseValues, valuesLoading, copiedField, onCopy }: HelmValuesPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{t('drilldown.helm.releaseValues')}</h4>
        {releaseValues && (
          <button
            onClick={() => onCopy('values', releaseValues)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiedField === 'values' ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            Copy
          </button>
        )}
      </div>
      {valuesLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : releaseValues ? (
        <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground max-h-[500px]">
          {releaseValues}
        </pre>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.helm.noValues')}</p>
          <p className="text-xs mt-1">{t('drilldown.helm.connectValues')}</p>
        </div>
      )}
    </div>
  )
}
