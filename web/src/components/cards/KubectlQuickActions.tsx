import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface KubectlQuickActionsProps {
  hasOutput: boolean
  onSetCommand: (command: string) => void
  onCopyOutput: () => void
}

export function KubectlQuickActions({ hasOutput, onSetCommand, onCopyOutput }: KubectlQuickActionsProps) {
  const { t } = useTranslation(['common', 'cards'])
  return (
    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
      <span className="text-xs text-muted-foreground">{t('cards:kubectl.quickCommands')}:</span>
      <button
        onClick={() => onSetCommand('get pods --all-namespaces')}
        className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
      >
        {t('cards:kubectl.listPods')}
      </button>
      <button
        onClick={() => onSetCommand('get deployments')}
        className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
      >
        {t('common:common.deployments')}
      </button>
      <button
        onClick={() => onSetCommand('get services')}
        className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
      >
        {t('common:common.services')}
      </button>
      <button
        onClick={() => onSetCommand('get nodes')}
        className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
      >
        {t('common:common.nodes')}
      </button>
      <button
        onClick={onCopyOutput}
        disabled={!hasOutput}
        className="px-2 py-1 text-2xs rounded bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Copy className="w-3 h-3 inline mr-1" />
        {t('cards:kubectl.copyOutput')}
      </button>
    </div>
  )
}
