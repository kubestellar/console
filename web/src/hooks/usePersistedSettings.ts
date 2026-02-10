import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'
import type { AllSettings } from '../lib/settingsTypes'
import {
  collectFromLocalStorage,
  restoreToLocalStorage,
  isLocalStorageEmpty,
  SETTINGS_CHANGED_EVENT,
} from '../lib/settingsSync'

const DEBOUNCE_MS = 1000

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'

/**
 * Central hook for persisting settings to ~/.kc/settings.json via the backend API.
 *
 * On mount:
 * - Fetches settings from backend
 * - If localStorage is empty (cache cleared), restores from backend file
 * - If localStorage has data but backend is empty, syncs localStorage → backend
 *
 * On settings change:
 * - Listens for SETTINGS_CHANGED_EVENT from individual hooks
 * - Debounced PUT to backend (1 second)
 */
export function usePersistedSettings() {
  const [loaded, setLoaded] = useState(false)
  const [restoredFromFile, setRestoredFromFile] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const filePath = '~/.kc/settings.json'
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Save current localStorage state to backend (debounced)
  const saveToBackend = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    setSyncStatus('saving')
    debounceTimer.current = setTimeout(async () => {
      try {
        const current = collectFromLocalStorage()
        await api.put('/api/settings', current)
        if (mountedRef.current) {
          setSyncStatus('saved')
          setLastSaved(new Date())
        }
      } catch {
        if (mountedRef.current) {
          setSyncStatus('error')
        }
        console.debug('[settings] failed to persist to backend')
      }
    }, DEBOUNCE_MS)
  }, [])

  // Export settings as encrypted backup file
  const exportSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/export', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'kc-settings-backup.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[settings] export failed:', err)
      throw err
    }
  }, [])

  // Import settings from a backup file
  const importSettings = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      await api.put('/api/settings/import', JSON.parse(text), { timeout: 10000 })
      // Reload settings from backend after import
      const { data } = await api.get<AllSettings>('/api/settings')
      if (data) {
        restoreToLocalStorage(data)
      }
      if (mountedRef.current) {
        setSyncStatus('saved')
        setLastSaved(new Date())
      }
    } catch (err) {
      console.error('[settings] import failed:', err)
      throw err
    }
  }, [])

  // Initial load from backend
  useEffect(() => {
    mountedRef.current = true

    async function loadSettings() {
      try {
        const { data } = await api.get<AllSettings>('/api/settings')
        if (!mountedRef.current) return

        if (isLocalStorageEmpty() && data) {
          // Cache was cleared — restore from backend file
          const hasData = data.theme || data.aiMode || data.githubToken ||
            Object.keys(data.apiKeys || {}).length > 0
          if (hasData) {
            restoreToLocalStorage(data)
            setRestoredFromFile(true)
          }
        } else {
          // localStorage has data — sync it to backend (initial sync)
          saveToBackend()
        }
        setSyncStatus('saved')
      } catch {
        // Backend unavailable — localStorage is sole source
        setSyncStatus('offline')
        console.debug('[settings] backend unavailable, using localStorage only')
      } finally {
        if (mountedRef.current) {
          setLoaded(true)
        }
      }
    }

    loadSettings()

    return () => {
      mountedRef.current = false
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [saveToBackend])

  // Listen for settings changes from individual hooks
  useEffect(() => {
    const handleChange = () => {
      saveToBackend()
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleChange)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleChange)
    }
  }, [saveToBackend])

  return {
    loaded,
    restoredFromFile,
    syncStatus,
    lastSaved,
    filePath,
    exportSettings,
    importSettings,
  }
}
