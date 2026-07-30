import { useState, useEffect, useRef, useCallback } from 'react'
import type { Condition } from '../../../types/mcs'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import type { AppliedResource, InventoryEntryRaw } from './KustomizationDrillDown.types'

export interface UseKustomizationDrillDownResult {
  agentConnected: boolean
  appliedResources: AppliedResource[] | null
  resourcesLoading: boolean
  conditions: Condition[] | null
  conditionsLoading: boolean
}

/**
 * Owns remote data loading (applied resources + conditions) for the
 * Kustomization drill-down so the view component stays presentational.
 */
export function useKustomizationDrillDown(
  cluster: string,
  namespace: string,
  kustomizationName: string,
): UseKustomizationDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [appliedResources, setAppliedResources] = useState<AppliedResource[] | null>(null)
  const [resourcesLoading, setResourcesLoading] = useState(false)
  const [conditions, setConditions] = useState<Condition[] | null>(null)
  const [conditionsLoading, setConditionsLoading] = useState(false)

  // Fetch kustomization details
  const fetchDetails = useCallback(async () => {
    if (!agentConnected || appliedResources) return
    setResourcesLoading(true)
    setConditionsLoading(true)
    try {
      const output = await runKubectl([
        'get', 'kustomization', kustomizationName, '-n', namespace, '-o', 'json'
      ])
      if (output) {
        let ks
        try {
          ks = JSON.parse(output)
        } catch {
          setAppliedResources([])
          setConditions([])
          return
        }
        // Get applied resources from inventory
        const inventory = ks.status?.inventory?.entries || []
        setAppliedResources((inventory || []).map((entry: InventoryEntryRaw) => {
          // Parse inventory entry format: namespace_name_group_kind
          const parts = entry.id?.split('_') || []
          return {
            namespace: parts[0] || undefined,
            name: parts[1] || entry.id || 'Unknown',
            kind: parts[3] || 'Unknown',
            apiVersion: entry.v || undefined,
          }
        }))

        // Get conditions
        const conds = ks.status?.conditions || []
        setConditions((conds || []).map((c: Condition) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime,
        })))
      }
    } catch {
      setAppliedResources([])
      setConditions([])
    }
    setResourcesLoading(false)
    setConditionsLoading(false)
  }, [agentConnected, appliedResources, runKubectl, kustomizationName, namespace])

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    fetchDetails()
  }, [agentConnected, fetchDetails])

  return {
    agentConnected,
    appliedResources,
    resourcesLoading,
    conditions,
    conditionsLoading,
  }
}
