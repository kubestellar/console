import { useTranslation } from 'react-i18next'
import { Globe, Terminal, Ship, GitPullRequestArrow, Bot, Copy, RefreshCw } from 'lucide-react'

export interface UpdateHowToSectionProps {
  isDeveloperChannel: boolean
  hasUpdate: boolean
  agentConnected: boolean
  autoUpdateEnabled: boolean
  isHelmInstall: boolean
  brewCommand: string
  helmCommand: string
  copiedCommand: string | null
  handleCopyCommand: (cmd: string, key: string) => void
  handleReloadWindow: () => void
}

export function UpdateHowToSection({
  isDeveloperChannel,
  hasUpdate,
  agentConnected,
  autoUpdateEnabled,
  isHelmInstall,
  brewCommand,
  helmCommand,
  copiedCommand,
  handleCopyCommand,
  handleReloadWindow,
}: UpdateHowToSectionProps) {
  const { t } = useTranslation()

  if (isDeveloperChannel) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

        <div className="p-4 rounded-lg bg-secondary/30 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <GitPullRequestArrow className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-foreground">{t('settings.updates.devSourceUpdate')}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.devMakeUpdateDesc')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-secondary font-mono text-sm select-all">make update</code>
            <button
              onClick={() => handleCopyCommand('make update', 'makeupdate')}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
            >
              <Copy className="w-4 h-4" />
              {copiedCommand === 'makeupdate' ? t('settings.updates.copied') : t('settings.updates.copy')}
            </button>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-linear-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-foreground">{t('settings.updates.devCodingAgent')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings.updates.devCodingAgentDesc')}</p>
        </div>
      </div>
    )
  }

  if (!hasUpdate || (agentConnected && autoUpdateEnabled) || isHelmInstall) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">{t('settings.updates.howToUpdate')}</h3>

      <div className="p-4 rounded-lg bg-secondary/30 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">{t('settings.updates.webConsole')}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.webConsoleDesc')}</p>
        <button
          onClick={handleReloadWindow}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600"
        >
          <RefreshCw className="w-4 h-4" />
          {t('settings.updates.refreshBrowser')}
        </button>
      </div>

      <div className="p-4 rounded-lg bg-secondary/30 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-foreground">{t('settings.updates.localAgentUpdate')}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.localAgentDesc')}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
            {brewCommand}
          </code>
          <button
            onClick={() => handleCopyCommand(brewCommand, 'brew')}
            className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-sm hover:bg-green-600"
          >
            <Copy className="w-4 h-4" />
            {copiedCommand === 'brew' ? t('settings.updates.copied') : t('settings.updates.copy')}
          </button>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-secondary/30 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Ship className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">{t('settings.updates.clusterDeployment')}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.updates.clusterDeploymentDesc')}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-secondary font-mono text-xs select-all overflow-x-auto">
            {helmCommand}
          </code>
          <button
            onClick={() => handleCopyCommand(helmCommand, 'helm')}
            className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
          >
            <Copy className="w-4 h-4" />
            {copiedCommand === 'helm' ? t('settings.updates.copied') : t('settings.updates.copy')}
          </button>
        </div>
      </div>
    </div>
  )
}
