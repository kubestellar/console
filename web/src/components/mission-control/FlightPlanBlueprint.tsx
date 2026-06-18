/**
 * FlightPlanBlueprint — Phase 3: Master SVG blueprint.
 *
 * SVG blueprint on left, info panel on right. Hover on any node or cluster
 * populates the right panel with details. Overlays toggle resource views.
 *
 * Sub-modules:
 *  - BlueprintLayout.ts      — layout computation (computeLayout)
 *  - BlueprintReport.ts      — PDF/print export (exportFullReport)
 *  - BlueprintInfoPanels.tsx — ProjectInfoPanel, ClusterInfoPanel, DeployModeInfoPanel
 *  - BlueprintToolbar.tsx    — overlay toggles + deploy mode controls
 *  - BlueprintCanvas.tsx     — SVG canvas with zoom, pan, drag-and-drop
 *  - BlueprintInfoPanel.tsx  — resizable right info panel
 *  - BlueprintMissionPreview.tsx — mission preview modal
 */

import { useId, useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type {
  MissionControlState,
  OverlayMode,
  InfoPanelData } from './types'
import { useClusters } from '../../hooks/mcp/clusters'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import type { PayloadProject } from './types'
import { computeLayout } from './BlueprintLayout'
import { BlueprintToolbar } from './BlueprintToolbar'
import { BlueprintCanvas } from './BlueprintCanvas'
import { BlueprintInfoPanel, INFO_PANEL_MIN, INFO_PANEL_MAX } from './BlueprintInfoPanel'
import { BlueprintMissionPreview } from './BlueprintMissionPreview'

/** Resolve kbPath for a project — tries explicit kbPath, then convention-based lookup */
function resolveKbPath(proj: PayloadProject): string | undefined {
  if (proj.kbPath) return proj.kbPath
  const slug = proj.name.toLowerCase().replace(/\s+/g, '-')
  return `fixes/cncf-install/install-${slug}.json`
}

interface FlightPlanBlueprintProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  installedProjects?: Set<string>
}

// ---------------------------------------------------------------------------
// Info-panel resize constants
// ---------------------------------------------------------------------------

