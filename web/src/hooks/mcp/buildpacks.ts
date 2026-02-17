import { useState, useEffect, useCallback, useRef } from 'react'
import { isNetlifyDeployment, isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerCacheReset, registerRefetch } from '../../lib/modeTransition'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { MIN_REFRESH_INDICATOR_MS, getEffectiveInterval } from './shared'

export interface BuildpackImage {
  name: string
  namespace: string
  builder: string
  image: string
  status: 'succeeded' | 'failed' | 'building' | 'unknown'
  updated: string
  cluster: string
}

function getDemoBuildpackImages(): BuildpackImage[] {
  return [
    {
      name: 'frontend-app',
      namespace: 'apps',
      builder: 'paketo-builder',
      image: 'registry.io/frontend:v1.2.0',
      status: 'succeeded',
      updated: new Date(Date.now() - 3600000).toISOString(),
      cluster: 'eks-prod-us-east-1',
    },
    {
      name: 'payments-api',
      namespace: 'backend',
      builder: 'paketo-builder',
      image: 'registry.io/payments:v3.4.1',
      status: 'failed',
      updated: new Date(Date.now() - 7200000).toISOString(),
      cluster: 'gke-staging',
    },
  ]
}

const BUILDPACK_CACHE_KEY = 'kc-buildpack-images-cache'
const BUILDPACK_CACHE_TTL_MS = 30000
const BUILDPACK_REFRESH_INTERVAL_MS = 120000

interface BuildpackCache {
  data: BuildpackImage[]
  timestamp: number
  consecutiveFailures: number
  lastError: string | null
  listeners: Set<(state: BuildpackCacheState) => void>
}

interface BuildpackCacheState {
  images: BuildpackImage[]
  isLoading: boolean
  isRefreshing: boolean
  consecutiveFailures: number
  lastError: string | null
  lastRefresh: number | null
  isDemoData: boolean 
}

function loadFromStorage(): { data: BuildpackImage[]; timestamp: number } {
  try {
    const stored = localStorage.getItem(BUILDPACK_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch (err) {
    console.debug('[Buildpacks] Failed to load from storage:', err)
  }
  return { data: [], timestamp: 0 }
}

function saveToStorage(data: BuildpackImage[], timestamp: number) {
  try {
    localStorage.setItem(
      BUILDPACK_CACHE_KEY,
      JSON.stringify({ data, timestamp })
    )
  } catch (err) {
    console.debug('[Buildpacks] Failed to save to storage:', err)
  }
}

const stored = typeof window !== 'undefined' ? loadFromStorage() : { data: [], timestamp: 0 }

const buildpackCache: BuildpackCache = {
  data: stored.data,
  timestamp: stored.timestamp,
  consecutiveFailures: 0,
  lastError: null,
  listeners: new Set(),
}

export function useBuildpackImages(cluster?: string) {
  const [images, setImages] = useState<BuildpackImage[]>(buildpackCache.data)
  const [isLoading, setIsLoading] = useState(buildpackCache.data.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(buildpackCache.lastError)
  const [consecutiveFailures, setConsecutiveFailures] = useState(
    buildpackCache.consecutiveFailures
  )
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    buildpackCache.timestamp || null
  )
  const [isDemoData, setIsDemoData] = useState(false)

  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  useEffect(() => {
    const handler = (state: BuildpackCacheState) => {
      setImages(state.images)
      setIsLoading(state.isLoading)
      setIsRefreshing(state.isRefreshing)
      setConsecutiveFailures(state.consecutiveFailures)
      setError(state.lastError)
      setLastRefresh(state.lastRefresh)
    }
    buildpackCache.listeners.add(handler)
    return () => {
      buildpackCache.listeners.delete(handler)
    }
  }, [])

  const notifyListeners = useCallback(
    (isRefreshing: boolean, isLoading = false, isDemoData = false) => {
      const state: BuildpackCacheState = {
        images: buildpackCache.data,
        isLoading,
        isRefreshing,
        consecutiveFailures: buildpackCache.consecutiveFailures,
        lastError: buildpackCache.lastError,
        lastRefresh:
          buildpackCache.timestamp > 0 ? buildpackCache.timestamp : null,
        isDemoData,
      }
      buildpackCache.listeners.forEach(l => l(state))
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
        const params = new URLSearchParams()
        if (cluster) params.append('cluster', cluster)
        
          // TODO: backend endpoint not yet implemented — returns 404 in live mode
        const url = `/api/gitops/buildpack-images?${params}`

        if (isDemoMode()) {
          const demoData = getDemoBuildpackImages()
          if (!cluster) {
            buildpackCache.data = demoData
            buildpackCache.timestamp = Date.now()
            buildpackCache.consecutiveFailures = 0
            buildpackCache.lastError = null
            saveToStorage(demoData, buildpackCache.timestamp)
            notifyListeners(false, false, true)
          }
          setImages(demoData)
          setIsDemoData(true)
          setLastRefresh(Date.now())
          setIsLoading(false)
          setTimeout(() => {
            setIsRefreshing(false)
            notifyListeners(false, false, true)
          }, MIN_REFRESH_INDICATOR_MS)
          return
        }

        const token = localStorage.getItem(STORAGE_KEY_TOKEN)
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(url, { method: 'GET', headers })
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }

        const data = await response.json() as { images: BuildpackImage[] }
        const newImages = data.images || []

        if (!cluster) {
          buildpackCache.data = newImages
          buildpackCache.timestamp = Date.now()
          buildpackCache.consecutiveFailures = 0
          buildpackCache.lastError = null
          saveToStorage(newImages, buildpackCache.timestamp)
          notifyListeners(false)
        }

        setImages(newImages)
        setError(null)
        setConsecutiveFailures(0)
        setLastRefresh(Date.now())
        setIsDemoData(false)
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to fetch Buildpack images'

        if (!cluster) {
          buildpackCache.consecutiveFailures++
          buildpackCache.lastError = message
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
    const cacheAge = now - buildpackCache.timestamp
    const cacheValid =
      !cluster &&
      buildpackCache.data.length > 0 &&
      cacheAge < BUILDPACK_CACHE_TTL_MS

    if (cacheValid) {
      setImages(buildpackCache.data)
      setIsLoading(false)
      if (cacheAge > BUILDPACK_CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch()
    }

    const interval = setInterval(
      () => refetch(true),
      getEffectiveInterval(BUILDPACK_REFRESH_INTERVAL_MS)
    )

    const unregister = registerRefetch(
      `buildpack-images:${cluster || 'all'}`,
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
    images,
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
  registerCacheReset('buildpack-images', () => {
    try {
      localStorage.removeItem(BUILDPACK_CACHE_KEY)
    } catch (err) {
      console.debug('[Buildpacks] Failed to remove cache from storage:', err)
    }

    buildpackCache.data = []
    buildpackCache.timestamp = 0
    buildpackCache.consecutiveFailures = 0
    buildpackCache.lastError = null

    buildpackCache.listeners.forEach(listener =>
      listener({
        images: [],
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
