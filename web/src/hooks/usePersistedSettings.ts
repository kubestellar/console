import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/auth'
import type { AllSettings } from '../lib/settingsTypes'
import {
  collectFromLocalStorage,
  restoreToLocalStorage,
  isLocalStorageEmpty,
  SETTINGS_CHANGED_EVENT } from '../lib/settingsSync'
import { LOCAL_AGENT_HTTP_URL } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'
import { isNetlifyDeployment } from '../lib/demoMode'
import { safeRevokeObjectURL } from '../lib/download'

const DEBOUNCE_MS = 1000
const RETRY_DELAY_MS = 3000

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline'

/** Fetch helper that routes settings calls to the local kc-agent (saves to ~/.kc/settings.json).
 * Uses a generous timeout because the agent's HTTP/1.1 connection pool (6 per origin)
 * can be saturated by concurrent cluster health/data requests during page transitions. */
async function settingsFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${LOCAL_AGENT_HTTP_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // #10000 CSRF defence-in-depth
      ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  // Use .catch() on .json() to prevent Firefox from firing unhandledrejection
  // before the caller's try/catch processes the rejection (microtask timing issue).
  return response.json().catch(() => { throw new Error('Invalid JSON response') })
}

/**
 * Central hook for persisting settings to ~/.kc/settings.json via the local kc-agent.
 *
 * Settings are saved on the user's machine (not the cluster) by routing
 * all settings requests to the kc-agent at 127.0.0.1:8585.
 *
 * On mount:
 * - Fetches settings from the local agent
 * - If localStorage is empty (cache cleared), restores from the local settings file
 * - If localStorage has data but agent settings are empty, syncs localStorage → agent
 *
 * On settings change:
 * - Listens for SETTINGS_CHANGED_EVENT from individual hooks
 * - Debounced PUT to agent (1 second)
 */
export function usePersistedSettings() {
  const { isAuthenticated } = useAuth()
  const [loaded, setLoaded] = useState(false)
  const [restoredFromFile, setRestoredFromFile] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const filePath = '~/.kc/settings.json'
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Save current localStorage state to backend (debounced, with retry)
  const saveToBackend = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    setSyncStatus('saving')
    debounceTimer.current = setTimeout(async () => {
      try {
        const current = collectFromLocalStorage()
        // Retry once after a delay — transient failures are common during page
        // transitions when the agent's connection pool is saturated.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await settingsFetch('/settings', {
              method: 'PUT',
              body: JSON.stringify(current) })
            if (mountedRef.current) {
              setSyncStatus('saved')
              setLastSaved(new Date())
            }
            return
          } catch {
            if (attempt === 0) {
              await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
            }
          }
        }
        if (mountedRef.current) {
          setSyncStatus('error')
        }
        console.debug('[settings] failed to persist to local agent')
      } catch {
        // Unexpected error — set error state so UI shows sync failed
        if (mountedRef.current) {
          setSyncStatus('error')
        }
      }
    }, DEBOUNCE_MS)
  }, [])

  // Export settings as encrypted backup file
  const exportSettings = async () => {
    try {
      const response = await fetch(`${LOCAL_AGENT_HTTP_URL}/settings/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS) })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'kc-settings-backup.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      safeRevokeObjectURL(url)
    } catch (err) {
      console.error('[settings] export failed:', err)
      throw err
    }
  }

  // Import settings from a backup file
  const importSettings = async (file: File) => {
    try {
      const text = await file.text()
      await settingsFetch('/settings/import', {
        method: 'PUT',
        body: text,
        signal: AbortSignal.timeout(10000) })
      // Reload settings from backend after import
      const data = await settingsFetch<AllSettings>('/settings')
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
  }

  // Initial load from backend — re-runs when auth state changes
  useEffect(() => {
    mountedRef.current = true

    if (!isAuthenticated || isNetlifyDeployment) {
      // Not logged in yet or on Netlify (no local agent) — skip agent sync
      setSyncStatus(isNetlifyDeployment ? 'offline' : 'idle')
      setLoaded(true)
      return () => { mountedRef.current = false }
    }

    async function loadSettings() {
      try {
        const data = await settingsFetch<AllSettings>('/settings')
        if (!mountedRef.current) return

        // Determine whether the backend file has meaningful content
        const backendHasData = data && (
          data.theme || data.aiMode || data.feedbackGithubToken ||
          Object.keys(data.apiKeys || {}).length > 0)

        if (isLocalStorageEmpty() && backendHasData) {
          // Cache was cleared — restore from backend file
          restoreToLocalStorage(data)
          setRestoredFromFile(true)
        } else if (backendHasData) {
          // Both sides have data — backend is authoritative (#5426).
          // Merge: backend wins for any key it has, then push the merged
          // result back so the two stay in sync.
          restoreToLocalStorage(data)
          saveToBackend()
        } else {
          // Backend is empty but localStorage has data — seed the backend
          saveToBackend()
        }
        setSyncStatus('saved')
      } catch {
        // Agent unavailable — localStorage is sole source
        setSyncStatus('offline')
        console.debug('[settings] local agent unavailable, using localStorage only')
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
  }, [isAuthenticated, saveToBackend])

  // Listen for settings changes from individual hooks
  useEffect(() => {
    if (!isAuthenticated || isNetlifyDeployment) return
    const handleChange = () => {
      saveToBackend()
    }
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleChange)
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleChange)
    }
  }, [isAuthenticated, saveToBackend])

  return {
    loaded,
    restoredFromFile,
    syncStatus,
    lastSaved,
    filePath,
    exportSettings,
    importSettings }
}