/** Default info-panel width (px) — 26rem */
const INFO_PANEL_DEFAULT = 416
/** localStorage key for persisted panel width */
const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onMoveProject,
  installedProjects = new Set() }: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, error: clustersError } = useClusters()

  // Filter out explicitly unhealthy clusters and redistribute orphaned projects to healthy ones.
  const healthyState = useMemo(() => {
    const targetSet = new Set(state.targetClusters || [])
    let assignments = targetSet.size === 0
      ? state.assignments
      : state.assignments.filter(a => targetSet.has(a.clusterName))
    const unhealthyNames = clusters?.length
      ? new Set(clusters.filter(c => c.healthy === false || c.reachable === false).map(c => c.name))
      : new Set<string>()

    const hasUnhealthy = assignments.some(a => a.projectNames.length > 0 && unhealthyNames.has(a.clusterName))
    if (hasUnhealthy) {
      const orphanedProjects: string[] = []
      const healthyAssignments = assignments.filter(a => {
        if (!unhealthyNames.has(a.clusterName)) return true
        orphanedProjects.push(...a.projectNames)
        return false
      }).map(a => ({ ...a, projectNames: [...a.projectNames] }))
      if (orphanedProjects.length > 0 && healthyAssignments.length > 0) {
        orphanedProjects.forEach((p, i) => {
          const target = healthyAssignments[i % healthyAssignments.length]
          if (!target.projectNames.includes(p)) {
            target.projectNames.push(p)
          }
        })
      }
      assignments = healthyAssignments
    }

    return { ...state, assignments }
  }, [state, clusters])

  const layout = useMemo(() => computeLayout(healthyState), [healthyState])

  const [infoPanel, setInfoPanel] = useState<InfoPanelData | null>(null)
  const [stickyPanel, setStickyPanel] = useState<InfoPanelData | null>(
    () => ({ kind: 'deployMode' as const, mode: state.deployMode, phases: state.phases })
  )
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Resizable info panel
  const [infoPanelWidth, setInfoPanelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) return parsed
      }
    } catch { /* ignore */ }
    return INFO_PANEL_DEFAULT
  })
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)

  const isOverInfoPanelRef = useRef(false)
  const hidePanelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(INFO_PANEL_DEFAULT)

  const handleResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = infoPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return
      const deltaX = e.clientX - startXRef.current
      const newWidth = Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, startWidthRef.current - deltaX))
      setInfoPanelWidth(newWidth)
    }
    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setInfoPanelWidth((w) => {
        try { localStorage.setItem(INFO_PANEL_LS_KEY, String(w)) } catch { /* ignore */ }
        return w
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hidePanelTimeoutRef.current) {
        clearTimeout(hidePanelTimeoutRef.current)
      }
    }
  }, [])

  const handleProjectHover = (info: ProjectHoverInfo | null) => {
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }
    if (info) {
      const data: InfoPanelData = { kind: 'project', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }

  const handleClusterHover = (info: ClusterHoverInfo | null) => {
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }
    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }

  const handleInfoPanelEnter = () => {
    isOverInfoPanelRef.current = true
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }
  }

  const handleInfoPanelLeave = () => {
    isOverInfoPanelRef.current = false
  }

  /** Open mission preview modal for a project (fetches from KB) */
  const handleShowMissionPreview = (proj: PayloadProject) => {
    const kbPath = resolveKbPath(proj)
    const baseMission: MissionExport = {
      version: 'kc-mission-v1',
      title: `Install ${proj.displayName}`,
      description: proj.reason ?? '',
      type: 'deploy',
      tags: [proj.category],
      steps: [],
      metadata: { source: kbPath ?? 'mission-control' } }
    if (!kbPath) {
      setPreviewMission(baseMission)
      return
    }
    setPreviewLoading(true)
    fetchMissionContent(baseMission)
      .then(({ mission: m }) => setPreviewMission(m))
      .catch(() => setPreviewMission(baseMission))
      .finally(() => setPreviewLoading(false))
  }

  const visiblePanel = infoPanel ?? stickyPanel

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <BlueprintToolbar
        title={state.title ?? ''}
        projectCount={state.projects.length}
        clusterCount={healthyState.assignments.filter((a) => a.projectNames.length > 0).length}
        overlay={state.overlay}
        deployMode={state.deployMode}
        phases={state.phases}
        onOverlayChange={onOverlayChange}
        onDeployModeClick={(mode, data) => {
          onDeployModeChange(mode)
          setStickyPanel(data)
        }}
      />

      {/* Error banner when cluster data fails to load */}
      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      {/* Main content: SVG left + Info panel right */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <BlueprintCanvas
          svgId={svgId}
          layout={layout}
          state={state}
          healthyState={healthyState}
          clusters={clusters}
          installedProjects={installedProjects}
          infoPanelCollapsed={infoPanelCollapsed}
          onToggleInfoPanel={() => setInfoPanelCollapsed(c => !c)}
          onProjectHover={handleProjectHover}
          onClusterHover={handleClusterHover}
          onMoveProject={onMoveProject}
        />

        <BlueprintInfoPanel
          visiblePanel={visiblePanel}
          infoPanelWidth={infoPanelWidth}
          infoPanelCollapsed={infoPanelCollapsed}
          onResizeStart={handleResizeStart}
          onPanelEnter={handleInfoPanelEnter}
          onPanelLeave={handleInfoPanelLeave}
          layout={layout}
          state={state}
          installedProjects={installedProjects}
          onShowProject={handleShowMissionPreview}
        />
      </div>

      <BlueprintMissionPreview
        previewMission={previewMission}
        previewLoading={previewLoading}
        previewRaw={previewRaw}
        onClose={() => { setPreviewMission(null); setPreviewRaw(false) }}
        onToggleRaw={() => setPreviewRaw(p => !p)}
      />
    </div>
  )
}
