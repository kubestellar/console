/**
 * OrbitSetupOffer — Post-install completion component
 *
 * Appears in the mission chat after an install mission completes.
 * Offers to create recurring maintenance (orbit) missions and
 * auto-generate a Ground Control monitoring dashboard.
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Orbit, Satellite, LayoutDashboard, ChevronDown, ChevronUp, Check, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useGroundControlDashboard } from '../../hooks/useGroundControlDashboard'
import { getApplicableOrbitTemplates } from '../../lib/orbit/orbitTemplates'
import { ORBIT_DEFAULT_CADENCE } from '../../lib/constants/orbit'
import { emitOrbitMissionCreated } from '../../lib/analytics'
import { isDemoMode } from '../../lib/demoMode'
import { SetupInstructionsDialog } from '../setup/SetupInstructionsDialog'
import type { OrbitCadence, OrbitType } from '../../lib/missions/types'

interface OrbitSetupOfferProps {
  /** CNCF projects from the completed Mission Control payload */
  projects: Array<{ name: string; cncfProject?: string; category?: string }>
  /** Target clusters from the Mission Control session */
  clusters: string[]
  /** Mission Control state key for linking back */
  missionControlStateKey?: string
  /** Callback when orbit mission is created */
  onCreateOrbit: (params: {
    orbitType: OrbitType
    cadence: OrbitCadence
    autoRun: boolean
    title: string
    projects: string[]
    clusters: string[]
    missionControlStateKey?: string
  }) => void
  /** Callback when Ground Control dashboard is created */
  onDashboardCreated: (dashboardId: string) => void
  /** Callback when user skips */
  onSkip: () => void
}

const CADENCE_OPTIONS: OrbitCadence[] = ['daily', 'weekly', 'monthly']

export function OrbitSetupOffer({
  projects,
  clusters,
  missionControlStateKey,
  onCreateOrbit,
  onDashboardCreated,
  onSkip,
}: OrbitSetupOfferProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { generateGroundControlDashboard } = useGroundControlDashboard()

  const categories = [...new Set((projects || []).map(p => p.category).filter(Boolean) as string[])]
  const applicableTemplates = getApplicableOrbitTemplates(categories)

  const [selectedOrbits, setSelectedOrbits] = useState<Set<OrbitType>>(
    new Set(applicableTemplates.map(t => t.orbitType))
  )
  const [cadence, setCadence] = useState<OrbitCadence>(ORBIT_DEFAULT_CADENCE)
  const [createDashboard, setCreateDashboard] = useState(true)
  const [autoRun, setAutoRun] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [createdDashboardId, setCreatedDashboardId] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const [showSetupDialog, setShowSetupDialog] = useState(false)

  const toggleOrbitType = useCallback((orbitType: OrbitType) => {
    setSelectedOrbits(prev => {
      const next = new Set(prev)
      if (next.has(orbitType)) next.delete(orbitType)
      else next.add(orbitType)
      return next
    })
  }, [])

  const handleSetup = useCallback(async () => {
    // In demo mode, redirect to local install setup dialog
    if (isDemoMode()) {
      setShowSetupDialog(true)
      return
    }

    setIsCreating(true)
    try {
      // Create orbit missions for each selected type
      for (const orbitType of selectedOrbits) {
        const template = applicableTemplates.find(t => t.orbitType === orbitType)
        if (!template) continue

        onCreateOrbit({
          orbitType,
          cadence,
          autoRun,
          title: `${template.title} — ${(projects || []).map(p => p.name).join(', ')}`,
          projects: (projects || []).map(p => p.name),
          clusters: clusters || [],
          missionControlStateKey,
        })
        emitOrbitMissionCreated(orbitType, cadence)
      }

      // Create Ground Control dashboard
      if (createDashboard && (projects || []).length > 0) {
        const result = await generateGroundControlDashboard({
          missionTitle: (projects || []).map(p => p.name).join(', '),
          projects,
        })
        setCreatedDashboardId(result.dashboardId)
        onDashboardCreated(result.dashboardId)
      }

      setIsDone(true)
    } finally {
      setIsCreating(false)
    }
  }, [selectedOrbits, cadence, autoRun, createDashboard, projects, clusters, missionControlStateKey, onCreateOrbit, onDashboardCreated, generateGroundControlDashboard, applicableTemplates])

  if (isDone) {
    return (
      <div className="mx-4 mb-4 p-4 rounded-xl border border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-2 text-green-400 mb-2">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">{t('orbit.title')}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {selectedOrbits.size} orbit{selectedOrbits.size !== 1 ? 's' : ''} configured ({cadence}).
          {createdDashboardId && ' Ground Control dashboard created.'}
        </p>
        {createdDashboardId && (
          <button
            onClick={() => navigate(`/custom-dashboard/${createdDashboardId}`)}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            {t('orbit.viewDashboard')}
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  return (
    <>
    <div className="mx-4 mb-4 rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Satellite className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">{t('orbit.keepInOrbit')}</span>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-3">{t('orbit.keepInOrbitDescription')}</p>

          {/* Orbit type checkboxes */}
          <div className="space-y-2 mb-3">
            {applicableTemplates.map(template => (
              <label
                key={template.orbitType}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors',
                  selectedOrbits.has(template.orbitType) ? 'bg-purple-500/10' : 'hover:bg-secondary/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedOrbits.has(template.orbitType)}
                  onChange={() => toggleOrbitType(template.orbitType)}
                  className="mt-0.5 accent-purple-500"
                />
                <div>
                  <div className="text-xs font-medium text-foreground">{template.title}</div>
                  <div className="text-[10px] text-muted-foreground">{template.description}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Cadence selector */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Cadence:</span>
            <div className="flex gap-1">
              {CADENCE_OPTIONS.map(option => (
                <button
                  key={option}
                  onClick={() => setCadence(option)}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                    cadence === option
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'text-muted-foreground hover:bg-secondary/50',
                  )}
                >
                  {t(`orbit.cadence${option.charAt(0).toUpperCase() + option.slice(1)}` as 'orbit.cadenceDaily')}
                </button>
              ))}
            </div>
          </div>

          {/* Ground Control dashboard toggle */}
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={createDashboard}
              onChange={e => setCreateDashboard(e.target.checked)}
              className="accent-purple-500"
            />
            <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{t('orbit.groundControlDescription')}</span>
          </label>

          {/* Auto-run toggle */}
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={e => setAutoRun(e.target.checked)}
              className="accent-purple-500"
            />
            <Orbit className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{t('orbit.autoRunDescription')}</span>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('orbit.skip')}
            </button>
            <button
              onClick={handleSetup}
              disabled={selectedOrbits.size === 0 || isCreating}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                selectedOrbits.size > 0
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed',
              )}
            >
              <Orbit className="w-3.5 h-3.5" />
              {isCreating ? 'Setting up...' : t('orbit.setupOrbit')}
            </button>
          </div>
        </div>
      )}
    </div>
    {showSetupDialog && (
      <SetupInstructionsDialog isOpen={showSetupDialog} onClose={() => setShowSetupDialog(false)} />
    )}
    </>
  )
}
