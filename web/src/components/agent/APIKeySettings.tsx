import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Key, Check, AlertCircle, Loader2, Trash2, Eye, EyeOff, ExternalLink, Copy, Plug } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AgentIcon } from './AgentIcon'
import { BaseModal, ConfirmDialog } from '../../lib/modals'
import { KC_AGENT, AI_PROVIDER_DOCS } from '../../config/externalApis'
import { useTranslation } from 'react-i18next'
import { emitApiKeyConfigured, emitApiKeyRemoved, emitConversionStep } from '../../lib/analytics'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants'
import { UI_FEEDBACK_TIMEOUT_MS } from '../../lib/constants/network'
import { copyToClipboard } from '../../lib/clipboard'

const INSTALL_COMMAND = KC_AGENT.installCommand

const KC_AGENT_URL = KC_AGENT.url

/** Body shape for POST /settings/keys when saving a Base URL override.
 *
 *  Empty draft = "Leave blank to use the compiled-in default" — send
 *  clearBaseURL:true so the backend removes the persisted override (and
 *  bypasses the missing_field guard that rejects all-empty requests).
 *  Non-empty draft sends the override value. See #8277. */
export function buildBaseURLPayload(provider: string, draft: string):
  | { provider: string; clearBaseURL: true }
  | { provider: string; baseURL: string } {
  return draft === ''
    ? { provider, clearBaseURL: true }
    : { provider, baseURL: draft }
}

interface KeyStatus {
  provider: string
  displayName: string
  configured: boolean
  source?: 'env' | 'config'
  valid?: boolean
  error?: string
  // Base URL metadata populated by the backend for providers that support
  // an endpoint override (local LLM runners + OpenAI-compatible gateways).
  // `baseURLEnvVar` is the name of the env var the operator would set to
  // override this value from the shell; used as a hint in the UI. Empty
  // string means the provider has no base URL override path.
  baseURL?: string
  baseURLEnvVar?: string
  baseURLSource?: 'env' | 'config'
}

/** Provider info from the backend agent registry (mirrors Go ProviderInfo). */
interface RegisteredProvider {
  name: string
  displayName: string
  description: string
  provider: string
  available: boolean
  capabilities: number
}

interface KeysStatusResponse {
  keys: KeyStatus[]
  configPath: string
  /** Live provider registry from the backend — used to filter the settings
   *  UI so it only displays providers that are actually registered (#9488). */
  registeredProviders?: RegisteredProvider[]
}

interface APIKeySettingsProps {
  isOpen: boolean
  onClose: () => void
}

// PROVIDER_INFO is a fallback lookup table for providers whose docs URL
// and key placeholder cannot be derived from the backend registry.
// The settings UI now sources its display list from the backend's
// registeredProviders field (#9488) — entries here are only consulted
// when the backend does not supply metadata for a given provider key.
const PROVIDER_INFO: Record<string, { docsUrl: string; placeholder: string }> = {
  'open-webui': {
    docsUrl: AI_PROVIDER_DOCS['open-webui'],
    placeholder: 'owui-...',
  },
  openrouter: {
    docsUrl: AI_PROVIDER_DOCS.openrouter,
    placeholder: 'sk-or-...',
  },
  groq: {
    docsUrl: AI_PROVIDER_DOCS.groq,
    placeholder: 'gsk_...',
  },
  // Local LLM runners. Most do not require an API key — set the
  // corresponding URL env var instead (see SECURITY-MODEL.md §3). The
  // placeholder advises the operator how to configure the runner today;
  // full UI support for base URL overrides is tracked as a follow-up.
  ollama: {
    docsUrl: 'https://ollama.com',
    placeholder: 'Set OLLAMA_URL env var (no key needed)',
  },
  llamacpp: {
    docsUrl: 'https://github.com/ggml-org/llama.cpp',
    placeholder: 'Set LLAMACPP_URL env var (no key needed)',
  },
  localai: {
    docsUrl: 'https://localai.io',
    placeholder: 'Set LOCALAI_URL env var (no key needed)',
  },
  vllm: {
    docsUrl: 'https://docs.vllm.ai',
    placeholder: 'Set VLLM_URL env var (no key needed)',
  },
  'lm-studio': {
    docsUrl: 'https://lmstudio.ai',
    placeholder: 'Set LM_STUDIO_URL env var (no key needed)',
  },
  rhaiis: {
    docsUrl: 'https://docs.redhat.com/en/documentation/red_hat_ai_inference_server/',
    placeholder: 'Set RHAIIS_URL env var (no key needed)',
  },
}

