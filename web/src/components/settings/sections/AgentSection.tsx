import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plug, RefreshCw, Check, X, Copy, Cpu } from 'lucide-react'
import { Button } from '../../ui/Button'
import type { AgentHealth } from '../../../hooks/useLocalAgent'
import { useKagentBackend } from '../../../hooks/useKagentBackend'
import {
  UI_FEEDBACK_TIMEOUT_MS,
  RETRY_DELAY_MS,
} from '../../../lib/constants/network'
import { copyToClipboard } from '../../../lib/clipboard'
import { AgentBackendSettings } from './AgentBackendSettings'

interface AgentSectionProps {
  isConnected: boolean
  isInClusterMode?: boolean
  health: AgentHealth | null
  refresh: () => void | Promise<void>
}

const INSTALL_COMMAND =
  'curl -sSL https://raw.githubusercontent.com/kubestellar/console/main/start.sh | bash'

export function AgentSection({
  isConnected,
  isInClusterMode = false,
  health,
  refresh,
}: AgentSectionProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const timeoutRef = useRef<number>(undefined)
  const refreshTimerRef = useRef<number>(undefined)
  const {
    kagentAvailable,
    kagentStatus,
    kagentAgents,
    selectedKagentAgent,
    selectKagentAgent,
    kagentiAvailable,
    kagentiStatus,
    kagentiAgents,
    selectedKagentiAgent,
    selectKagentiAgent,
    preferredBackend,
    setPreferredBackend,
    activeBackend,
    refresh: refreshBackends,
  } = useKagentBackend()

  const copyInstallCommand = async () => {
    await copyToClipboard(INSTALL_COMMAND)
    setCopied(true)
    timeoutRef.current = window.setTimeout(
      () => setCopied(false),
      UI_FEEDBACK_TIMEOUT_MS,
    )
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.allSettled([Promise.resolve(refresh()), refreshBackends()])
    refreshTimerRef.current = window.setTimeout(
      () => setIsRefreshing(false),
      RETRY_DELAY_MS,
    )
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  const isAgentReady = isConnected || isInClusterMode

  return (
    <div id="agent-settings" className="glass rounded-xl p-6 space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${isAgentReady ? 'bg-green-500/20' : 'bg-orange-500/20'}`}
            >
              <Plug
                className={`w-5 h-5 ${isAgentReady ? 'text-green-400' : 'text-orange-400'}`}
              />
            </div>
            <div>
              <h2 className="text-lg font-medium text-foreground">
                {t('settings.agent.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('settings.agent.subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="md"
            icon={
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            }
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            {t('settings.agent.refresh')}
          </Button>
        </div>

        <div
          className={`p-4 rounded-lg mb-4 ${isAgentReady ? 'bg-green-500/10 border border-green-500/20' : 'bg-orange-500/10 border border-orange-500/20'}`}
        >
          <div className="flex items-center gap-2">
            {isAgentReady ? (
              <>
                <Check className="w-5 h-5 text-green-400" />
                <span className="font-medium text-green-400">
                  {isInClusterMode && !isConnected
                    ? t('agent.clusterMode')
                    : t('settings.agent.connected')}
                </span>
                <span className="text-muted-foreground">
                  -{' '}
                  {isInClusterMode && !isConnected
                    ? t('agent.usingInClusterService')
                    : t('settings.agent.agentVersion', {
                        version: health?.version,
                      })}
                </span>
              </>
            ) : (
              <>
                <X className="w-5 h-5 text-orange-400" />
                <span className="font-medium text-orange-400">
                  {t('settings.agent.notConnected')}
                </span>
                <span className="text-muted-foreground">
                  - {t('settings.agent.usingDemoData')}
                </span>
              </>
            )}
          </div>
          {isConnected && health && (
            <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
              <span>
                {t('settings.agent.clustersCount', { count: health.clusters })}
              </span>
              {health.hasClaude && (
                <span>{t('settings.agent.claudeAvailable')}</span>
              )}
            </div>
          )}
        </div>

        {!isAgentReady && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('settings.agent.installInstructions')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-secondary font-mono text-sm select-all overflow-x-auto">
                {INSTALL_COMMAND}
              </code>
              <button
                onClick={() => void copyInstallCommand()}
                className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-lg bg-purple-500 text-white hover:bg-purple-600"
              >
                <Copy className="w-4 h-4" />
                {copied ? t('settings.agent.copied') : t('settings.agent.copy')}
              </button>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>✓ {t('settings.agent.featureClusters')}</span>
              <span>✓ {t('settings.agent.featureTokens')}</span>
              <span>✓ {t('settings.agent.featureLocal')}</span>
            </div>
          </div>
        )}

        {isConnected && health?.hasClaude && health.claude && (
          <div className="mt-4 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-5 h-5 text-purple-400" />
              <span className="font-medium text-purple-400">
                {t('settings.agent.claudeCode')}
              </span>
              <span className="text-muted-foreground text-sm">
                v{health.claude.version}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">
                  {t('settings.agent.thisSession')}
                </p>
                <p className="text-sm font-mono text-foreground">
                  {(
                    (health.claude.tokenUsage.session.input +
                      health.claude.tokenUsage.session.output) /
                    1000
                  ).toFixed(1)}
                  k
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.agent.tokens')}
                </p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">
                  {t('settings.agent.today')}
                </p>
                <p className="text-sm font-mono text-foreground">
                  {(
                    (health.claude.tokenUsage.today.input +
                      health.claude.tokenUsage.today.output) /
                    1000
                  ).toFixed(1)}
                  k
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.agent.tokens')}
                </p>
              </div>
              <div className="text-center p-3 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">
                  {t('settings.agent.thisMonth')}
                </p>
                <p className="text-sm font-mono text-foreground">
                  {(
                    (health.claude.tokenUsage.thisMonth.input +
                      health.claude.tokenUsage.thisMonth.output) /
                    1000000
                  ).toFixed(2)}
                  M
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.agent.tokens')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <AgentBackendSettings
        kagentAvailable={kagentAvailable}
        kagentStatus={kagentStatus}
        kagentAgents={kagentAgents}
        selectedKagentAgent={selectedKagentAgent}
        kagentiAvailable={kagentiAvailable}
        kagentiStatus={kagentiStatus}
        kagentiAgents={kagentiAgents}
        selectedKagentiAgent={selectedKagentiAgent}
        preferredBackend={preferredBackend}
        activeBackend={activeBackend}
        onSelectBackend={setPreferredBackend}
        onSelectKagentAgent={selectKagentAgent}
        onSelectKagentiAgent={selectKagentiAgent}
        onRefresh={refreshBackends}
        isRefreshing={isRefreshing}
      />
    </div>
  )
}
