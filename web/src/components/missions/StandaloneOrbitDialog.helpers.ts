import type { OrbitCadence, OrbitResourceFilter } from '../../lib/missions/types'

export interface StandaloneOrbitDialogProps {
  onClose: () => void
  prefill?: {
    clusters?: string[]
    resourceFilters?: Record<string, OrbitResourceFilter[]>
  }
}

export const CADENCE_OPTIONS: OrbitCadence[] = ['daily', 'weekly', 'monthly']

// ---------------------------------------------------------------------------
// buildScopeString — injects resource filter selections into the orbit prompt
// ---------------------------------------------------------------------------

export function buildScopeString(filters: Record<string, OrbitResourceFilter[]>): string {
  const lines = Object.entries(filters)
    .filter(([, f]) => f.length > 0)
    .map(([cluster, f]) => {
      const parts = f.map(r =>
        r.clusterScoped
          ? `${r.kind} (cluster-scoped)`
          : (r.namespaces ?? []).length
            ? `${r.kind} in namespaces: ${(r.namespaces ?? []).join(', ') || 'all namespaces'}`
            : `${r.kind} (all namespaces)`
      )
      return `- ${cluster}: ${parts.join('; ')}`
    })
  return lines.length ? `\n\nFocus on:\n${lines.join('\n')}` : ''
}
