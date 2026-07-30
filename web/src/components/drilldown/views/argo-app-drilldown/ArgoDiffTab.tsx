import { Check, Copy, GitCommit, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ArgoDiffTabProps } from './types'

export function ArgoDiffTab({ diffOutput, diffLoading, copiedField, onCopy }: ArgoDiffTabProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Application Manifest</h4>
        {diffOutput && (
          <button
            onClick={() => onCopy('diff', diffOutput)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copiedField === 'diff' ? (
              <Check className="w-3 h-3 text-green-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            Copy
          </button>
        )}
      </div>
      {diffLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : diffOutput ? (
        <pre className="p-4 rounded-lg bg-card border border-border overflow-x-auto text-xs font-mono text-foreground max-h-[500px]">
          {diffOutput}
        </pre>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <GitCommit className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('drilldown.argoApp.noManifest')}</p>
        </div>
      )}
    </div>
  )
}
