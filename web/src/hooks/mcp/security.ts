import { useState, useEffect, useCallback } from 'react'
import { MIN_REFRESH_INDICATOR_MS, REFRESH_INTERVAL_MS, getEffectiveInterval } from './shared'
import type { SecurityIssue, GitOpsDrift } from './types'

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
      if (!token || token === 'demo-token') {
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
  }, [cluster, namespace]) // Only refetch on parameter changes, not on refetch function change

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

// Hook to get GitOps drifts
export function useGitOpsDrifts(cluster?: string, namespace?: string) {
  const [drifts, setDrifts] = useState<GitOpsDrift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

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
      if (!token || token === 'demo-token') {
        setDrifts(getDemoGitOpsDrifts())
        setLastRefresh(new Date())
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
      setDrifts(data.drifts || [])
      setError(null)
      const now = new Date()
      setConsecutiveFailures(0)
      setLastRefresh(now)
    } catch (err) {
      setConsecutiveFailures(prev => prev + 1)
      setLastRefresh(new Date())
      if (!silent) {
        setError('Failed to fetch GitOps drifts')
        setDrifts(getDemoGitOpsDrifts())
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
      setIsRefreshing(false)
    }
  }, [cluster, namespace])

  useEffect(() => {
    refetch(false)
    // Poll every 30 seconds
    const interval = setInterval(() => refetch(true), getEffectiveInterval(REFRESH_INTERVAL_MS))
    return () => clearInterval(interval)
  }, [refetch])

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

// Demo data - cluster names must match getDemoClusters() in shared.ts
function getDemoGitOpsDrifts(): GitOpsDrift[] {
  return [
    {
      resource: 'api-gateway',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      kind: 'Deployment',
      driftType: 'modified',
      gitVersion: 'v2.4.0',
      details: 'Image tag changed from v2.4.0 to v2.4.1-hotfix',
      severity: 'medium',
    },
    {
      resource: 'config-secret',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      kind: 'Secret',
      driftType: 'modified',
      gitVersion: 'abc123',
      details: 'Secret data modified manually',
      severity: 'high',
    },
    {
      resource: 'debug-pod',
      namespace: 'default',
      cluster: 'gke-staging',
      kind: 'Pod',
      driftType: 'added',
      gitVersion: '-',
      details: 'Resource exists in cluster but not in Git',
      severity: 'low',
    },
  ]
}

// Demo data - cluster names must match getDemoClusters() in shared.ts
function getDemoSecurityIssues(): SecurityIssue[] {
  return [
    {
      name: 'api-server-7d8f9c6b5-x2k4m',
      namespace: 'production',
      cluster: 'eks-prod-us-east-1',
      issue: 'Privileged container',
      severity: 'high',
      details: 'Container running in privileged mode',
    },
    {
      name: 'worker-deployment',
      namespace: 'batch',
      cluster: 'vllm-gpu-cluster',
      issue: 'Running as root',
      severity: 'high',
      details: 'Container running as root user',
    },
    {
      name: 'nginx-ingress',
      namespace: 'ingress',
      cluster: 'eks-prod-us-east-1',
      issue: 'Host network enabled',
      severity: 'medium',
      details: 'Pod using host network namespace',
    },
    {
      name: 'monitoring-agent',
      namespace: 'monitoring',
      cluster: 'gke-staging',
      issue: 'Missing security context',
      severity: 'low',
      details: 'No security context defined',
    },
    {
      name: 'redis-cache',
      namespace: 'data',
      cluster: 'openshift-prod',
      issue: 'Capabilities not dropped',
      severity: 'medium',
      details: 'Container not dropping all capabilities',
    },
    {
      name: 'etcd-backup',
      namespace: 'kube-system',
      cluster: 'aks-dev-westeu',
      issue: 'Host path mount',
      severity: 'high',
      details: 'Container mounting host path /var/lib/etcd',
    },
  ]
}
