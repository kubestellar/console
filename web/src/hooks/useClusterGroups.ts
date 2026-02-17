import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePersistence } from './usePersistence'
import { useClusterGroups as useCRClusterGroups, ClusterGroup as CRClusterGroup } from './useConsoleCRs'
import { STORAGE_KEY_TOKEN } from '../lib/constants'

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
// Storage (localStorage fallback)
// ============================================================================

const STORAGE_KEY = 'kubestellar-cluster-groups'

function loadGroups(): ClusterGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
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
  return []
}

function saveGroups(groups: ClusterGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(STORAGE_KEY_TOKEN)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// ============================================================================
// CR <-> LocalGroup conversion helpers
// ============================================================================

function crToLocalGroup(cr: CRClusterGroup): ClusterGroup {
  const isDynamic = (cr.spec.dynamicFilters?.length ?? 0) > 0
  return {
    name: cr.metadata.name,
    kind: isDynamic ? 'dynamic' : 'static',
    clusters: cr.status?.matchedClusters ?? cr.spec.staticMembers ?? [],
    color: cr.spec.color,
    icon: cr.spec.icon,
    query: isDynamic ? {
      filters: cr.spec.dynamicFilters,
    } : undefined,
    lastEvaluated: cr.status?.lastEvaluated,
  }
}

function localGroupToCR(group: ClusterGroup): Omit<CRClusterGroup, 'apiVersion' | 'kind'> {
  return {
    metadata: { name: group.name },
    spec: {
      color: group.color,
      icon: group.icon,
      staticMembers: group.kind === 'static' ? group.clusters : undefined,
      dynamicFilters: group.kind === 'dynamic' && group.query?.filters ? group.query.filters : undefined,
    },
    status: {
      matchedClusters: group.clusters,
      lastEvaluated: group.lastEvaluated,
    },
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing user-defined cluster groups (static and dynamic).
 *
 * When persistence is enabled, groups are stored as ClusterGroup CRs.
 * Otherwise, falls back to localStorage with best-effort backend sync.
 */
export function useClusterGroups() {
  const { isEnabled, isActive } = usePersistence()
  const shouldUseCRs = isEnabled && isActive

  // CR-backed state
  const {
    items: crGroups,
    createItem: createCRGroup,
    updateItem: updateCRGroup,
    deleteItem: deleteCRGroup,
    refresh: refreshCRGroups,
    loading: crLoading,
  } = useCRClusterGroups()

  // localStorage-backed state (fallback)
  const [localGroups, setLocalGroups] = useState<ClusterGroup[]>(loadGroups)

  // Persist localStorage groups on change
  useEffect(() => {
    if (!shouldUseCRs) {
      saveGroups(localGroups)
    }
  }, [localGroups, shouldUseCRs])

  // Convert CR groups to local format
  const groups: ClusterGroup[] = useMemo(() => {
    if (shouldUseCRs) {
      return crGroups.map(crToLocalGroup)
    }
    return localGroups
  }, [shouldUseCRs, crGroups, localGroups])

  const createGroup = useCallback(async (group: ClusterGroup) => {
    if (shouldUseCRs) {
      // Create via CR
      await createCRGroup(localGroupToCR(group) as CRClusterGroup)
    } else {
      // localStorage mode
      setLocalGroups(prev => {
        if (prev.some(g => g.name === group.name)) {
          return prev.map(g => g.name === group.name ? group : g)
        }
        return [...prev, group]
      })

      // Best-effort sync to backend for cluster labeling
      try {
        await fetch('/api/cluster-groups', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(group),
        })
      } catch {
        // Backend sync is best-effort; localStorage is primary
      }
    }
  }, [shouldUseCRs, createCRGroup])

  const updateGroup = useCallback(async (name: string, updates: Partial<ClusterGroup>) => {
    if (shouldUseCRs) {
      // Find current CR and update
      const current = crGroups.find(g => g.metadata.name === name)
      if (current) {
        const localGroup = crToLocalGroup(current)
        const merged = { ...localGroup, ...updates, name: localGroup.name }
        await updateCRGroup(name, localGroupToCR(merged) as CRClusterGroup)
      }
    } else {
      setLocalGroups(prev => prev.map(g => {
        if (g.name !== name) return g
        return { ...g, ...updates, name: g.name }
      }))

      const group = localGroups.find(g => g.name === name)
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
    }
  }, [shouldUseCRs, crGroups, updateCRGroup, localGroups])

  const deleteGroup = useCallback(async (name: string) => {
    if (shouldUseCRs) {
      await deleteCRGroup(name)
    } else {
      setLocalGroups(prev => prev.filter(g => g.name !== name))

      try {
        await fetch(`/api/cluster-groups/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        })
      } catch {
        // best-effort
      }
    }
  }, [shouldUseCRs, deleteCRGroup])

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
      await updateGroup(name, { clusters, lastEvaluated })

      return clusters
    } catch {
      return group.clusters
    }
  }, [groups, updateGroup])

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
    // Persistence info
    isPersisted: shouldUseCRs,
    isLoading: shouldUseCRs ? crLoading : false,
    refresh: shouldUseCRs ? refreshCRGroups : undefined,
  }
}
