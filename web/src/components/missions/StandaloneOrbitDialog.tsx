/**
 * StandaloneOrbitDialog -- Create an orbit mission without a prior install mission.
 *
 * Allows users to pick an orbit template, cadence, auto-run toggle,
 * target clusters, and per-cluster resource scope (namespaced or cluster-scoped
 * Kubernetes objects), then saves the mission to the library.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Satellite, Orbit, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useClusters } from '../../hooks/mcp/clusters'
import { useMissions } from '../../hooks/useMissions'
import { useNamespaces } from '../../hooks/mcp/namespaces'
import { getApplicableOrbitTemplates } from '../../lib/orbit/orbitTemplates'
import { ORBIT_DEFAULT_CADENCE } from '../../lib/constants/orbit'
import { ORBIT_CLUSTER_SCOPED_KINDS, ORBIT_NAMESPACED_KINDS } from '../../lib/constants/k8sResources'
import { emitOrbitMissionCreated } from '../../lib/analytics'
import { isDemoMode } from '../../lib/demoMode'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import { ConfirmDialog } from '../../lib/modals'
import type { OrbitCadence, OrbitType, OrbitConfig, OrbitResourceFilter } from '../../lib/missions/types'

interface StandaloneOrbitDialogProps {
  onClose: () => void
  prefill?: {
    clusters?: string[]
    resourceFilters?: Record<string, OrbitResourceFilter[]>
  }
}

const CADENCE_OPTIONS: OrbitCadence[] = ['daily', 'weekly', 'monthly']

// ---------------------------------------------------------------------------
// ClusterScopeSection — per-cluster resource kind + namespace picker
// Must be a real component (not rendered inside a loop) so that
// useNamespaces() is called at the top level of a component, not inside a map.
// ---------------------------------------------------------------------------

interface ClusterScopeSectionProps {
  clusterName: string
  value: OrbitResourceFilter[]
  onChange: (clusterName: string, filters: OrbitResourceFilter[]) => void
}

function ClusterScopeSection({ clusterName, value, onChange }: ClusterScopeSectionProps) {
  const [expanded, setExpanded] = useState(value.length > 0)
  const { namespaces, isLoading: nsLoading } = useNamespaces(clusterName)
  const nsOptions = (namespaces || []) as string[]

  const isKindChecked = (kind: string) => value.some(f => f.kind === kind)

  const getNamespacesForKind = (kind: string): string[] =>
    value.find(f => f.kind === kind)?.namespaces ?? []

  const toggleKind = useCallback((meta: { kind: string; clusterScoped: boolean }) => {
    if (isKindChecked(meta.kind)) {
      onChange(clusterName, value.filter(f => f.kind !== meta.kind))
    } else {
      onChange(clusterName, [...value, { kind: meta.kind, clusterScoped: meta.clusterScoped, namespaces: [] }])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterName, value, onChange])

  const toggleNamespace = useCallback((kind: string, ns: string) => {
    const existing = value.find(f => f.kind === kind)
    if (!existing) return
    const nsSet = new Set(existing.namespaces ?? [])
    if (nsSet.has(ns)) nsSet.delete(ns)
    else nsSet.add(ns)
    onChange(clusterName, value.map(f => f.kind === kind ? { ...f, namespaces: [...nsSet] } : f))
  }, [clusterName, value, onChange])

  const activeCount = value.length

  // Group kinds by their `group` field for display
  const clusterGroups = ORBIT_CLUSTER_SCOPED_KINDS.reduce<Record<string, typeof ORBIT_CLUSTER_SCOPED_KINDS>>((acc, k) => {
    ;(acc[k.group] ??= []).push(k)
    return acc
  }, {})
  const namespacedGroups = ORBIT_NAMESPACED_KINDS.reduce<Record<string, typeof ORBIT_NAMESPACED_KINDS>>((acc, k) => {
    ;(acc[k.group] ??= []).push(k)
    return acc
  }, {})

  return (
    <div className="mt-1 ml-6 border-l border-border pl-3">
      <button
        onClick={() => setExpanded(p => !p)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <span>Scope</span>
        {activeCount > 0 && (
          <span className="bg-purple-500/20 text-purple-400 px-1 rounded-full">
            {activeCount}
          </span>
        )}
        {activeCount === 0 && <span className="text-[9px] opacity-50">(all resources)</span>}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {/* Cluster-scoped section */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Cluster-scoped</p>
            <div className="space-y-2">
              {Object.entries(clusterGroups).map(([group, kinds]) => (
                <div key={group}>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {kinds.map(k => (
                      <label key={k.kind} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isKindChecked(k.kind)}
                          onChange={() => toggleKind(k)}
                          className="accent-purple-500 w-3 h-3"
                        />
                        <span className={cn(
                          'text-[10px]',
                          isKindChecked(k.kind) ? 'text-foreground' : 'text-muted-foreground',
                        )}>{k.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Namespaced section */}
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-1">Namespaced</p>
            <div className="space-y-2">
              {Object.entries(namespacedGroups).map(([group, kinds]) => (
                <div key={group}>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60 mb-0.5">{group}</p>
                  <div className="space-y-1">
                    {kinds.map(k => (
                      <div key={k.kind}>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isKindChecked(k.kind)}
                            onChange={() => toggleKind(k)}
                            className="accent-purple-500 w-3 h-3"
                          />
                          <span className={cn(
                            'text-[10px]',
                            isKindChecked(k.kind) ? 'text-foreground' : 'text-muted-foreground',
                          )}>{k.label}</span>
                        </label>

                        {/* Namespace picker — only shown when kind is checked */}
                        {isKindChecked(k.kind) && (
                          <div className="ml-4 mt-1">
                            {nsLoading ? (
                              <span className="text-[9px] text-muted-foreground">Loading namespaces…</span>
                            ) : nsOptions.length === 0 ? (
                              <span className="text-[9px] text-muted-foreground">All namespaces</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {nsOptions.map(ns => {
                                  const checked = getNamespacesForKind(k.kind).includes(ns)
                                  return (
                                    <button
                                      key={ns}
                                      onClick={() => toggleNamespace(k.kind, ns)}
                                      className={cn(
                                        'text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                                        checked
                                          ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                          : 'border-border text-muted-foreground hover:border-purple-500/40',
                                      )}
                                    >
                                      {ns}
                                    </button>
                                  )
                                })}
                                {getNamespacesForKind(k.kind).length === 0 && (
                                  <span className="text-[9px] text-muted-foreground/60 self-center">all namespaces</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// buildScopeString — injects resource filter selections into the orbit prompt
// ---------------------------------------------------------------------------

function buildScopeString(filters: Record<string, OrbitResourceFilter[]>): string {
  const lines = Object.entries(filters)
    .filter(([, f]) => f.length > 0)
    .map(([cluster, f]) => {
      const parts = f.map(r =>
        r.clusterScoped
          ? `${r.kind} (cluster-scoped)`
          : (r.namespaces ?? []).length
            ? `${r.kind} in namespaces: ${r.namespaces!.join(', ')}`
            : `${r.kind} (all namespaces)`
      )
      return `- ${cluster}: ${parts.join('; ')}`
    })
  return lines.length ? `\n\nFocus on:\n${lines.join('\n')}` : ''
}

// ---------------------------------------------------------------------------
// StandaloneOrbitDialog
// ---------------------------------------------------------------------------

export function StandaloneOrbitDialog({ onClose, prefill }: StandaloneOrbitDialogProps) {
  const { t } = useTranslation()
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
  // Issue 9373: confirm before creating an orbit with an empty cluster selection
  // (which would otherwise silently target every connected cluster).
  const [showAllClustersConfirm, setShowAllClustersConfirm] = useState(false)

  const clusters = deduplicatedClusters || []

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
  const persistOrbitMission = useCallback(() => {
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

    saveMission({
      type: 'maintain',
      title,
      description: template.description,
      missionClass: 'orbit',
      steps: template.steps.map(s => ({ title: s.title, description: s.description })),
      tags: ['orbit', selectedOrbit, cadence],
      initialPrompt: template.description + buildScopeString(activeFilters),
      context: { orbitConfig },
    })

    emitOrbitMissionCreated(selectedOrbit, cadence)
    onClose()
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

    persistOrbitMission()
  }, [selectedOrbit, selectedClusters, clusters.length, persistOrbitMission])

  const handleConfirmAllClusters = useCallback(() => {
    setShowAllClustersConfirm(false)
    persistOrbitMission()
  }, [persistOrbitMission])

  return (
    <>
    <div
      className="fixed inset-0 z-500 flex items-center justify-center bg-black/50 backdrop-blur-xs"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div className="w-full max-w-2xl mx-4 rounded-xl border border-purple-500/30 bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-foreground">
              {t('orbit.standaloneTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Orbit type selection */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              {t('orbit.standaloneSelectType')}
            </label>
            <div className="space-y-1.5">
              {templates.map(template => (
                <label
                  key={template.orbitType}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-colors border',
                    selectedOrbit === template.orbitType
                      ? 'bg-purple-500/10 border-purple-500/30'
                      : 'border-transparent hover:bg-secondary/50',
                  )}
                >
                  <input
                    type="radio"
                    name="orbit-type"
                    checked={selectedOrbit === template.orbitType}
                    onChange={() => setSelectedOrbit(template.orbitType)}
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <div className="text-xs font-medium text-foreground">{template.title}</div>
                    <div className="text-[10px] text-muted-foreground">{template.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Cadence selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              {t('orbit.standaloneCadence')}
            </label>
            <div className="flex gap-1">
              {CADENCE_OPTIONS.map(option => (
                <button
                  key={option}
                  onClick={() => setCadence(option)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    cadence === option
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-muted-foreground hover:bg-secondary/50 border border-transparent',
                  )}
                >
                  {t(`orbit.cadence${option.charAt(0).toUpperCase() + option.slice(1)}` as 'orbit.cadenceDaily')}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-run toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={e => setAutoRun(e.target.checked)}
              className="accent-purple-500"
            />
            <Orbit className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{t('orbit.autoRunDescription')}</span>
          </label>

          {/* Target clusters + per-cluster scope */}
          <div>
            <button
              onClick={() => setShowClusterPicker(!showClusterPicker)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {t('orbit.standaloneTargetClusters')}
              </span>
              {selectedClusters.size > 0 && (
                <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">
                  {selectedClusters.size}
                </span>
              )}
              {showClusterPicker ? (
                <ChevronUp className="w-3 h-3 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-auto" />
              )}
            </button>

            {showClusterPicker && (
              <div className="mt-2 space-y-1 max-h-96 overflow-y-auto rounded-lg border border-border p-2">
                {clustersLoading ? (
                  <p className="text-[10px] text-muted-foreground py-2 text-center">
                    {t('orbit.standaloneClustersLoading')}
                  </p>
                ) : clusters.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2 text-center">
                    {t('orbit.standaloneNoClusters')}
                  </p>
                ) : (
                  <>
                    <div className="flex justify-end gap-2 mb-1">
                      <button
                        onClick={selectAllClusters}
                        className="text-[10px] text-purple-400 hover:underline"
                      >
                        {t('orbit.standaloneSelectAll')}
                      </button>
                      <button
                        onClick={deselectAllClusters}
                        className="text-[10px] text-muted-foreground hover:underline"
                      >
                        {t('orbit.standaloneDeselectAll')}
                      </button>
                    </div>
                    {clusters.map(c => (
                      <div key={c.name}>
                        <label
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                            selectedClusters.has(c.name)
                              ? 'bg-purple-500/10'
                              : 'hover:bg-secondary/50',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClusters.has(c.name)}
                            onChange={() => toggleCluster(c.name)}
                            className="accent-purple-500"
                          />
                          <span className="text-xs text-foreground truncate">{c.name}</span>
                          <span className={cn(
                            'ml-auto text-[10px] shrink-0',
                            c.healthy ? 'text-green-400' : 'text-red-400',
                          )}>
                            {c.healthy ? 'Healthy' : 'Unhealthy'}
                          </span>
                        </label>

                        {/* Per-cluster resource scope — only when cluster is selected */}
                        {selectedClusters.has(c.name) && (
                          <ClusterScopeSection
                            clusterName={c.name}
                            value={resourceFilters[c.name] ?? []}
                            onChange={handleScopeChange}
                          />
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedOrbit}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors',
              selectedOrbit
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-secondary text-muted-foreground cursor-not-allowed',
            )}
          >
            <Satellite className="w-3.5 h-3.5" />
            {t('orbit.standaloneCreate')}
          </button>
        </div>
      </div>
    </div>
    {showSetupDialog && (
      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
    )}
    {/* Issue 9373: Empty cluster selection fallback confirmation. */}
    <ConfirmDialog
      isOpen={showAllClustersConfirm}
      onClose={() => setShowAllClustersConfirm(false)}
      onConfirm={handleConfirmAllClusters}
      title={t('orbit.confirmAllClustersTitle')}
      message={t('orbit.confirmAllClustersMessage', { count: clusters.length })}
      confirmLabel={t('orbit.confirmAllClustersContinue')}
      cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
      variant="warning"
    />
    </>
  )
}
