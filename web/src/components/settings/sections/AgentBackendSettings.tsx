import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Monitor, RefreshCw, Check, ExternalLink, KeyRound } from 'lucide-react'
import { AgentIcon } from '../../agent/AgentIcon'
import type { AgentBackendType } from '../../../hooks/useKagentBackend'
import type { KagentAgent, KagentStatus } from '../../../lib/kagentBackend'
import {
  updateKagentiProviderConfig,
  type KagentiLLMProvider,
  type KagentiProviderAgent,
  type KagentiProviderStatus,
} from '../../../lib/kagentiProviderBackend'

interface AgentBackendSettingsProps {
  kagentAvailable: boolean
  kagentStatus: KagentStatus | null
  kagentAgents: KagentAgent[]
  selectedKagentAgent: KagentAgent | null
  kagentiAvailable: boolean
  kagentiStatus: KagentiProviderStatus | null
  kagentiAgents: KagentiProviderAgent[]
  selectedKagentiAgent: KagentiProviderAgent | null
  preferredBackend: AgentBackendType
  activeBackend: AgentBackendType
  onSelectBackend: (backend: AgentBackendType) => void
  onSelectKagentAgent: (agent: KagentAgent) => void
  onSelectKagentiAgent: (agent: KagentiProviderAgent) => void
  onRefresh: () => void | Promise<void>
  isRefreshing?: boolean
}

const DEFAULT_KAGENTI_PROVIDER: KagentiLLMProvider = 'gemini'
const KAGENTI_PROVIDER_OPTIONS: KagentiLLMProvider[] = ['gemini', 'anthropic', 'openai']
const MASKED_API_KEY_PLACEHOLDER = '••••••••••••••••'

