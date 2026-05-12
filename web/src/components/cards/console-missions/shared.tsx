import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import { isAgentConnected } from '../../../hooks/useLocalAgent'
import { agentFetch } from '../../../hooks/mcp/shared'
import { useToast } from '../../ui/Toast'
import { getSettingsWithHash } from '../../../config/routes'
import { emitError } from '../../../lib/analytics'
import { LOCAL_AGENT_HTTP_URL } from '../../../lib/constants/network'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../../lib/constants/network'

export const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'

// Hash anchor for the API Keys section on the Settings page.
// Matches `id="api-keys-settings"` in components/settings/sections/APIKeysSection.tsx.
// Settings.tsx scrolls to the matching element on mount when the URL hash is set.
const SETTINGS_API_KEYS_HASH = 'api-keys-settings'

interface KeyStatus {
  configured: boolean
  valid?: boolean
  error?: string
}

interface KeysStatusResponse {
  keys: KeyStatus[]
}

// Hook to check if any AI agent is available (API-based or CLI-based)
export function useApiKeyCheck() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const { agents, selectedAgent } = useMissions()

  // Check if any agent is available (bob, claude CLI, or API-based)
  const hasAvailableAgent = () => {
    // #8093 — A locally-connected kc-agent (the same thing the top-nav AI badge
    // reports as "Connected") is sufficient to run AI-powered actions like the
    // Cluster Health "Repair" button. The useMissions WebSocket-derived agents
    // list can be empty even when the local agent is healthy (e.g. before the
    // WS handshake completes, or when the agent only exposes API providers
    // without a CLI agent), so we check the local-agent HTTP health state too.
    if (isAgentConnected()) {
      return true
    }
    // Then check if any agent in the WS-reported list is available
    if (agents.some(a => a.available)) {
      return true
    }
    // Fallback: check for local API key
    const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
    return !!key && key.trim().length > 0
  }

  async function resolveAgentAvailability(): Promise<{ available: boolean; message?: string }> {
    if (agents.some(a => a.available)) {
      return { available: true }
    }

    const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
    if (key && key.trim().length > 0) {
      return { available: true }
    }

    if (!isAgentConnected()) {
      return {
        available: false,
        message: 'No AI API key configured. Add one in Settings to use AI-powered repair.',
      }
    }

    try {
      const response = await agentFetch(`${LOCAL_AGENT_HTTP_URL}/settings/keys`, {
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })
      if (response.ok) {
        const data: KeysStatusResponse = await response.json()
        const configuredKey = (data.keys || []).find(keyStatus => keyStatus.configured && keyStatus.valid !== false)
        if (configuredKey) {
          return { available: true }
        }

        const invalidKey = (data.keys || []).find(keyStatus => keyStatus.configured && keyStatus.valid === false)
        if (invalidKey) {
          return {
            available: false,
            message: invalidKey.error
              ? `AI API key is invalid: ${invalidKey.error}. Update it in Settings and try again.`
              : 'AI API key is invalid. Update it in Settings and try again.',
          }
        }

        return {
          available: false,
          message: 'No AI API key configured. Add one in Settings to use AI-powered repair.',
        }
      }
    } catch {
      // Preserve the previous connected-agent fallback if key inspection is unavailable.
    }

    return { available: hasAvailableAgent() }
  }

  // Deprecated: for backwards compatibility
  const hasApiKey = hasAvailableAgent

  const checkKeyAndRun = (onSuccess: () => void | Promise<void>) => {
    void resolveAgentAvailability().then(({ available, message }) => {
      if (available) {
        // Wrap in Promise.resolve so async callbacks (returning Promise) have their
        // rejections caught — without this, an unhandled rejection is created when
        // the caller passes an async function and the promise is discarded.
        Promise.resolve(onSuccess()).catch((err) => {
          console.error('[checkKeyAndRun] Mission callback failed:', err)
          showToast(err instanceof Error ? err.message : String(err) || 'Mission action failed. Please try again.', 'error')
        })
        return
      }

      if (message) {
        setErrorMessage(message)
        showToast(message, 'error')
      }
      setShowKeyPrompt(true)
    })
  }

  const goToSettings = () => {
    setShowKeyPrompt(false)
    // #8093 — Previously this opened the AI Missions sidebar, which has no
    // agent selector. Route directly to Settings → API Keys instead so users
    // can configure a provider when no agent is detected.
    navigate(getSettingsWithHash(SETTINGS_API_KEYS_HASH))
  }

  const dismissPrompt = () => {
    setShowKeyPrompt(false)
  }

  return {
    showKeyPrompt,
    checkKeyAndRun,
    goToSettings,
    dismissPrompt,
    hasApiKey,
    hasAvailableAgent,
    selectedAgent,
    errorMessage,
  }
}

// Reusable AI Agent Prompt Modal
export function ApiKeyPromptModal({ isOpen, onDismiss, onGoToSettings, errorMessage, fallbackContent }: {
  isOpen: boolean
  onDismiss: () => void
  onGoToSettings: () => void
  errorMessage?: string
  fallbackContent?: React.ReactNode
}) {
  useEffect(() => {
    if (!isOpen) return
    emitError('config', errorMessage || 'No AI agent available. Please configure an API key')
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss, errorMessage])

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-xs rounded-lg" role="dialog" aria-modal="true" aria-labelledby="api-key-prompt-title">
      <div className="bg-card border border-border rounded-lg p-4 m-4 shadow-xl max-w-md">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded bg-purple-500/20">
            <Bot className="w-4 h-4 text-purple-400" />
          </div>
          <h3 id="api-key-prompt-title" className="text-sm font-medium text-foreground">AI Agent Required</h3>
        </div>
        <div className="text-xs text-muted-foreground mb-4 space-y-2">
          <p>
            {errorMessage || 'No AI agent available. Configure an API key in Settings to use AI-powered diagnostics.'}
          </p>
          {fallbackContent && (
            <div className="mt-3 p-2 bg-secondary/50 rounded border border-border">
              {fallbackContent}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onGoToSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" />
            Go to Settings
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export interface ConsoleMissionCardProps {
  config?: Record<string, unknown>
}
