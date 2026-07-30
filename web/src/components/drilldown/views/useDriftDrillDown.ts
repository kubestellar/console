import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocalAgent } from '../../../hooks/useLocalAgent'
import { useDrillDownWebSocket } from '../../../hooks/useDrillDownWebSocket'
import type { DriftChange } from './drift-drilldown'

export interface UseDriftDrillDownResult {
  changes: DriftChange[] | null
  changesLoading: boolean
  changesError: string | null
  selectedChange: DriftChange | null
  setSelectedChange: (change: DriftChange | null) => void
}

/**
 * Owns all remote data loading for the Drift drill-down so the view
 * component stays presentational.
 */
export function useDriftDrillDown(
  cluster: string,
  namespace: string | undefined,
): UseDriftDrillDownResult {
  const { isConnected: agentConnected } = useLocalAgent()
  const { runKubectl } = useDrillDownWebSocket(cluster)

  const [changes, setChanges] = useState<DriftChange[] | null>(null)
  const [changesLoading, setChangesLoading] = useState(false)
  const [changesError, setChangesError] = useState<string | null>(null)
  const [selectedChange, setSelectedChange] = useState<DriftChange | null>(null)

  const fetchDriftDetails = useCallback(async () => {
    if (!agentConnected || changes) return
    setChangesLoading(true)
    setChangesError(null)
    try {
      // Try Flux Kustomization first
      if (namespace) {
        const output = await runKubectl(['get', 'kustomization', '-n', namespace, '-o', 'json'])
        if (output) {
          let ksList
          try {
            ksList = JSON.parse(output)
          } catch {
            setChanges([])
            setChangesError('Failed to parse drift data')
            setChangesLoading(false)
            return
          }
          const items = ksList.items || []
          const driftChanges: DriftChange[] = []

          for (const ks of items) {
            if (ks.metadata?.annotations?.['kustomize.toolkit.fluxcd.io/driftDetection'] === 'enabled') {
              const lastApplied = ks.status?.lastAppliedRevision
              const lastHandled = ks.status?.lastHandledReconcileAt
              if (lastApplied !== lastHandled) {
                driftChanges.push({
                  kind: 'Kustomization',
                  name: ks.metadata?.name || 'Unknown',
                  namespace: ks.metadata?.namespace,
                  changeType: 'modified',
                })
              }
            }
          }

          if (driftChanges.length > 0) {
            setChanges(driftChanges)
            setChangesLoading(false)
            return
          }
        }
      }

      // Fallback: ArgoCD Applications
      const argoOutput = await runKubectl(['get', 'applications.argoproj.io', '-A', '-o', 'json'])
      if (argoOutput) {
        let appList
        try {
          appList = JSON.parse(argoOutput)
        } catch {
          setChanges([])
          setChangesError('Failed to parse ArgoCD data')
          setChangesLoading(false)
          return
        }
        const apps = appList.items || []
        const driftChanges: DriftChange[] = []

        for (const app of apps) {
          const syncStatus = app.status?.sync?.status
          const resources = app.status?.resources || []

          if (syncStatus === 'OutOfSync') {
            for (const res of resources) {
              if (res.status === 'OutOfSync') {
                driftChanges.push({
                  kind: res.kind || 'Unknown',
                  name: res.name || 'Unknown',
                  namespace: res.namespace,
                  changeType: 'modified',
                })
              }
            }
          }
        }

        setChanges(driftChanges)
      } else {
        setChanges([])
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to fetch drift details'
      setChanges([])
      setChangesError(errMsg)
    }
    setChangesLoading(false)
  }, [agentConnected, changes, namespace, runKubectl])

  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!agentConnected || hasLoadedRef.current) return
    hasLoadedRef.current = true
    void fetchDriftDetails()
  }, [agentConnected, fetchDriftDetails])

  return { changes, changesLoading, changesError, selectedChange, setSelectedChange }
}
