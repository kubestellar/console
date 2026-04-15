import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMissions } from '../../../hooks/useMissions'
import { isAgentConnected } from '../../../hooks/useLocalAgent'
import { useToast } from '../../ui/Toast'
import { getSettingsWithHash } from '../../../config/routes'

export const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'

// Hash anchor for the API Keys section on the Settings page.
// Matches `id="api-keys-settings"` in components/settings/sections/APIKeysSection.tsx.
// Settings.tsx scrolls to the matching element on mount when the URL hash is set.
const SETTINGS_API_KEYS_HASH = 'api-keys-settings'

// Hook to check if any AI agent is available (API-based or CLI-based)
export function useApiKeyCheck() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
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

  // Deprecated: for backwards compatibility
  const hasApiKey = hasAvailableAgent

  const checkKeyAndRun = (onSuccess: () => void | Promise<void>) => {
    if (hasAvailableAgent()) {
      // Wrap in Promise.resolve so async callbacks (returning Promise) have their
      // rejections caught — without this, an unhandled rejection is created when
      // the caller passes an async function and the promise is discarded.
      Promise.resolve(onSuccess()).catch((err) => {
        console.error('[checkKeyAndRun] Mission callback failed:', err)
        showToast(err instanceof Error ? err.message : String(err) || 'Mission action failed. Please try again.', 'error')
      })
    } else {
      setShowKeyPrompt(true)
    }
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
    selectedAgent }
}

// Reusable AI Agent Prompt Modal
export function ApiKeyPromptModal({ isOpen, onDismiss, onGoToSettings }: {
  isOpen: boolean
  onDismiss: () => void
  onGoToSettings: () => void
}) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onDismiss])

  if (!isOpen) return null

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-lg">
      <div className="bg-card border border-border rounded-lg p-4 m-4 shadow-xl max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded bg-purple-500/20">
            <Bot className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-sm font-medium text-foreground">AI Agent Required</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          No AI agent available. Select an agent from the top navbar (bob, claude, or configure an API key) to use AI-powered diagnostics.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onGoToSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" />
            Select Agent
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
