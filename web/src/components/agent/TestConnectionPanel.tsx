import { Copy, Key, Plug } from 'lucide-react'
import { Button } from '../ui/Button'

interface TestConnectionPanelProps {
  mode: 'connection-error' | 'no-providers'
  installCommand: string
  copied: boolean
  onCopyInstallCommand: () => void
  onRetryConnection: () => void
  t: (key: string) => string
}

export function TestConnectionPanel({
  mode,
  installCommand,
  copied,
  onCopyInstallCommand,
  onRetryConnection,
  t,
}: TestConnectionPanelProps) {
  if (mode === 'connection-error') {
    return (
      <div className="text-center py-6">
        <div className="p-3 rounded-full bg-orange-500/20 w-fit mx-auto mb-4">
          <Plug className="w-8 h-8 text-orange-400" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">{t('agent.localAgentRequired')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t('agent.installAgentPrompt')}
        </p>

        <div className="bg-secondary/50 rounded-lg p-4 mb-4">
          <p className="text-xs text-muted-foreground mb-2">{t('agent.runInstallCommand')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded bg-background font-mono text-sm text-foreground text-left overflow-x-auto">
              {installCommand}
            </code>
            <Button
              onClick={onCopyInstallCommand}
              variant="primary"
              size="md"
              icon={<Copy className="w-4 h-4" />}
              className="shrink-0"
            >
              {copied ? t('actions.copied') : t('actions.copy')}
            </Button>
          </div>
        </div>

        <Button
          onClick={onRetryConnection}
          variant="ghost"
          size="sm"
        >
          {t('agent.retryConnection')}
        </Button>
      </div>
    )
  }

  return (
    <div className="text-center py-6">
      <div className="p-3 rounded-full bg-secondary w-fit mx-auto mb-4">
        <Key className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        {t('agent.noProvidersTitle')}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t('agent.noProvidersDescription')}
      </p>
      <div className="bg-secondary/50 rounded-lg p-4 mb-4 text-left">
        <p className="text-xs font-medium text-foreground mb-2">{t('agent.envVarsTitle')}</p>
        <div className="space-y-1">
          <code className="block text-xs text-muted-foreground font-mono">ANTHROPIC_API_KEY=sk-ant-...</code>
          <code className="block text-xs text-muted-foreground font-mono">OPENAI_API_KEY=sk-...</code>
          <code className="block text-xs text-muted-foreground font-mono">GEMINI_API_KEY=...</code>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t('agent.envVarsHint')}
        </p>
      </div>
      <Button
        onClick={onRetryConnection}
        variant="ghost"
        size="sm"
      >
        {t('agent.retryConnection')}
      </Button>
    </div>
  )
}
