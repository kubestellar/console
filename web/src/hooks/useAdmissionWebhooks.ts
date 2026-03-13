/**
 * Admission Webhooks Hook with real backend API and demo data fallback
 *
 * Fetches live webhook data from GET /api/admission-webhooks.
 * Falls back to demo data when the API returns 503 (no k8s client)
 * or on network error.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClusters } from './useMCP'
import { STORAGE_KEY_TOKEN } from '../lib/constants'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../lib/constants/network'

// ============================================================================
// Constants
// ============================================================================

/** Cache expiry time — 5 minutes */
const CACHE_EXPIRY_MS = 300_000

/** Auto-refresh interval — 2 minutes */
const REFRESH_INTERVAL_MS = 120_000

/** Number of consecutive failures before marking as failed */
const FAILURE_THRESHOLD = 3

/** localStorage key for webhooks cache */
const CACHE_KEY = 'kc-admission-webhooks-cache'

/** HTTP status code returned when the backend has no k8s client */
const STATUS_SERVICE_UNAVAILABLE = 503

// ============================================================================
// Types
// ============================================================================

export interface WebhookData {
  name: string
  type: 'mutating' | 'validating'
  failurePolicy: 'Fail' | 'Ignore'
  matchPolicy: string
  rules: number
  cluster: string
}

interface WebhookListResponse {
  webhooks: WebhookData[]
  isDemoData: boolean
}

interface CachedData {
  data: WebhookData[]
  timestamp: number
  isDemoData: boolean
}

// ============================================================================
// Auth Helper
// ============================================================================

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Accept': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ============================================================================
// Cache Helpers
// ============================================================================

function loadFromCache(): CachedData | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as CachedData
      if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
        return parsed
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function saveToCache(data: WebhookData[], isDemoData: boolean): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
      isDemoData,
    }))
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

// ============================================================================
// Demo Data Generator
// ============================================================================

function getDemoWebhooks(clusterNames: string[]): WebhookData[] {
  const webhooks: WebhookData[] = []
  const names = clusterNames.length > 0 ? clusterNames : ['prod-us-east', 'prod-eu-west', 'staging']

  const templates: Omit<WebhookData, 'cluster'>[] = [
    { name: 'gatekeeper-validating', type: 'validating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 3 },
    { name: 'kyverno-resource-validating', type: 'validating', failurePolicy: 'Fail', matchPolicy: 'Equivalent', rules: 12 },
    { name: 'cert-manager-webhook', type: 'mutating', failurePolicy: 'Fail', matchPolicy: 'Exact', rules: 2 },
    { name: 'istio-sidecar-injector', type: 'mutating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 1 },
    { name: 'vault-agent-injector', type: 'mutating', failurePolicy: 'Ignore', matchPolicy: 'Exact', rules: 1 },
  ]

  for (const cluster of (names || [])) {
    const hash = cluster.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const count = 2 + (hash % 4) // 2-5 webhooks per cluster
    for (let i = 0; i < count && i < templates.length; i++) {
      webhooks.push({ ...templates[i], cluster })
    }
  }

  return webhooks
}

// ============================================================================
// Hook: useAdmissionWebhooks
// ============================================================================

export interface UseAdmissionWebhooksResult {
  webhooks: WebhookData[]
  isDemoData: boolean
  isLoading: boolean
  isFailed: boolean
  consecutiveFailures: number
  lastRefresh: number | null
  refetch: () => Promise<void>
}

export function useAdmissionWebhooks(): UseAdmissionWebhooksResult {
  const { deduplicatedClusters: clusters, isLoading: clustersLoading } = useClusters()

  const cachedData = useRef(loadFromCache())
  const [webhooks, setWebhooks] = useState<WebhookData[]>(cachedData.current?.data || [])
  const [isDemoData, setIsDemoData] = useState(cachedData.current?.isDemoData ?? true)
  const [isLoading, setIsLoading] = useState(!cachedData.current)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<number | null>(
    cachedData.current?.timestamp || null
  )
  const initialLoadDone = useRef(!!cachedData.current)

  const refetch = useCallback(async (silent = false) => {
    if (!silent && !initialLoadDone.current) {
      setIsLoading(true)
    }

    try {
      const res = await fetch('/api/admission-webhooks', {
        headers: authHeaders(),
        signal: AbortSignal.timeout(FETCH_DEFAULT_TIMEOUT_MS),
      })

      if (res.status === STATUS_SERVICE_UNAVAILABLE) {
        throw new Error('Service unavailable')
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = (await res.json()) as WebhookListResponse

      if (data.isDemoData || (data.webhooks || []).length === 0) {
        throw new Error('No webhook data available')
      }

      setWebhooks(data.webhooks || [])
      setIsDemoData(false)
      setConsecutiveFailures(0)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(data.webhooks || [], false)
    } catch {
      const clusterNames = (clusters || []).filter(c => c.reachable !== false).map(c => c.name)
      const demoWebhooks = getDemoWebhooks(clusterNames)
      setWebhooks(demoWebhooks)
      setIsDemoData(true)
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(Date.now())
      initialLoadDone.current = true
      saveToCache(demoWebhooks, true)
    } finally {
      setIsLoading(false)
    }
  }, [clusters])

  // Initial load
  useEffect(() => {
    if (!clustersLoading) {
      refetch()
    }
  }, [clustersLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (!initialLoadDone.current) return

    const interval = setInterval(() => {
      refetch(true)
    }, REFRESH_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [refetch])

  return {
    webhooks,
    isDemoData,
    isLoading: isLoading || clustersLoading,
    isFailed: consecutiveFailures >= FAILURE_THRESHOLD,
    consecutiveFailures,
    lastRefresh,
    refetch: () => refetch(false),
  }
}
