import { useState, useCallback } from 'react'
import { Key, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export const ANTHROPIC_KEY_STORAGE = 'kubestellar-anthropic-key'

// Hook to check and prompt for API key
export function useApiKeyCheck() {
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const navigate = useNavigate()

  const hasApiKey = useCallback(() => {
    const key = localStorage.getItem(ANTHROPIC_KEY_STORAGE)
    return !!key && key.trim().length > 0
  }, [])

  const checkKeyAndRun = useCallback((onSuccess: () => void) => {
    if (hasApiKey()) {
      onSuccess()
    } else {
      setShowKeyPrompt(true)
    }
  }, [hasApiKey])

  const goToSettings = useCallback(() => {
    setShowKeyPrompt(false)
    navigate('/settings')
  }, [navigate])

  const dismissPrompt = useCallback(() => {
    setShowKeyPrompt(false)
  }, [])

  return { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt, hasApiKey }
}

// Reusable API Key Prompt Modal
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
          <div className="p-1.5 rounded bg-orange-500/20">
            <Key className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="text-sm font-medium text-foreground">API Key Required</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Configure your Anthropic API key in Settings to use AI-powered diagnostics and repair features.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onGoToSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-purple-500 text-white text-xs font-medium hover:bg-purple-600 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
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
