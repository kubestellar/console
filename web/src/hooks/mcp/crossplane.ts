import { useState, useEffect, useCallback, useRef } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from './shared'

export interface CrossplaneManagedResource {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    creationTimestamp: string
    annotations?: Record<string, string>
  }
  spec?: {
    providerConfigRef?: {
      name?: string
    }
  }
  status?: {
    conditions?: Array<{
      type: string
      status: 'True' | 'False' | 'Unknown'
      reason?: string
      message?: string
      lastTransitionTime?: string
    }>
  }
}

function getDemoManagedResources(): CrossplaneManagedResource[] {
  return [
    {
      apiVersion: 'rds.aws.crossplane.io/v1beta1',
      kind: 'RDSInstance',
      metadata: {
        name: 'prod-db',
        namespace: 'infra',
        creationTimestamp: '2026-02-10T10:00:00Z',
        annotations: {
          'crossplane.io/external-name': 'prod-db-abc123',
        },
      },
      spec: { providerConfigRef: { name: 'aws-provider' } },
      status: {
        conditions: [
          { type: 'Ready', status: 'True', reason: 'Available' },
          { type: 'Synced', status: 'True', reason: 'ReconcileSuccess' },
        ],
      },
    },
  ]
}

const CACHE_KEY = 'kc-crossplane-managed-cache'
const CACHE_TTL_MS = 30000
const REFRESH_INTERVAL_MS = 120000

interface ManagedCache {
  data: CrossplaneManagedResource[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  listeners: Set<(state: ManagedCacheState) => void>
}

interface ManagedCacheState {
  resources: CrossplaneManagedResource[]
  isLoading: boolean
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
  isDemoData: boolean
}

function loadFromStorage() {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return {
          data: parsed.data,
          timestamp: parsed.timestamp || 0,
        }
      }
    }
  } catch (err) {
    console.debug('[Crossplane] Failed to load cache:', err)
  }

  return { data: [], timestamp: 0 }
}

function saveToStorage(
  data: CrossplaneManagedResource[],
  timestamp: number
) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ data, timestamp })
    )
  } catch (err) {
    console.debug('[Crossplane] Failed to save cache:', err)
  }
}

const stored =
  typeof window !== 'undefined'
    ? loadFromStorage()
    : { data: [], timestamp: 0 }

const managedCache: ManagedCache = {
  data: stored.data,
  timestamp: stored.timestamp,
  consecutiveFailures: 0,
  lastError: null,
  listeners: new Set(),
}

export function useCrossplaneManagedResources(cluster?: string) {
  const [resources, setResources] = useState(managedCache.data)
  const [isLoading, setIsLoading] = useState(
    managedCache.data.length === 0
  )
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState(managedCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(
    managedCache.consecutiveFailures
  )
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    managedCache.timestamp || null
  )
  const [isDemoData, setIsDemoData] = useState(false)

  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  useEffect(() => {
    const handler = (state: ManagedCacheState) => {
      setResources(state.resources)
      setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }

    managedCache.listeners.add(handler)

    return () => {
      managedCache.listeners.delete(handler)
    }
  }, [])

  const notifyListeners = useCallback(
    (isRefreshing: boolean, isLoading = false, isDemoData = false) => {
      const state: ManagedCacheState = {
        resources: managedCache.data,
        isLoading,
        isRefreshing,
        consecutiveFailures: managedCache.consecutiveFailures,
        lastError: managedCache.lastError,
        lastRefresh:
          managedCache.timestamp > 0
            ? managedCache.timestamp
            : null,
        isDemoData,
      }

      managedCache.listeners.forEach(l => l(state))
    },
    []
  )

  const refetch = useCallback(
    async (silent = false) => {
      if (isNetlifyDeployment) {
        setIsLoading(false)
        setIsRefreshing(false)
        notifyListeners(false)
        return
      }

      if (!silent) setIsLoading(true)
      else {
        setIsRefreshing(true)
        notifyListeners(true)
      }

      try {
        const url = `/api/crossplane/managed-resources`

        if (isDemoMode()) {
          const demoData = getDemoManagedResources()

          if (!cluster) {
            managedCache.data = demoData
            managedCache.timestamp = Date.now()
            managedCache.consecutiveFailures = 0
            managedCache.lastError = null
            saveToStorage(demoData, managedCache.timestamp)
            notifyListeners(false, false, true)
          }

          setResources(demoData)
          setIsDemoData(true)
          setLastRefresh(Date.now())
          setIsLoading(false)

          setTimeout(() => {
            setIsRefreshing(false)
            notifyListeners(false, false, true)
          }, MIN_REFRESH_INDICATOR_MS)

          return
        }

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json()
        const newResources = data.resources || []

        if (!cluster) {
          managedCache.data = newResources
          managedCache.timestamp = Date.now()
          managedCache.consecutiveFailures = 0
          managedCache.lastError = null
          saveToStorage(newResources, managedCache.timestamp)
          notifyListeners(false)
        }

        setResources(newResources)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        setIsDemoData(false)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to fetch managed resources'

        if (!cluster) {
          managedCache.consecutiveFailures++
          managedCache.lastError = message
          notifyListeners(false)
        }

        setError(message)
        setConsecutiveFailures(prev => prev + 1)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
        if (!cluster) notifyListeners(false)
      }
    },
    [cluster, notifyListeners]
  )

  useEffect(() => {
    const now = Date.now()
    const cacheAge = now - managedCache.timestamp

    const cacheValid =
      !cluster &&
      managedCache.data.length > 0 &&
      cacheAge < CACHE_TTL_MS

    if (cacheValid) {
      setResources(managedCache.data)
      setIsLoading(false)

      if (cacheAge > CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    const interval = setInterval(
      () => refetch(true),
      getEffectiveInterval(REFRESH_INTERVAL_MS)
    )

    const unregister = registerRefetch(
      `crossplane-managed:${cluster || 'all'}`,
      () => refetch(false)
    )

    return () => {
      clearInterval(interval)
      unregister()
    }
  }, [refetch, cluster])

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  const isFailed = consecutiveFailures >= 3

  return {
    resources,
    isLoading,
    isRefreshing,
    error,
    refetch,
    consecutiveFailures,
    isFailed,
    lastRefresh,
    isDemoData,
  }
}

if (typeof window !== 'undefined') {
  registerCacheReset('crossplane-managed', () => {
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch (err) {
      console.debug('[Crossplane] Failed to clear cache:', err)
    }

    managedCache.data = []
    managedCache.timestamp = 0
    managedCache.consecutiveFailures = 0
    managedCache.lastError = null

    managedCache.listeners.forEach(listener =>
      listener({
        resources: [],
        isLoading: true,
        isRefreshing: false,
        consecutiveFailures: 0,
        lastError: null,
        lastRefresh: null,
        isDemoData: false,
      })
    )
  })
}
