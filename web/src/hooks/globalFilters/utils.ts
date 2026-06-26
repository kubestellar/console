import { detectCloudProvider } from '../../components/ui/CloudProviderIcon'
import type { ClusterInfo } from '../mcp/types'
import {
  DEFAULT_GROUPS,
  GROUPS_STORAGE_KEY,
  LEGACY_PROJECT_DEFINITIONS_KEY,
  LEGACY_PROJECT_SELECTED_KEY,
} from './constants'
import type { ClusterGroup, SavedFilterSet } from './types'

interface LegacyProjectDefinition {
  id: string
  name: string
  clusters: string[]
  color?: string
}

function readStoredJson(key: string): unknown {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export function loadStoredSelection<T extends string>(key: string): T[] {
  const parsed = readStoredJson(key)
  if (parsed === null) {
    return []
  }

  return Array.isArray(parsed) ? (parsed as T[]) : []
}

export function loadStoredText(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

export function loadStoredSavedFilterSets(key: string): SavedFilterSet[] {
  const parsed = readStoredJson(key)
  return Array.isArray(parsed) ? (parsed as SavedFilterSet[]) : []
}

export function loadStoredClusterGroups(): ClusterGroup[] {
  let groups = [...DEFAULT_GROUPS]
  const parsed = readStoredJson(GROUPS_STORAGE_KEY)

  if (Array.isArray(parsed)) {
    groups = parsed as ClusterGroup[]
  }

  try {
    const oldProjects = localStorage.getItem(LEGACY_PROJECT_DEFINITIONS_KEY)
    if (oldProjects) {
      const projects = JSON.parse(oldProjects) as LegacyProjectDefinition[]
      if (Array.isArray(projects) && projects.length > 0) {
        const existingNames = new Set(groups.map(group => group.name))
        const migratedGroups = projects
          .filter(project => !existingNames.has(project.name))
          .map(project => ({
            id: `migrated-${project.id}`,
            name: project.name,
            clusters: project.clusters || [],
            color: project.color,
          }))

        if (migratedGroups.length > 0) {
          groups = [...groups, ...migratedGroups]
          localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups))
        }
      }

      localStorage.removeItem(LEGACY_PROJECT_DEFINITIONS_KEY)
      localStorage.removeItem(LEGACY_PROJECT_SELECTED_KEY)
    }
  } catch {
    // Migration failed — not critical.
  }

  return groups
}

export function buildClusterInfoMap(clusters: ClusterInfo[]): Record<string, ClusterInfo> {
  const map: Record<string, ClusterInfo> = {}
  clusters.forEach(cluster => {
    map[cluster.name] = cluster
  })
  return map
}

export function getAvailableDistributions(clusters: ClusterInfo[]): string[] {
  const distributions = new Set<string>()

  for (const cluster of (clusters || [])) {
    const distribution = cluster.distribution || detectCloudProvider(cluster.name, cluster.server, cluster.namespaces, cluster.user) || 'unknown'
    distributions.add(distribution)
  }

  return Array.from(distributions).sort()
}

export function haveSameSelections(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())
}

export function matchesCustomText(item: Record<string, unknown>, query: string, searchFields: string[]): boolean {
  return searchFields.some(field => {
    const value = item[field]
    return typeof value === 'string' && value.toLowerCase().includes(query)
  })
}
