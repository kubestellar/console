import { useState, useEffect, useCallback } from 'react'
import { useLocalAgent } from './useLocalAgent'
import { useAuth } from '../lib/auth'

// =============================================================================
// Types
// =============================================================================

export interface PersistenceConfig {
  enabled: boolean
  primaryCluster: string
  secondaryCluster?: string
  namespace: string
  syncMode: 'primary-only' | 'active-passive'
  lastModified?: string
}

export type ClusterHealth = 'healthy' | 'degraded' | 'unreachable' | 'unknown'

export interface PersistenceStatus {
  active: boolean
  activeCluster: string
  primaryHealth: ClusterHealth
  secondaryHealth?: ClusterHealth
  lastSync?: string
  failoverActive: boolean
  message?: string
}

export interface TestConnectionResult {
  cluster: string
  health: ClusterHealth
  success: boolean
}

// =============================================================================
// Default values
// =============================================================================

const DEFAULT_CONFIG: PersistenceConfig = {
  enabled: false,
  primaryCluster: '',
  namespace: 'kubestellar-console',
  syncMode: 'primary-only',
}

const DEFAULT_STATUS: PersistenceStatus = {
  active: false,
  activeCluster: '',
  primaryHealth: 'unknown',
  failoverActive: false,
  message: 'Not configured',
}

// =============================================================================
// Hook
// =============================================================================

export function usePersistence() {
  const { status: agentStatus } = useLocalAgent()
  const { token } = useAuth()
  const [config, setConfig] = useState<PersistenceConfig>(DEFAULT_CONFIG)
  const [status, setStatus] = useState<PersistenceStatus>(DEFAULT_STATUS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const isBackendAvailable = agentStatus === 'connected'
  // Only make API calls if user has a real token (not demo-token)
  const hasRealToken = !!token && token !== 'demo-token'

  // Fetch config from backend
  const fetchConfig = useCallback(async () => {
    if (!isBackendAvailable || !hasRealToken) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/persistence/config', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setConfig(data)
      }
      // Silently ignore 401 - user needs to re-authenticate
    } catch (err) {
      console.error('[usePersistence] Failed to fetch config:', err)
      setError('Failed to load persistence config')
    } finally {
      setLoading(false)
    }
  }, [isBackendAvailable, hasRealToken, token])

  // Fetch status from backend
  const fetchStatus = useCallback(async () => {
    if (!isBackendAvailable || !hasRealToken) return

    try {
      const response = await fetch('/api/persistence/status', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
      // Silently ignore 401 - user needs to re-authenticate
    } catch (err) {
      console.error('[usePersistence] Failed to fetch status:', err)
    }
  }, [isBackendAvailable, hasRealToken, token])

  // Update config
  const updateConfig = useCallback(async (newConfig: Partial<PersistenceConfig>): Promise<boolean> => {
    if (!isBackendAvailable) {
      setError('Backend not available')
      return false
    }

    try {
      const updatedConfig = { ...config, ...newConfig }
      const response = await fetch('/api/persistence/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      })

      if (response.ok) {
        const data = await response.json()
        setConfig(data)
        setError(null)
        // Refresh status after config change
        await fetchStatus()
        return true
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to update config')
        return false
      }
    } catch (err) {
      console.error('[usePersistence] Failed to update config:', err)
      setError('Failed to update config')
      return false
    }
  }, [isBackendAvailable, config, fetchStatus])

  // Enable persistence
  const enablePersistence = useCallback(async (primaryCluster: string, options?: {
    secondaryCluster?: string
    namespace?: string
    syncMode?: 'primary-only' | 'active-passive'
  }): Promise<boolean> => {
    return updateConfig({
      enabled: true,
      primaryCluster,
      secondaryCluster: options?.secondaryCluster,
      namespace: options?.namespace || 'kubestellar-console',
      syncMode: options?.syncMode || 'primary-only',
    })
  }, [updateConfig])

  // Disable persistence
  const disablePersistence = useCallback(async (): Promise<boolean> => {
    return updateConfig({ enabled: false })
  }, [updateConfig])

  // Test connection to a cluster
  const testConnection = useCallback(async (cluster: string): Promise<TestConnectionResult> => {
    if (!isBackendAvailable) {
      return { cluster, health: 'unknown', success: false }
    }

    try {
      const response = await fetch('/api/persistence/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      })

      if (response.ok) {
        return await response.json()
      }
    } catch (err) {
      console.error('[usePersistence] Failed to test connection:', err)
    }

    return { cluster, health: 'unknown', success: false }
  }, [isBackendAvailable])

  // Trigger sync
  const syncNow = useCallback(async (): Promise<boolean> => {
    if (!isBackendAvailable || !config.enabled) return false

    setSyncing(true)
    try {
      const response = await fetch('/api/persistence/sync', { method: 'POST' })
      if (response.ok) {
        await fetchStatus()
        return true
      }
    } catch (err) {
      console.error('[usePersistence] Failed to sync:', err)
    } finally {
      setSyncing(false)
    }
    return false
  }, [isBackendAvailable, config.enabled, fetchStatus])

  // Initial fetch
  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // Refresh status periodically when enabled
  useEffect(() => {
    if (!config.enabled || !isBackendAvailable) return

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [config.enabled, isBackendAvailable, fetchStatus])

  return {
    // Config
    config,
    updateConfig,

    // Status
    status,
    loading,
    error,
    syncing,

    // Computed
    isEnabled: config.enabled,
    isActive: status.active,
    activeCluster: status.activeCluster,
    isFailover: status.failoverActive,

    // Actions
    enablePersistence,
    disablePersistence,
    testConnection,
    syncNow,
    refreshStatus: fetchStatus,
  }
}

// =============================================================================
// Utility hook for checking if persistence should be used
// =============================================================================

export function useShouldUsePersistence(): boolean {
  const { isEnabled, isActive } = usePersistence()
  return isEnabled && isActive
}
