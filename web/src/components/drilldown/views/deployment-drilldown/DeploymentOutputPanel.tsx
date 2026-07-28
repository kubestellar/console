import { Check, Copy, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface DeploymentOutputPanelProps {
  loading: boolean
  output: string | null
  loadingMessage: string
  notConnectedMessage: string
  noResourcesMessage?: string
  enableCopy?: boolean
  copyField?: string
  copiedField?: string | null
  onCopy?: (field: string, value: string) => void
}

export function DeploymentOutputPanel({
  loading,
  output,
  loadingMessage,
  notConnectedMessage,
  noResourcesMessage,
  enableCopy = false,
  copyField,
  copiedField,
  onCopy,
}: DeploymentOutputPanelProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">{loadingMessage}</span>
      </div>
    )
  }

  if (output) {
    return (
      <div className="relative">
        {enableCopy && onCopy && copyField && (
          <button
            onClick={() => onCopy(copyField, output)}
            className="absolute top-2 right-2 px-2 py-1 rounded bg-secondary/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {copiedField === copyField ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        )}
        <pre className="p-4 rounded-lg bg-black/50 border border-border overflow-auto max-h-[60vh] text-xs text-foreground font-mono whitespace-pre-wrap">
          {noResourcesMessage && output.includes('No resources found') ? noResourcesMessage : output}
        </pre>
      </div>
    )
  }

  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
      <p className="text-yellow-400">{t('drilldown.empty.localAgentNotConnected')}</p>
      {!!notConnectedMessage && <p className="text-sm text-muted-foreground mt-1">{notConnectedMessage}</p>}
    </div>
  )
}
