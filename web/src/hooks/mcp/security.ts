import { useState, useEffect, useCallback, useRef } from 'react'
import { isDemoMode } from '../../lib/demoMode'
import { useDemoMode } from '../useDemoMode'
import { registerRefetch } from '../../lib/modeTransition'
import { MIN_REFRESH_INDICATOR_MS, REFRESH_INTERVAL_MS, getEffectiveInterval } from './shared'
import type { SecurityIssue, GitOpsDrift } from './types'

// LocalStorage cache keys
const GITOPS_DRIFTS_CACHE_KEY = 'kc-gitops-drifts-cache'
const CACHE_TTL_MS = 30000 // 30 seconds before stale

// Load from localStorage
function loadGitOpsDriftsFromStorage(): { data: GitOpsDrift[], timestamp: number } {
  try {
    const stored = localStorage.getItem(GITOPS_DRIFTS_CACHE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed.data)) {
        return { data: parsed.data, timestamp: parsed.timestamp || 0 }
      }
    }
  } catch { /* ignore */ }
  return { data: [], timestamp: 0 }
}

// Save to localStorage
function saveGitOpsDriftsToStorage(data: GitOpsDrift[], timestamp: number) {
  try {
    localStorage.setItem(GITOPS_DRIFTS_CACHE_KEY, JSON.stringify({ data, timestamp }))
  } catch { /* ignore storage errors */ }
}

// Hook to get security issues
export function useSecurityIssues(cluster?: string, namespace?: string) {
  const [issues, setIssues] = useState<SecurityIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isUsingDemoData, setIsUsingDemoData] = useState(false)
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      // Only show loading spinner if no cached data
      setIssues(prev => {
        if (prev.length === 0) {
          setIsLoading(true)
        }
        return prev
      })
    }
    let hadNoData = false
    setIssues(prev => {
      hadNoData = prev.length === 0
      return prev
    })
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/mcp/security-issues?${params}`

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (isDemoMode()) {
        setIssues(getDemoSecurityIssues())
        const now = new Date()
        setLastUpdated(now)
        setLastRefresh(now)
        setIsLoading(false)
        if (!silent) {
          setIsRefreshing(true)
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
        }
        setIsUsingDemoData(true)
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { issues: SecurityIssue[] }
      setIssues(data.issues || [])
      setError(null)
      const now = new Date()
      setLastUpdated(now)
      setConsecutiveFailures(0)
      setLastRefresh(now)
      setIsUsingDemoData(false)
    } catch (err) {
      // Only set demo data if we don't have existing data and not silent
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent && hadNoData) {
        setError('Failed to fetch security issues')
        setIssues(getDemoSecurityIssues())
        setIsUsingDemoData(true)
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch()

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`security-issues:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch(false)
    })

    return () => {
      unregisterRefetch()
    }
  }, [cluster, namespace, refetch])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  return {
    issues,
    isLoading,
    isRefreshing,
    lastUpdated,
    error,
    refetch,
    consecutiveFailures,
    isFailed: consecutiveFailures >= 3,
    lastRefresh,
    isUsingDemoData,
  }
}

