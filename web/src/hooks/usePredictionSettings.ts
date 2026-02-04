import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_PREDICTION_SETTINGS, type PredictionSettings } from '../types/predictions'

const STORAGE_KEY = 'kubestellar-prediction-settings'
const SETTINGS_CHANGED_EVENT = 'kubestellar-prediction-settings-changed'

// Singleton state - shared across all hook instances
let sharedSettings: PredictionSettings = { ...DEFAULT_PREDICTION_SETTINGS }
const subscribers = new Set<(settings: PredictionSettings) => void>()

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      sharedSettings = { ...DEFAULT_PREDICTION_SETTINGS, ...parsed }
    } catch {
      // Invalid JSON, use defaults
    }
  }
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach(fn => fn(sharedSettings))
}

// Update shared settings
function updateSharedSettings(updates: Partial<PredictionSettings>) {
  sharedSettings = { ...sharedSettings, ...updates }
  notifySubscribers()
}

// Persist to localStorage
function persistSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sharedSettings))
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT))
}

/**
 * Hook to manage prediction settings
 * Settings are stored in localStorage and shared across all instances
 */
export function usePredictionSettings() {
  const [settings, setSettings] = useState<PredictionSettings>(sharedSettings)

  // Subscribe to shared state updates
  useEffect(() => {
    const handleUpdate = (newSettings: PredictionSettings) => {
      setSettings(newSettings)
    }
    subscribers.add(handleUpdate)
    setSettings(sharedSettings)

    return () => {
      subscribers.delete(handleUpdate)
    }
  }, [])

  // Listen for settings changes from other components/tabs
  useEffect(() => {
    const handleSettingsChange = () => {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          updateSharedSettings(parsed)
        } catch {
          // Invalid JSON, ignore
        }
      }
    }

    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) handleSettingsChange()
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  // Update settings (partial update supported)
  const updateSettings = useCallback((updates: Partial<PredictionSettings>) => {
    updateSharedSettings(updates)
    persistSettings()
  }, [])

  // Reset to defaults
  const resetSettings = useCallback(() => {
    updateSharedSettings(DEFAULT_PREDICTION_SETTINGS)
    persistSettings()
  }, [])

  // Toggle AI enabled
  const toggleAI = useCallback(() => {
    updateSharedSettings({ aiEnabled: !sharedSettings.aiEnabled })
    persistSettings()
  }, [])

  // Toggle consensus mode
  const toggleConsensus = useCallback(() => {
    updateSharedSettings({ consensusMode: !sharedSettings.consensusMode })
    persistSettings()
  }, [])

  // Update a single threshold
  const updateThreshold = useCallback((
    key: keyof PredictionSettings['thresholds'],
    value: number
  ) => {
    updateSharedSettings({
      thresholds: {
        ...sharedSettings.thresholds,
        [key]: value,
      },
    })
    persistSettings()
  }, [])

  return {
    settings,
    updateSettings,
    resetSettings,
    toggleAI,
    toggleConsensus,
    updateThreshold,
  }
}

/**
 * Get current prediction settings without subscribing to updates
 * Useful for one-time reads
 */
export function getPredictionSettings(): PredictionSettings {
  return sharedSettings
}

/**
 * Send settings to backend via WebSocket
 * Call this when WebSocket connects or settings change
 */
export function getSettingsForBackend(): PredictionSettings {
  return { ...sharedSettings }
}
