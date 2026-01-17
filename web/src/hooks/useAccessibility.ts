import { useState, useEffect, useCallback } from 'react'
import {
  AccessibilitySettings,
  loadAccessibilitySettings,
  saveAccessibilitySettings,
} from '../lib/accessibility'

/**
 * Hook for managing accessibility settings
 * Settings are persisted in localStorage
 */
export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    loadAccessibilitySettings()
  )

  // Listen for changes from other tabs/windows
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'accessibility-settings') {
        setSettings(loadAccessibilitySettings())
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Apply settings to document for CSS hooks
  useEffect(() => {
    const root = document.documentElement

    if (settings.colorBlindMode) {
      root.classList.add('color-blind-mode')
    } else {
      root.classList.remove('color-blind-mode')
    }

    if (settings.reduceMotion) {
      root.classList.add('reduce-motion')
    } else {
      root.classList.remove('reduce-motion')
    }

    if (settings.highContrast) {
      root.classList.add('high-contrast')
    } else {
      root.classList.remove('high-contrast')
    }
  }, [settings])

  const setColorBlindMode = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev, colorBlindMode: enabled }
      saveAccessibilitySettings(updated)
      return updated
    })
  }, [])

  const setReduceMotion = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev, reduceMotion: enabled }
      saveAccessibilitySettings(updated)
      return updated
    })
  }, [])

  const setHighContrast = useCallback((enabled: boolean) => {
    setSettings((prev) => {
      const updated = { ...prev, highContrast: enabled }
      saveAccessibilitySettings(updated)
      return updated
    })
  }, [])

  const updateSettings = useCallback((updates: Partial<AccessibilitySettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updates }
      saveAccessibilitySettings(updated)
      return updated
    })
  }, [])

  return {
    ...settings,
    setColorBlindMode,
    setReduceMotion,
    setHighContrast,
    updateSettings,
  }
}
