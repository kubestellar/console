import { useState, useCallback } from 'react'
import { Bot } from 'lucide-react'
import { useMissions } from '../../../hooks/useMissions'
import { useTranslation } from 'react-i18next'

export const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'

// Hook to check if any AI agent is available (API-based or CLI-based)
export function useApiKeyCheck() {
  const { t: _t } = useTranslation()
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const { agents, selectedAgent, openSidebar } = useMissions()

  // Check if any agent is available (bob, claude CLI, or API-based)
  const hasAvailableAgent = useCallback(() => {
    // First check if any agent in the list is available
    if (agents.some(a => a.available)) {
      return true
    }
    // Fallback: check for local API key
    const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
    return !!key && key.trim().length > 0
  }, [agents])

  // Deprecated: for backwards compatibility
  const hasApiKey = hasAvailableAgent

  const checkKeyAndRun = useCallback((onSuccess: () => void) => {
    if (hasAvailableAgent()) {
      onSuccess()
    } else {
      setShowKeyPrompt(true)
    }
  }, [hasAvailableAgent])

  const goToSettings = useCallback(() => {
    setShowKeyPrompt(false)
    // Open the sidebar which has agent settings
    openSidebar()
  }, [openSidebar])

  const dismissPrompt = useCallback(() => {
    setShowKeyPrompt(false)
  }, [])

  return {
    showKeyPrompt,
    checkKeyAndRun,
    goToSettings,
    dismissPrompt,
    hasApiKey,
    hasAvailableAgent,
    selectedAgent,
  }
}

// Reusable AI Agent Prompt Modal
export function ApiKeyPromptModal({ isOpen, onDismiss, onGoToSettings }: {
  isOpen: boolean
  onDismiss: () => void
  onGoToSettings: () => void
}) {
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