// Hook to get GitOps drifts with localStorage persistence
export function useGitOpsDrifts(cluster?: string, namespace?: string) {
  // Initialize from localStorage cache
  const storedDrifts = loadGitOpsDriftsFromStorage()
  const [drifts, setDrifts] = useState<GitOpsDrift[]>(storedDrifts.data)
  const [isLoading, setIsLoading] = useState(storedDrifts.data.length === 0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    storedDrifts.timestamp > 0 ? new Date(storedDrifts.timestamp) : null
  )
  const { isDemoMode: demoMode } = useDemoMode()
  const initialMountRef = useRef(true)

  const refetch = useCallback(async (silent = false) => {
    // For silent (background) refreshes, don't update loading states - prevents UI flashing
    if (!silent) {
      setIsRefreshing(true)
      // Only show loading spinner if no cached data
      setDrifts(prev => {
        if (prev.length === 0) {
          setIsLoading(true)
        }
        return prev
      })
    }
    try {
      const params = new URLSearchParams()
      if (cluster) params.append('cluster', cluster)
      if (namespace) params.append('namespace', namespace)
      const url = `/api/gitops/drifts?${params}`

      // Skip API calls when using demo token
      const token = localStorage.getItem('token')
      if (isDemoMode()) {
        const demoData = getDemoGitOpsDrifts()
        setDrifts(demoData)
        const now = Date.now()
        saveGitOpsDriftsToStorage(demoData, now)
        setLastRefresh(new Date(now))
        setIsLoading(false)
        if (!silent) {
          setIsRefreshing(true)
          setTimeout(() => setIsRefreshing(false), MIN_REFRESH_INDICATOR_MS)
        } else {
          setIsRefreshing(false)
        }
        return
      }

      // Use direct fetch to bypass the global circuit breaker
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      headers['Authorization'] = `Bearer ${token}`
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      const data = await response.json() as { drifts: GitOpsDrift[] }
      const newDrifts = data.drifts || []
      setDrifts(newDrifts)
      setError(null)
      const now = Date.now()
      setConsecutiveFailures(0)
      setLastRefresh(new Date(now))
      // Save to localStorage
      saveGitOpsDriftsToStorage(newDrifts, now)
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError('Failed to fetch GitOps drifts')
        const demoData = getDemoGitOpsDrifts()
        setDrifts(demoData)
        saveGitOpsDriftsToStorage(demoData, Date.now())
      }
      // Keep existing cached data on error
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    // Use cached data if fresh enough
    const cached = loadGitOpsDriftsFromStorage()
    const cacheAge = Date.now() - cached.timestamp
    const cacheValid = cached.data.length > 0 && cacheAge < CACHE_TTL_MS

    if (cacheValid) {
      setDrifts(cached.data)
      setIsLoading(false)
      // Still refresh in background if somewhat stale
      if (cacheAge > CACHE_TTL_MS / 2) {
        refetch(true)
      }
    } else {
      refetch(false)
    }

    // Poll every 30 seconds
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))

    // Register for unified mode transition refetch
    const unregisterRefetch = registerRefetch(`gitops-drifts:${cluster || 'all'}:${namespace || 'all'}`, () => {
      refetch(false)
    })

    return () => {
      clearInterval(interval)
      unregisterRefetch()
    }
  }, [refetch, cluster, namespace])

  // Re-fetch when demo mode changes (not on initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false
      return
    }
    refetch(false)
  }, [demoMode, refetch])

  return {
    drifts,
    isLoading,
    isRefreshing,
    error,
    refetch: () => refetch(false),
    isFailed: consecutiveFailures >= 3,
    consecutiveFailures,
    lastRefresh,
  }
}

function getDemoGitOpsDrifts(): GitOpsDrift[] {
  return [
    {
      resource: 'api-gateway',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Deployment',
      driftType: 'modified',
      gitVersion: 'v2.4.0',
      details: 'Image tag changed from v2.4.0 to v2.4.1-hotfix',
      severity: 'medium',
    },
    {
      resource: 'config-secret',
      namespace: 'production',
      cluster: 'prod-east',
      kind: 'Secret',
      driftType: 'modified',
      gitVersion: 'abc123',
      details: 'Secret data modified manually',
      severity: 'high',
    },
    {
      resource: 'debug-pod',
      namespace: 'default',
      cluster: 'staging',
      kind: 'Pod',
      driftType: 'added',
      gitVersion: '-',
      details: 'Resource exists in cluster but not in Git',
      severity: 'low',
    },
  ]
}

function getDemoSecurityIssues(): SecurityIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'prod-east',
      issue: 'Privileged container',
      severity: 'high',
      details: 'Container running in privileged mode',
    },
    {
      name: 'worker-deployment',
      namespace: 'batch',
      cluster: 'vllm-d',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
    {
      name: 'nginx-ingress',
      namespace: 'ingress',
      cluster: 'prod-east',
      issue: 'Host network enabled',
      severity: 'medium',
      details: 'Pod using host network namespace',
    },
    {
      name: 'monitoring-agent',
      namespace: 'monitoring',
      cluster: 'staging',
      issue: 'Missing security context',
      severity: 'low',
      details: 'No security context defined',
    },
  ]
}
