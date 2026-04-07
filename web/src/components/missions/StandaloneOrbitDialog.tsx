/**
 * StandaloneOrbitDialog -- Create an orbit mission without a prior install mission.
 *
 * Allows users to pick an orbit template, cadence, auto-run toggle,
 * and target clusters, then saves the mission to the library.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Satellite, Orbit, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useClusters } from '../../hooks/mcp/clusters'
import { useMissions } from '../../hooks/useMissions'
import { getApplicableOrbitTemplates } from '../../lib/orbit/orbitTemplates'
import { ORBIT_DEFAULT_CADENCE } from '../../lib/constants/orbit'
import { emitOrbitMissionCreated } from '../../lib/analytics'
import { isDemoMode } from '../../lib/demoMode'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import type { OrbitCadence, OrbitType, OrbitConfig } from '../../lib/missions/types'

interface StandaloneOrbitDialogProps {
  /** Close the dialog */
  onClose: () => void
}

const CADENCE_OPTIONS: OrbitCadence[] = ['daily', 'weekly', 'monthly']

export function StandaloneOrbitDialog({ onClose }: StandaloneOrbitDialogProps) {
  const { t } = useTranslation()
  const { saveMission } = useMissions()
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()

  // All orbit templates are applicable (wildcard categories)
  const templates = getApplicableOrbitTemplates(['*'])

  const [selectedOrbit, setSelectedOrbit] = useState<OrbitType | null>(
    templates.length > 0 ? templates[0].orbitType : null
  )
  const [cadence, setCadence] = useState<OrbitCadence>(ORBIT_DEFAULT_CADENCE)
  const [autoRun, setAutoRun] = useState(false)
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set())
  const [showClusterPicker, setShowClusterPicker] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)

  const clusters = deduplicatedClusters || []

  const toggleCluster = useCallback((name: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const selectAllClusters = useCallback(() => {
    setSelectedClusters(new Set(clusters.map(c => c.name)))
  }, [clusters])

  const deselectAllClusters = useCallback(() => {
    setSelectedClusters(new Set())
  }, [])

  const handleCreate = useCallback(() => {
    if (!selectedOrbit) return

    // In demo mode, redirect to local install setup dialog
    if (isDemoMode()) {
      setShowSetupDialog(true)
      return
    }

    const template = templates.find(tpl => tpl.orbitType === selectedOrbit)
    if (!template) return

    const clusterNames = [...selectedClusters]
    const title = clusterNames.length > 0
      ? `${template.title} -- ${clusterNames.join(', ')}`
      : template.title

    const orbitConfig: OrbitConfig = {
      cadence,
      orbitType: selectedOrbit,
      clusters: clusterNames,
      autoRun,
      lastRunAt: null,
    }

    saveMission({
      type: 'maintain',
      title,
      description: template.description,
      missionClass: 'orbit',
      steps: template.steps.map(s => ({ title: s.title, description: s.description })),
      tags: ['orbit', selectedOrbit, cadence],
      initialPrompt: template.description,
      context: { orbitConfig },
    })

    emitOrbitMissionCreated(selectedOrbit, cadence)
    onClose()
  }, [selectedOrbit, cadence, autoRun, selectedClusters, templates, saveMission, onClose])

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-purple-500/30 bg-card shadow-2xl overflow-hidden">
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

          {/* Target clusters */}
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
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
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
                      <label
                        key={c.name}
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
                          'ml-auto text-[10px] flex-shrink-0',
                          c.healthy ? 'text-green-400' : 'text-red-400',
                        )}>
                          {c.healthy ? 'Healthy' : 'Unhealthy'}
                        </span>
                      </label>
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
    </>
  )
}