export function AgentBackendSettings({
  kagentAvailable,
  kagentStatus,
  kagentAgents,
  selectedKagentAgent,
  kagentiAvailable,
  kagentiStatus,
  kagentiAgents,
  selectedKagentiAgent,
  preferredBackend,
  activeBackend,
  onSelectBackend,
  onSelectKagentAgent,
  onSelectKagentiAgent,
  onRefresh,
  isRefreshing = false,
}: AgentBackendSettingsProps) {
  const { t } = useTranslation()
  const [selectedProvider, setSelectedProvider] = useState<KagentiLLMProvider>(DEFAULT_KAGENTI_PROVIDER)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configSaved, setConfigSaved] = useState(false)

  useEffect(() => {
    if (kagentiStatus?.llm_provider) {
      setSelectedProvider(kagentiStatus.llm_provider)
      return
    }
    setSelectedProvider(DEFAULT_KAGENTI_PROVIDER)
  }, [kagentiStatus?.llm_provider])

  const configuredProviders = useMemo(
    () => kagentiStatus?.configured_providers || [],
    [kagentiStatus?.configured_providers],
  )
  const selectedProviderHasStoredKey = configuredProviders.includes(selectedProvider)

  const handleSaveKagentiConfig = async () => {
    if (!apiKeyDraft.trim() && !selectedProviderHasStoredKey) {
      setConfigSaved(false)
      setConfigError(t('settings.agentBackend.apiKeyRequired'))
      return
    }

    try {
      setIsSavingConfig(true)
      setConfigError(null)
      setConfigSaved(false)
      await updateKagentiProviderConfig({
        llm_provider: selectedProvider,
        api_key: apiKeyDraft.trim() || undefined,
      })
      setApiKeyDraft('')
      setConfigSaved(true)
      await Promise.resolve(onRefresh())
    } catch (error: unknown) {
      setConfigSaved(false)
      setConfigError(error instanceof Error ? error.message : t('settings.agentBackend.saveFailed'))
    } finally {
      setIsSavingConfig(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{t('settings.agentBackend.title')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('settings.agentBackend.subtitle')}
          </p>
        </div>
        <button
          onClick={() => void onRefresh()}
          aria-label={t('settings.agentBackend.refreshStatus')}
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title={t('settings.agentBackend.refreshStatus')}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onSelectBackend('kc-agent')}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kc-agent'
              ? 'border-blue-500 bg-blue-500/5'
              : 'border-border hover:border-border/80 hover:bg-accent/50'
          }`}
        >
          {preferredBackend === 'kc-agent' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-blue-400" />
          )}
          <Monitor className="w-5 h-5 text-blue-400 mb-2" />
          <div className="text-sm font-medium text-foreground">{t('settings.agentBackend.localAgent')}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t('settings.agentBackend.localAgentDesc')}
          </div>
        </button>

        <button
          onClick={() => onSelectBackend('kagent')}
          disabled={!kagentAvailable}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kagent'
              ? 'border-purple-500 bg-purple-500/5'
              : kagentAvailable
                ? 'border-border hover:border-border/80 hover:bg-accent/50'
                : 'border-border/50 opacity-50 cursor-not-allowed'
          }`}
        >
          {preferredBackend === 'kagent' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-purple-400" />
          )}
          <AgentIcon provider="kagent" className="w-5 h-5 mb-2" />
          <div className="text-sm font-medium text-foreground">{t('settings.agentBackend.kagent')}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {kagentAvailable ? t('settings.agentBackend.kagentDesc') : t('settings.agentBackend.kagentNotDetected')}
          </div>
          {!kagentAvailable && (
            <a
              href="https://github.com/kagent-dev/kagent"
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 mt-1.5"
            >
              {t('settings.agentBackend.install')} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>

        <button
          onClick={() => onSelectBackend('kagenti')}
          disabled={!kagentiAvailable}
          className={`relative p-3 rounded-lg border text-left transition-colors ${
            preferredBackend === 'kagenti'
              ? 'border-green-500 bg-green-500/5'
              : kagentiAvailable
                ? 'border-border hover:border-border/80 hover:bg-accent/50'
                : 'border-border/50 opacity-50 cursor-not-allowed'
          }`}
        >
          {preferredBackend === 'kagenti' && (
            <Check className="absolute top-2 right-2 w-3.5 h-3.5 text-green-400" />
          )}
          <AgentIcon provider="kagenti" className="w-5 h-5 mb-2" />
          <div className="text-sm font-medium text-foreground">{t('settings.agentBackend.kagenti')}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {kagentiAvailable ? t('settings.agentBackend.kagentiDesc') : t('settings.agentBackend.kagentiNotDetected')}
          </div>
          {!kagentiAvailable && (
            <a
              href="https://github.com/kagenti/kagenti"
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-green-400 hover:text-green-300 mt-1.5"
            >
              {t('settings.agentBackend.install')} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 text-xs">
        <div className={`w-1.5 h-1.5 rounded-full ${
          activeBackend === 'kagenti' ? 'bg-green-400' :
          activeBackend === 'kagent' ? 'bg-purple-400' : 'bg-blue-400'
        }`} />
        <span className="text-muted-foreground">
          {t('settings.agentBackend.activeLabel')} <span className="text-foreground font-medium">
            {activeBackend === 'kagenti' ? t('settings.agentBackend.kagentiInCluster') :
              activeBackend === 'kagent' ? t('settings.agentBackend.kagentInCluster') :
                t('settings.agentBackend.localAgentKcAgent')}
          </span>
        </span>
      </div>

      {preferredBackend === 'kagent' && kagentAvailable && kagentAgents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('settings.agentBackend.kagentAgents')}</h4>
          <div className="space-y-1">
            {(kagentAgents || []).map(agent => {
              const isSelected = selectedKagentAgent?.name === agent.name && selectedKagentAgent?.namespace === agent.namespace
              return (
                <button
                  key={`${agent.namespace}/${agent.name}`}
                  onClick={() => onSelectKagentAgent(agent)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected ? 'bg-purple-500/10 border border-purple-500/30' : 'hover:bg-accent border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-sm text-foreground">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.namespace}</span>
                    {agent.framework && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{agent.framework}</span>
                    )}
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5.5">{agent.description}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {preferredBackend === 'kagent' && kagentAvailable && kagentAgents.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-3 rounded-md bg-muted/30 text-xs text-muted-foreground">
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>{t('settings.agentBackend.noKagentAgents')}</span>
        </div>
      )}

      {preferredBackend === 'kagenti' && kagentiAvailable && kagentiAgents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('settings.agentBackend.kagentiAgents')}</h4>
          <div className="space-y-1">
            {(kagentiAgents || []).map(agent => {
              const isSelected = selectedKagentiAgent?.name === agent.name && selectedKagentiAgent?.namespace === agent.namespace
              return (
                <button
                  key={`${agent.namespace}/${agent.name}`}
                  onClick={() => onSelectKagentiAgent(agent)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isSelected ? 'bg-green-500/10 border border-green-500/30' : 'hover:bg-accent border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <span className="text-sm text-foreground">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.namespace}</span>
                    {agent.framework && (
                      <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{agent.framework}</span>
                    )}
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 pl-5.5">{agent.description}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {preferredBackend === 'kagenti' && kagentiAvailable && kagentiAgents.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-3 rounded-md bg-muted/30 text-xs text-muted-foreground">
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>{t('settings.agentBackend.noKagentiAgents')}</span>
        </div>
      )}

      {preferredBackend === 'kagenti' && kagentiAvailable && (
        <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-green-400" />
            <h4 className="text-sm font-medium text-foreground">{t('settings.agentBackend.providerConfigTitle')}</h4>
          </div>

          {kagentiStatus?.config_supported === false ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {kagentiStatus.config_reason || t('settings.agentBackend.configUnsupported')}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t('settings.agentBackend.currentProvider')}</span>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                    {kagentiStatus?.llm_provider
                      ? t(`settings.agentBackend.providers.${kagentiStatus.llm_provider}`)
                      : t('settings.agentBackend.providerUnknown')}
                  </div>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">{t('settings.agentBackend.providerSelector')}</span>
                  <select
                    value={selectedProvider}
                    onChange={event => {
                      setSelectedProvider(event.target.value as KagentiLLMProvider)
                      setConfigSaved(false)
                      setConfigError(null)
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {KAGENTI_PROVIDER_OPTIONS.map(provider => (
                      <option key={provider} value={provider}>
                        {t(`settings.agentBackend.providers.${provider}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t('settings.agentBackend.apiKeyLabel')}</span>
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={event => {
                    setApiKeyDraft(event.target.value)
                    setConfigSaved(false)
                    setConfigError(null)
                  }}
                  placeholder={selectedProviderHasStoredKey
                    ? MASKED_API_KEY_PLACEHOLDER
                    : t('settings.agentBackend.apiKeyPlaceholder')}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {selectedProviderHasStoredKey
                    ? t('settings.agentBackend.apiKeyMaskedHint')
                    : t('settings.agentBackend.apiKeyHint')}
                </p>
              </label>

              {configError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {configError}
                </div>
              )}
              {configSaved && (
                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                  {t('settings.agentBackend.saveSuccess')}
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {t('settings.agentBackend.rolloutHint')}
                </div>
                <button
                  onClick={() => void handleSaveKagentiConfig()}
                  disabled={isSavingConfig}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingConfig ? t('settings.agentBackend.saving') : t('settings.agentBackend.save')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {kagentStatus && !kagentAvailable && kagentStatus.reason && (
        <div className="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/30">
          Kagent: {kagentStatus.reason}
        </div>
      )}
      {kagentiStatus && !kagentiAvailable && kagentiStatus.reason && (
        <div className="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/30">
          Kagenti: {kagentiStatus.reason}
        </div>
      )}
    </div>
  )
}
