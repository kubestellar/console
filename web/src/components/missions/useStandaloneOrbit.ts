/**
 * useStandaloneOrbit -- state and lifecycle for `StandaloneOrbitDialog`.
 *
 * Owns orbit template selection, cadence, auto-run, cluster selection,
 * per-cluster resource scope, and the mission persistence flow. Extracted
 * from `StandaloneOrbitDialog.tsx` so the dialog stays presentational.
 */

import { useState, useCallback, useMemo } from 'react'
import { useClusters } from '../../hooks/mcp/clusters'
import { useMissions } from '../../hooks/useMissions'
import { getApplicableOrbitTemplates } from '../../lib/orbit/orbitTemplates'
import { ORBIT_DEFAULT_CADENCE } from '../../lib/constants/orbit'
import { emitOrbitMissionCreated } from '../../lib/analytics'
import { isDemoMode } from '../../lib/demoMode'
import type { OrbitType, OrbitConfig, OrbitResourceFilter, OrbitCadence } from '../../lib/missions/types'
import { buildScopeString, type StandaloneOrbitDialogProps } from './StandaloneOrbitDialog.helpers'

export function useStandaloneOrbit({ onClose, prefill }: StandaloneOrbitDialogProps) {
  const { saveMission } = useMissions()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()

  const templates = getApplicableOrbitTemplates(['*'])

  const [selectedOrbit, setSelectedOrbit] = useState<OrbitType | null>(
    templates.length > 0 ? templates[0].orbitType : null
  )
  const [cadence, setCadence] = useState<OrbitCadence>(ORBIT_DEFAULT_CADENCE)
  const [autoRun, setAutoRun] = useState(false)
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(
    new Set(prefill?.clusters ?? [])
  )
  const [resourceFilters, setResourceFilters] = useState<Record<string, OrbitResourceFilter[]>>(
    prefill?.resourceFilters ?? {}
  )
  const [showClusterPicker, setShowClusterPicker] = useState(
    (prefill?.clusters?.length ?? 0) > 0
  )
  const [showSetupDialog, setShowSetupDialog] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  // Issue 9373: confirm before creating an orbit with an empty cluster selection
  // (which would otherwise silently target every connected cluster).
  const [showAllClustersConfirm, setShowAllClustersConfirm] = useState(false)

  const clusters = useMemo(() => deduplicatedClusters || [], [deduplicatedClusters])

  const toggleCluster = useCallback((name: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
        // clean up filters for deselected cluster
        setResourceFilters(f => {
          const updated = { ...f }
          delete updated[name]
          return updated
        })
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  const selectAllClusters = useCallback(() => {
    setSelectedClusters(new Set(clusters.map(c => c.name)))
  }, [clusters])

  const deselectAllClusters = useCallback(() => {
    setSelectedClusters(new Set())
    setResourceFilters({})
  }, [])

  const handleScopeChange = useCallback((clusterName: string, filters: OrbitResourceFilter[]) => {
    setResourceFilters(prev => ({ ...prev, [clusterName]: filters }))
  }, [])

  // Actually build + persist the orbit mission. Split out so both the
  // primary Create button and the "run on all clusters" confirmation
  // can invoke it (Issue 9373).
  const persistOrbitMission = useCallback(async () => {
    if (!selectedOrbit) return

    const template = templates.find(tpl => tpl.orbitType === selectedOrbit)
    if (!template) return

    const clusterNames = [...selectedClusters]
    const title = clusterNames.length > 0
      ? `${template.title} -- ${clusterNames.join(', ')}`
      : template.title

    const activeFilters: Record<string, OrbitResourceFilter[]> = {}
    for (const [c, f] of Object.entries(resourceFilters)) {
      if (f.length > 0) activeFilters[c] = f
    }

    const orbitConfig: OrbitConfig = {
      cadence,
      orbitType: selectedOrbit,
      clusters: clusterNames,
      autoRun,
      lastRunAt: null,
      ...(Object.keys(activeFilters).length > 0 ? { resourceFilters: activeFilters } : {}),
    }

    setIsCreating(true)
    try {
      await Promise.resolve(saveMission({
        type: 'maintain',
        title,
        description: template.description,
        missionClass: 'orbit',
        steps: template.steps.map(s => ({ title: s.title, description: s.description })),
        tags: ['orbit', selectedOrbit, cadence],
        initialPrompt: template.description + buildScopeString(activeFilters),
        context: { orbitConfig },
      }))

      emitOrbitMissionCreated(selectedOrbit, cadence)
      onClose()
    } finally {
      setIsCreating(false)
    }
  }, [selectedOrbit, cadence, autoRun, selectedClusters, resourceFilters, templates, saveMission, onClose])

  const handleCreate = useCallback(() => {
    if (!selectedOrbit) return

    // In demo mode, redirect to local install setup dialog
    if (isDemoMode()) {
      setShowSetupDialog(true)
      return
    }

    // Issue 9373: If the user left the cluster picker empty we would
    // otherwise silently target every connected cluster. Surface a
    // confirmation modal instead of proceeding silently.
    if (selectedClusters.size === 0 && clusters.length > 0) {
      setShowAllClustersConfirm(true)
      return
    }

    void persistOrbitMission()
  }, [selectedOrbit, selectedClusters, clusters.length, persistOrbitMission])

  const handleConfirmAllClusters = useCallback(() => {
    setShowAllClustersConfirm(false)
    void persistOrbitMission()
  }, [persistOrbitMission])

  return {
    templates,
    clusters,
    clustersLoading,
    selectedOrbit,
    setSelectedOrbit,
    cadence,
    setCadence,
    autoRun,
    setAutoRun,
    selectedClusters,
    resourceFilters,
    showClusterPicker,
    setShowClusterPicker,
    showSetupDialog,
    setShowSetupDialog,
    isCreating,
    showAllClustersConfirm,
    setShowAllClustersConfirm,
    toggleCluster,
    selectAllClusters,
    deselectAllClusters,
    handleScopeChange,
    handleCreate,
    handleConfirmAllClusters,
  }
}
