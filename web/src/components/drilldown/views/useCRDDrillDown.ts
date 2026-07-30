import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import type {
  CRDCondition,
  CRDConditionRaw,
  CRDInstance,
  CRDInstanceRaw,
  CRDVersion,
  CRDVersionRaw,
} from './CRDDrillDown.types'

/** Maximum number of custom resource instances rendered in the Instances tab. */
const MAX_INSTANCES = 50

export interface UseCRDDrillDownResult {
  agentConnected: boolean
  versions: CRDVersion[] | null
  versionsLoading: boolean
  versionsError: string | null
  instances: CRDInstance[] | null
  instancesLoading: boolean
  instancesError: string | null
  conditions: CRDCondition[] | null
  schema: Record<string, unknown> | null
  schemaLoading: boolean
  isEstablished: boolean
  fetchSchema: () => Promise<void>
}

/**
 * Owns all remote data loading for the CRD drill-down (versions, conditions,
 * instances and OpenAPI schema) so the view component stays presentational.
 */
export function useCRDDrillDown(cluster: string, crdName: string): UseCRDDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [versions, setVersions] = useState<CRDVersion[] | null>(null)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const [instances, setInstances] = useState<CRDInstance[] | null>(null)
  const [instancesLoading, setInstancesLoading] = useState(false)
  const [instancesError, setInstancesError] = useState<string | null>(null)
  const [conditions, setConditions] = useState<CRDCondition[] | null>(null)
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)

  // Fetch CRD details
  const fetchCRDDetails = useCallback(async () => {
    if (!agentConnected || versions) return
    setVersionsLoading(true)
    setVersionsError(null)
    try {
      const output = await runKubectl([
        'get', 'crd', crdName, '-o', 'json'
      ])
      if (output) {
        let crd
        try {
          crd = JSON.parse(output)
        } catch {
          setVersions([])
          setConditions([])
          setVersionsError('Failed to parse CRD data')
          setVersionsLoading(false)
          return
        }
        // Get versions
        const vers = crd.spec?.versions || []
        setVersions((vers as CRDVersionRaw[]).map((v) => ({
          name: v.name,
          served: v.served,
          storage: v.storage,
          deprecated: v.deprecated,
          deprecationWarning: v.deprecationWarning,
        })))

        // Get conditions
        const conds = crd.status?.conditions || []
        setConditions((conds as CRDConditionRaw[]).map((c) => ({
          type: c.type,
          status: c.status,
          reason: c.reason,
          message: c.message,
          lastTransitionTime: c.lastTransitionTime,
        })))

        // Get schema (from first served version)
        const servedVersion = (vers as CRDVersionRaw[]).find((v) => v.served)
        if (servedVersion?.schema?.openAPIV3Schema) {
          setSchema(servedVersion.schema.openAPIV3Schema)
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch CRD details'
      setVersions([])
      setConditions([])
      setVersionsError(errMsg)
    }
    setVersionsLoading(false)
  }, [agentConnected, versions, runKubectl, crdName])

  // Fetch CRD instances
  const fetchInstances = useCallback(async () => {
    if (!agentConnected || instances) return
    setInstancesLoading(true)
    setInstancesError(null)
    try {
      // Get the plural form from the CRD name (before the first dot)
      const plural = crdName.split('.')[0]
      const output = await runKubectl([
        'get', plural, '-A', '-o', 'json'
      ])
      if (output) {
        let data
        try {
          data = JSON.parse(output)
        } catch {
          setInstances([])
          setInstancesError('Failed to parse instances data')
          setInstancesLoading(false)
          return
        }
        const items = data.items || []
        setInstances((items as CRDInstanceRaw[]).slice(0, MAX_INSTANCES).map((item) => ({
          name: item.metadata?.name || 'Unknown',
          namespace: item.metadata?.namespace,
          creationTimestamp: item.metadata?.creationTimestamp,
        })))
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch instances'
      setInstances([])
      setInstancesError(errMsg)
    }
    setInstancesLoading(false)
  }, [agentConnected, instances, runKubectl, crdName])

  // Fetch schema separately if needed
  const fetchSchema = useCallback(async () => {
    if (!agentConnected || schema) return
    setSchemaLoading(true)
    try {
      const output = await runKubectl([
        'get', 'crd', crdName, '-o', 'json'
      ])
      if (output) {
        let crd
        try {
          crd = JSON.parse(output)
        } catch {
          setSchema(null)
          return
        }
        const vers = crd.spec?.versions || []
        const servedVersion = (vers as CRDVersionRaw[]).find((v) => v.served)
        if (servedVersion?.schema?.openAPIV3Schema) {
          setSchema(servedVersion.schema.openAPIV3Schema)
        }
      }
    } catch {
      // Schema not available
    }
    setSchemaLoading(false)
  }, [agentConnected, schema, runKubectl, crdName])

  // Track if we've already loaded data
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true

    const loadData = async () => {
      await Promise.all([fetchCRDDetails(), fetchInstances()])
    }
    loadData()
  }, [agentConnected, fetchCRDDetails, fetchInstances])

  // Check if established
  const isEstablished = conditions?.some(c => c.type === 'Established' && c.status === 'True') ?? true

  return {
    agentConnected,
    versions,
    versionsLoading,
    versionsError,
    instances,
    instancesLoading,
    instancesError,
    conditions,
    schema,
    schemaLoading,
    isEstablished,
    fetchSchema,
  }
}
