import { useState, useEffect, useCallback } from 'react'
import { getDemoMode } from './useDemoMode'

// ============================================================================
// Types
// ============================================================================

export type ClusterGroupKind = 'static' | 'dynamic'

export interface ClusterFilter {
  field: string    // 'healthy' | 'reachable' | 'cpuCores' | 'memoryGB' | 'nodeCount' | 'podCount'
  operator: string // 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  value: string
}

export interface ClusterGroupQuery {
  labelSelector?: string
  filters?: ClusterFilter[]
}

export interface ClusterGroup {
  name: string
  kind: ClusterGroupKind
  clusters: string[]
  color?: string
  icon?: string
  query?: ClusterGroupQuery
  lastEvaluated?: string
}

export interface AIQueryResult {
  suggestedName?: string
  query?: ClusterGroupQuery
  raw?: string
  error?: string
}

// ============================================================================
// Storage
// ============================================================================

const STORAGE_KEY = 'kubestellar-cluster-groups'

// Demo cluster groups for demo mode
function getDemoClusterGroups(): ClusterGroup[] {
  return [
    {
      name: 'Production',
      kind: 'static',
      clusters: ['prod-us-east', 'prod-us-west', 'prod-eu-west'],
      color: 'green',
      icon: 'Server',
    },
    {
      name: 'Staging',
      kind: 'static',
      clusters: ['staging-us', 'staging-eu'],
      color: 'yellow',
      icon: 'Layers',
    },
    {
      name: 'Development',
      kind: 'static',
      clusters: ['dev-local', 'kind-testing123'],
      color: 'blue',
      icon: 'Code',
    },
    {
      name: 'GPU Clusters',
      kind: 'dynamic',
      clusters: ['gpu-pool-1', 'gpu-pool-2', 'ml-training'],
      color: 'purple',
      icon: 'Cpu',
      query: {
        labelSelector: 'node.kubernetes.io/gpu=true',
      },
      lastEvaluated: new Date().toISOString(),
    },
    {
      name: 'High Memory',
      kind: 'dynamic',
      clusters: ['analytics-cluster', 'data-warehouse'],
      color: 'orange',
      icon: 'HardDrive',
      query: {
        filters: [{ field: 'memoryGB', operator: 'gte', value: '64' }],
      },
      lastEvaluated: new Date().toISOString(),
    },
  ]
}

function loadGroups(): ClusterGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate old groups without kind field
        return parsed.map(g => ({
          ...g,
          kind: g.kind || 'static',
        }))
      }
    }
  } catch {
    // ignore
  }
  // Return demo groups if in demo mode
  if (getDemoMode()) {
    return getDemoClusterGroups()
  }
  return []
}

function saveGroups(groups: ClusterGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing user-defined cluster groups (static and dynamic).
 * Groups are persisted in localStorage and synced to the backend
 * for cluster labeling (kubestellar.io/group=<name>).
 */
export function useClusterGroups() {
  const [groups, setGroups] = useState<ClusterGroup[]>(loadGroups)

  // Persist on change
  useEffect(() => {
    saveGroups(groups)
  }, [groups])

  const createGroup = useCallback(async (group: ClusterGroup) => {
    setGroups(prev => {
      if (prev.some(g => g.name === group.name)) {
        return prev.map(g => g.name === group.name ? group : g)
      }
      return [...prev, group]
    })

    // Sync to backend for cluster labeling
    try {
      await fetch('/api/cluster-groups', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(group),
      })
    } catch {
      // Backend sync is best-effort; localStorage is primary
    }
  }, [])

  const updateGroup = useCallback(async (name: string, updates: Partial<ClusterGroup>) => {
    setGroups(prev => prev.map(g => {
      if (g.name !== name) return g
      return { ...g, ...updates, name: g.name }
    }))

    const group = groups.find(g => g.name === name)
    if (group) {
      try {
        await fetch(`/api/cluster-groups/${encodeURIComponent(name)}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ ...group, ...updates }),
        })
      } catch {
        // best-effort
      }
    }
  }, [groups])

  const deleteGroup = useCallback(async (name: string) => {
    setGroups(prev => prev.filter(g => g.name !== name))

    try {
      await fetch(`/api/cluster-groups/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
    } catch {
      // best-effort
    }
  }, [])

  const getGroupClusters = useCallback((name: string): string[] => {
    return groups.find(g => g.name === name)?.clusters ?? []
  }, [groups])

  /** Evaluate a dynamic group's query against current cluster state */
  const evaluateGroup = useCallback(async (name: string): Promise<string[]> => {
    const group = groups.find(g => g.name === name)
    if (!group || group.kind !== 'dynamic' || !group.query) {
      return group?.clusters ?? []
    }

    try {
      const resp = await fetch('/api/cluster-groups/evaluate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(group.query),
      })
      if (!resp.ok) return group.clusters

      const data = await resp.json()
      const clusters: string[] = data.clusters ?? []
      const lastEvaluated = data.evaluatedAt ?? new Date().toISOString()

      // Update group with fresh results
      setGroups(prev => prev.map(g =>
        g.name === name ? { ...g, clusters, lastEvaluated } : g
      ))

      return clusters
    } catch {
      return group.clusters
    }
  }, [groups])

  /** Preview which clusters match a query without saving */
  const previewQuery = useCallback(async (query: ClusterGroupQuery): Promise<{ clusters: string[]; count: number }> => {
    try {
      const resp = await fetch('/api/cluster-groups/evaluate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(query),
      })
      if (!resp.ok) return { clusters: [], count: 0 }

      const data = await resp.json()
      return { clusters: data.clusters ?? [], count: data.count ?? 0 }
    } catch {
      return { clusters: [], count: 0 }
    }
  }, [])

  /** Use AI to generate a cluster query from natural language */
  const generateAIQuery = useCallback(async (prompt: string): Promise<AIQueryResult> => {
    try {
      const resp = await fetch('/api/cluster-groups/ai-query', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ prompt }),
      })
      if (!resp.ok) {
        return { error: `Request failed: ${resp.status}` }
      }

      const data = await resp.json()
      if (data.error && !data.query) {
        return { raw: data.raw, error: data.error }
      }

      return {
        suggestedName: data.suggestedName,
        query: data.query,
      }
    } catch {
      return { error: 'Failed to connect to AI service' }
    }
  }, [])

  return {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupClusters,
    evaluateGroup,
    previewQuery,
    generateAIQuery,
  }
}