// Map backend provider key names to AgentIcon provider values.
// Only includes providers that are actually registered in the backend
// registry (see InitializeProviders in pkg/agent/registry.go). Stale
// entries for unregistered API-only / IDE providers were removed in
// #9488 to keep this in sync with the backend.
function providerToIconMap(provider: string): string {
  const map: Record<string, string> = {
    'open-webui': 'open-webui',
    openrouter: 'openrouter',
    groq: 'groq',
    // Local LLM runners — provider key matches the icon key 1:1
    ollama: 'ollama',
    llamacpp: 'llamacpp',
    localai: 'localai',
    vllm: 'vllm',
    'lm-studio': 'lm-studio',
    rhaiis: 'rhaiis',
  }
  return map[provider] || provider
}

export function APIKeySettings({ isOpen, onClose }: APIKeySettingsProps) {
  const { t } = useTranslation(['common', 'cards'])
  const [keysStatus, setKeysStatus] = useState<KeyStatus[]>([])
  const [registeredProviders, setRegisteredProviders] = useState<RegisteredProvider[]>([])
  const [configPath, setConfigPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [deleteConfirmProvider, setDeleteConfirmProvider] = useState<string | null>(null)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number>(undefined)
  // Advanced-section state: which provider rows are expanded, the draft
  // base URL value per expanded row, and a transient "saved, restart kc-agent"
  // flag so the user sees feedback after a successful POST.
  const [expandedAdvanced, setExpandedAdvanced] = useState<Set<string>>(new Set())
  const [baseURLDraft, setBaseURLDraft] = useState<Record<string, string>>({})
  const [baseURLSaved, setBaseURLSaved] = useState<Set<string>>(new Set())
  const [baseURLError, setBaseURLError] = useState<Record<string, string>>({})

  const toggleAdvanced = useCallback((provider: string, initialValue: string) => {
    setExpandedAdvanced(prev => {
      const next = new Set(prev)
      if (next.has(provider)) {
        next.delete(provider)
      } else {
        next.add(provider)
        setBaseURLDraft(d => ({ ...d, [provider]: initialValue }))
      }
      return next
    })
  }, [])

  const fetchKeysStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        throw new Error(t('agent.failedToFetchKeyStatus'))
      }
      const data: KeysStatusResponse = await response.json()
      setKeysStatus(data.keys)
      setRegisteredProviders(data.registeredProviders || [])
      setConfigPath(data.configPath)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('agent.failedToConnect'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (isOpen) {
      fetchKeysStatus()
    }
  }, [isOpen, fetchKeysStatus])

  const handleSaveBaseURL = useCallback(async (provider: string) => {
    const draft = (baseURLDraft[provider] ?? '').trim()
    setBaseURLError(e => ({ ...e, [provider]: '' }))
    try {
      setSaving(true)
      const body = buildBaseURLPayload(provider, draft)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (!response.ok) {
        let message = t('agent.failedToSaveKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }
      setBaseURLSaved(prev => new Set(prev).add(provider))
      // Refresh status so the row reflects the new resolved value.
      await fetchKeysStatus()
    } catch (err: unknown) {
      setBaseURLError(e => ({ ...e, [provider]: err instanceof Error ? err.message : t('agent.failedToSaveKey') }))
    } finally {
      setSaving(false)
    }
  }, [baseURLDraft, t, fetchKeysStatus])

  const copyInstallCommand = async () => {
    await copyToClipboard(INSTALL_COMMAND)
    setCopied(true)
    timeoutRef.current = window.setTimeout(() => setCopied(false), UI_FEEDBACK_TIMEOUT_MS)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleSaveKey = async (provider: string) => {
    if (!newKeyValue.trim()) return

    try {
      setSaving(true)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: newKeyValue }),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        let message = t('agent.failedToSaveKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }

      // Success - refresh status and close edit mode
      setEditingProvider(null)
      setNewKeyValue('')
      setShowKey(false)
      await fetchKeysStatus()
      emitApiKeyConfigured(provider)
      emitConversionStep(5, 'api_key', { provider })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('agent.failedToSaveKey'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (provider: string) => {
    try {
      setSaving(true)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys/${provider}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (!response.ok) {
        let message = t('agent.failedToDeleteKey')
        try {
          const data = await response.json()
          message = data.message || message
        } catch {
          // Response body was not JSON — use default message
        }
        throw new Error(message)
      }

      await fetchKeysStatus()
      emitApiKeyRemoved(provider)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('agent.failedToDeleteKey'))
    } finally {
      setSaving(false)
    }
  }

  const startEditing = (provider: string) => {
    setEditingProvider(provider)
    setNewKeyValue('')
    setShowKey(false)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingProvider(null)
    setNewKeyValue('')
    setShowKey(false)
  }

  // Filter displayed keys to only show providers that are actually
  // registered in the backend's provider registry. When the registry
  // data is unavailable (older kc-agent, network error), fall back to
  // showing all keys returned by the backend (#9488).
  const filteredKeys = useMemo(() => {
    if (registeredProviders.length === 0) return keysStatus
    const registeredNames = new Set(
      (registeredProviders || []).map(p => p.name),
    )
    return keysStatus.filter(k => registeredNames.has(k.provider))
  }, [keysStatus, registeredProviders])

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md" closeOnBackdrop={false}>
      <BaseModal.Header
        title={t('agent.apiKeySettings')}
        icon={Key}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error && filteredKeys.length === 0 ? (
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
                    {INSTALL_COMMAND}
                  </code>
                  <button
                    onClick={copyInstallCommand}
                    className="shrink-0 flex items-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/80"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? t('actions.copied') : t('actions.copy')}
                  </button>
                </div>
              </div>

              <button
                onClick={fetchKeysStatus}
                className="text-sm text-primary hover:underline"
              >
                {t('agent.retryConnection')}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div
                  className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive cursor-help"
                  title={error}
                >
                  {error.includes('not_found_error')
                    ? t('agent.validationFailedModel')
                    : error.includes('invalid_api_key') || error.includes('authentication')
                    ? t('agent.invalidApiKey')
                    : error.includes('rate_limit')
                    ? t('agent.rateLimitExceeded')
                    : t('agent.failedToValidate')}
                </div>
              )}

              {filteredKeys.map((key) => (
                <div
                  key={key.provider}
                  className="p-4 bg-secondary/30 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AgentIcon
                        provider={providerToIconMap(key.provider)}
                        className="w-8 h-8"
                      />
                      <div>
                        <h3 className="font-medium text-foreground">{key.displayName}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {key.configured ? (
                            <>
                              {key.valid === true ? (
                                <span className="flex items-center gap-1 text-xs text-green-500">
                                  <Check className="w-3 h-3" />
                                  {t('agent.working')}
                                </span>
                              ) : key.valid === false ? (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertCircle className="w-3 h-3" />
                                  {t('agent.invalid')}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Check className="w-3 h-3" />
                                  {t('agent.configured')}
                                </span>
                              )}
                              {key.source === 'env' && (
                                <span className="text-xs text-muted-foreground">({t('agent.fromEnv')})</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t('agent.notConfigured')}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {key.configured && key.source !== 'env' && (
                        <button
                          onClick={() => setDeleteConfirmProvider(key.provider)}
                          disabled={saving}
                          className="p-1.5 hover:bg-destructive/20 rounded transition-colors text-muted-foreground hover:text-destructive"
                          title={t('agent.removeKey')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {PROVIDER_INFO[key.provider]?.docsUrl && (
                        <a
                          href={PROVIDER_INFO[key.provider].docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
                          title={t('agent.getApiKey')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Edit/Add key form */}
                  {editingProvider === key.provider ? (
                    <div className="mt-3 space-y-2">
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={newKeyValue}
                          onChange={(e) => setNewKeyValue(e.target.value)}
                          placeholder={PROVIDER_INFO[key.provider]?.placeholder || t('agent.enterApiKey')}
                          className="w-full px-3 py-2 pr-10 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveKey(key.provider)}
                          disabled={!newKeyValue.trim() || saving}
                          className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/80 disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                          ) : (
                            t('agent.saveAndValidate')
                          )}
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={saving}
                          className="px-3 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80"
                        >
                          {t('actions.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEditing(key.provider)}
                      disabled={key.source === 'env'}
                      className={cn(
                        'mt-3 w-full px-3 py-1.5 text-sm rounded-lg transition-colors',
                        key.source === 'env'
                          ? 'bg-secondary/50 text-muted-foreground cursor-not-allowed'
                          : 'bg-secondary hover:bg-secondary/80 text-foreground'
                      )}
                    >
                      {key.configured ? t('agent.updateKey') : t('agent.addKey')}
                    </button>
                  )}

                  {key.source === 'env' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('agent.envVariableNote')}
                    </p>
                  )}

                  {/* Advanced section — per-provider Base URL override.
                      Only shown for providers that actually support a base
                      URL override (the backend populates baseURLEnvVar for
                      those). Env-var source wins over the config file, so
                      the form is read-only when the env var is set. */}
                  {key.baseURLEnvVar && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(key.provider, key.baseURL ?? '')}
                        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span className={cn('transition-transform', expandedAdvanced.has(key.provider) ? 'rotate-90' : '')}>
                          ▸
                        </span>
                        {t('agent.advanced', 'Advanced')}
                        {key.baseURL && (
                          <span className="text-xs text-muted-foreground/70">
                            — {key.baseURL}
                            {key.baseURLSource === 'env' && ' (env)'}
                          </span>
                        )}
                      </button>
                      {expandedAdvanced.has(key.provider) && (
                        <div className="mt-2 space-y-2">
                          <label className="block text-xs font-medium text-foreground">
                            {t('agent.baseUrlLabel', 'Base URL')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('agent.baseUrlHint', 'Override the endpoint this provider talks to. Leave blank to use the compiled-in default. The {{env}} environment variable takes precedence when set.', { env: key.baseURLEnvVar })}
                          </p>
                          <input
                            type="text"
                            value={baseURLDraft[key.provider] ?? ''}
                            onChange={(e) => setBaseURLDraft(d => ({ ...d, [key.provider]: e.target.value }))}
                            placeholder={`http://<service>.<namespace>.svc.cluster.local:8080`}
                            disabled={key.baseURLSource === 'env'}
                            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
                          />
                          {baseURLError[key.provider] && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {baseURLError[key.provider]}
                            </p>
                          )}
                          {baseURLSaved.has(key.provider) && (
                            <p className="text-xs text-yellow-500 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {t('agent.baseUrlRestartHint', 'Saved. Restart kc-agent for the change to take effect.')}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSaveBaseURL(key.provider)}
                              disabled={saving || key.baseURLSource === 'env'}
                              className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/80 disabled:opacity-50"
                            >
                              {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                              ) : (
                                t('agent.saveBaseUrl', 'Save Base URL')
                              )}
                            </button>
                          </div>
                          {key.baseURLSource === 'env' && (
                            <p className="text-xs text-muted-foreground">
                              {t('agent.baseUrlFromEnv', '{{env}} is currently set. Unset it to edit this value from the UI.', { env: key.baseURLEnvVar })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {configPath && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  {t('agent.keysSavedTo')}: <code className="bg-secondary px-1 rounded">{configPath}</code>
                </p>
              )}
            </div>
          )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <p className="text-xs text-muted-foreground text-center flex-1">
          {t('agent.securityNote')}
        </p>
      </BaseModal.Footer>

      <ConfirmDialog
        isOpen={deleteConfirmProvider !== null}
        onClose={() => setDeleteConfirmProvider(null)}
        onConfirm={() => {
          if (deleteConfirmProvider) {
            handleDeleteKey(deleteConfirmProvider)
            setDeleteConfirmProvider(null)
          }
        }}
        title={t('agent.removeKey')}
        message={t('dashboard.delete.warning')}
        confirmLabel={t('actions.delete')}
        cancelLabel={t('actions.cancel')}
        variant="danger"
      />
    </BaseModal>
  )
}
