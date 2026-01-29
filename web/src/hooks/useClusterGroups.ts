import { useState, useEffect, useCallback } from 'react'

export interface ClusterGroup {
  name: string
  clusters: string[]
  color?: string
  icon?: string
}

const STORAGE_KEY = 'kubestellar-cluster-groups'

function loadGroups(): ClusterGroup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // ignore
  }
  return []
}

function saveGroups(groups: ClusterGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

/**
 * Hook for managing user-defined cluster groups.
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
        headers: { 'Content-Type': 'application/json' },
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
          headers: { 'Content-Type': 'application/json' },
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
      })
    } catch {
      // best-effort
    }
  }, [])

  const getGroupClusters = useCallback((name: string): string[] => {
    return groups.find(g => g.name === name)?.clusters ?? []
  }, [groups])

  return {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupClusters,
  }
}
