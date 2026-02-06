import { useState, useEffect, useCallback, useRef } from 'react'
import { Key, Check, AlertCircle, Loader2, Trash2, Eye, EyeOff, ExternalLink, Copy, Plug } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AgentIcon } from './AgentIcon'
import { BaseModal } from '../../lib/modals'
import { KC_AGENT, AI_PROVIDER_DOCS } from '../../config/externalApis'

const INSTALL_COMMAND = KC_AGENT.installCommand

const KC_AGENT_URL = KC_AGENT.url

interface KeyStatus {
  provider: string
  displayName: string
  configured: boolean
  source?: 'env' | 'config'
  valid?: boolean
  error?: string
}

interface KeysStatusResponse {
  keys: KeyStatus[]
  configPath: string
}

interface APIKeySettingsProps {
  isOpen: boolean
  onClose: () => void
}

const PROVIDER_INFO: Record<string, { docsUrl: string; placeholder: string }> = {
  claude: {
    docsUrl: AI_PROVIDER_DOCS.claude,
    placeholder: 'sk-ant-api03-...',
  },
  openai: {
    docsUrl: AI_PROVIDER_DOCS.openai,
    placeholder: 'sk-...',
  },
  gemini: {
    docsUrl: AI_PROVIDER_DOCS.gemini,
    placeholder: 'AIza...',
  },
}

export function APIKeySettings({ isOpen, onClose }: APIKeySettingsProps) {
  const [keysStatus, setKeysStatus] = useState<KeyStatus[]>([])
  const [configPath, setConfigPath] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [newKeyValue, setNewKeyValue] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number>()

  const copyInstallCommand = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND)
    setCopied(true)
    timeoutRef.current = setTimeout(() => setCopied(false), 2000)
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const fetchKeysStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`)
      if (!response.ok) {
        throw new Error('Failed to fetch key status')
      }
      const data: KeysStatusResponse = await response.json()
      setKeysStatus(data.keys)
      setConfigPath(data.configPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to agent')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      fetchKeysStatus()
    }
  }, [isOpen, fetchKeysStatus])

  const handleSaveKey = async (provider: string) => {
    if (!newKeyValue.trim()) return

    try {
      setSaving(true)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: newKeyValue }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to save key')
      }

      // Success - refresh status and close edit mode
      setEditingProvider(null)
      setNewKeyValue('')
      setShowKey(false)
      await fetchKeysStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteKey = async (provider: string) => {
    try {
      setSaving(true)
      const response = await fetch(`${KC_AGENT_URL}/settings/keys/${provider}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.message || 'Failed to delete key')
      }

      await fetchKeysStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete key')
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

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="md">
      <BaseModal.Header
        title="API Key Settings"
        icon={Key}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Content>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error && keysStatus.length === 0 ? (
            <div className="text-center py-6">
              <div className="p-3 rounded-full bg-orange-500/20 w-fit mx-auto mb-4">
                <Plug className="w-8 h-8 text-orange-400" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">Local Agent Required</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Install and start the local agent to configure API keys.
              </p>

              <div className="bg-secondary/50 rounded-lg p-4 mb-4">
                <p className="text-xs text-muted-foreground mb-2">Run this command to install:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 rounded bg-background font-mono text-sm text-foreground text-left overflow-x-auto">
                    {INSTALL_COMMAND}
                  </code>
                  <button
                    onClick={copyInstallCommand}
                    className="shrink-0 flex items-center gap-1 px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/80"
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <button
                onClick={fetchKeysStatus}
                className="text-sm text-primary hover:underline"
              >
                Retry Connection
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
                    ? 'API key validation failed - the model may not be available for your account'
                    : error.includes('invalid_api_key') || error.includes('authentication')
                    ? 'Invalid API key - please check and try again'
                    : error.includes('rate_limit')
                    ? 'Rate limit exceeded - please try again later'
                    : 'Failed to validate API key - hover for details'}
                </div>
              )}

              {keysStatus.map((key) => (
                <div
                  key={key.provider}
                  className="p-4 bg-secondary/30 border border-border rounded-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <AgentIcon
                        provider={key.provider === 'claude' ? 'anthropic' : key.provider === 'openai' ? 'openai' : 'google'}
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
                                  Working
                                </span>
                              ) : key.valid === false ? (
                                <span className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertCircle className="w-3 h-3" />
                                  Invalid
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Check className="w-3 h-3" />
                                  Configured
                                </span>
                              )}
                              {key.source === 'env' && (
                                <span className="text-xs text-muted-foreground">(from env)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not configured</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {key.configured && key.source !== 'env' && (
                        <button
                          onClick={() => handleDeleteKey(key.provider)}
                          disabled={saving}
                          className="p-1.5 hover:bg-destructive/20 rounded transition-colors text-muted-foreground hover:text-destructive"
                          title="Remove key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <a
                        href={PROVIDER_INFO[key.provider]?.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-foreground"
                        title="Get API key"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
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
                          placeholder={PROVIDER_INFO[key.provider]?.placeholder || 'Enter API key'}
                          className="w-full px-3 py-2 pr-10 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
                            'Save & Validate'
                          )}
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={saving}
                          className="px-3 py-1.5 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80"
                        >
                          Cancel
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
                      {key.configured ? 'Update Key' : 'Add Key'}
                    </button>
                  )}

                  {key.source === 'env' && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Key is set via environment variable. Modify the environment to change it.
                    </p>
                  )}
                </div>
              ))}

              {configPath && (
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Keys saved to: <code className="bg-secondary px-1 rounded">{configPath}</code>
                </p>
              )}
            </div>
          )}
      </BaseModal.Content>

      <BaseModal.Footer>
        <p className="text-xs text-muted-foreground text-center flex-1">
          API keys are stored securely on your local machine and never sent to our servers.
        </p>
      </BaseModal.Footer>
    </BaseModal>
  )
}
