'use client'

import { useState } from 'react'
import { useLocalAgent } from '@/hooks/useLocalAgent'
import { useTranslation } from 'react-i18next'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'

export function AgentStatus() {
  const { t } = useTranslation('common')
  const { status, health, error, isDemoMode } = useLocalAgent()
  const [showSetup, setShowSetup] = useState(false)

  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
        {t('agentStatus.connectingToAgent')}
      </div>
    )
  }

  if (isDemoMode) {
    return (
      <>
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            {t('agentStatus.demoModeTitle')}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || t('agentStatus.demoModeDefaultMessage')}
          </p>
          <button
            onClick={() => setShowSetup(true)}
            className="mt-2 text-sm text-yellow-500 hover:text-yellow-400 underline underline-offset-2 transition-colors"
          >
            {t('agentStatus.howToConnect')}
          </button>
        </div>
        <SetupInstructionsDialog isOpen={showSetup} onClose={() => setShowSetup(false)} />
      </>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <div className="h-2 w-2 rounded-full bg-green-500" />
      {t('agentStatus.connectedToAgent', { version: health?.version })}
      {health?.clusters && t('agentStatus.clustersCount', { count: health.clusters })}
      {health?.hasClaude && t('agentStatus.claudeAvailable')}
    </div>
  )
}

export function AgentInstallBanner() {
  const { t } = useTranslation('common')
  const { isDemoMode } = useLocalAgent()

  if (!isDemoMode) return null

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const installCommand = 'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash'

  return (
    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-6">
      <h3 className="text-lg font-semibold">{t('agentStatus.connectToLocalEnv')}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('agentStatus.installAgentDescription')}
      </p>

      <div className="mt-4">
        <div className="text-sm font-medium mb-2">{t('agentStatus.copyAndPaste')}</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-4 py-3 text-sm font-mono select-all">
            {installCommand}
          </code>
          <button
            onClick={() => copyToClipboard(installCommand)}
            className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('agentSetup.copy')}
          </button>
        </div>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span>✓ {t('agentStatus.accessAllClusters')}</span>
        <span>✓ {t('agentStatus.realtimeTokenTracking')}</span>
        <span>✓ {t('agentStatus.runsLocally')}</span>
      </div>
    </div>
  )
}
