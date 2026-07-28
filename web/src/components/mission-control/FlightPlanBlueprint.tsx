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
 */

import { useId, useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import type { MissionControlState, OverlayMode } from './types'
import { useClusters } from '../../hooks/mcp/clusters'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import type { PayloadProject } from './types'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'

import { computeLayout } from './BlueprintLayout'
import { exportFullReport } from './BlueprintReport'
import { BlueprintToolbar } from './flightPlanBlueprint/BlueprintToolbar'
import { BlueprintWorkspace } from './flightPlanBlueprint/BlueprintWorkspace'
import { MissionPreviewModal } from './flightPlanBlueprint/MissionPreviewModal'
import type { InfoPanelData } from './flightPlanBlueprint/types'

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

const INFO_PANEL_MIN = 280
const INFO_PANEL_MAX = 600
const INFO_PANEL_DEFAULT = 416
const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_STEP = 0.2

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onMoveProject,
  installedProjects = new Set(),
}: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { deduplicatedClusters: clusters, error: clustersError } = useClusters()

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
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

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

  const [zoom, setZoom] = useState(1)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [labelsVisible, setLabelsVisible] = useState(true)

  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null

  const glowEdges = useMemo(() => {
    const edges = new Set<string>()
    if (hoveredEdge && layout) {
      for (const edge of layout.dependencyEdges) {
        if (edge.from === hoveredEdge.from && edge.to === hoveredEdge.to) {
          const cluster = edge.fromPos?.clusterName ?? ''
          edges.add(`${cluster}:${edge.from}-${edge.to}`)
        }
      }
    }
    if (hoveredProjectName && hoveredCluster && layout) {
      for (const edge of layout.dependencyEdges) {
        const edgeCluster = edge.fromPos?.clusterName ?? ''
        const isConnected = edge.from === hoveredProjectName || edge.to === hoveredProjectName
        if (!isConnected) continue
        if (!edge.crossCluster && edgeCluster !== hoveredCluster) continue
        edges.add(`${edgeCluster}:${edge.from}-${edge.to}`)
      }
    }
    return edges
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])

  const glowProjectKeys = useMemo(() => {
    const keys = new Set<string>()
    if (hoveredEdge && layout) {
      for (const key of layout.projectPositions.keys()) {
        const pName = key.split('/')[1]
        if (pName === hoveredEdge.from || pName === hoveredEdge.to) keys.add(key)
      }
    }
    if (hoveredProjectKey && hoveredProjectName && layout) {
      keys.add(hoveredProjectKey)
      const sameClusterConnected = new Set<string>()
      const crossClusterConnected = new Set<string>()
      for (const edge of layout.dependencyEdges) {
        const edgeCluster = edge.fromPos?.clusterName ?? ''
        if (edge.from === hoveredProjectName) {
          if (edge.crossCluster) crossClusterConnected.add(edge.to)
          else if (edgeCluster === hoveredCluster) sameClusterConnected.add(edge.to)
        }
        if (edge.to === hoveredProjectName) {
          if (edge.crossCluster) crossClusterConnected.add(edge.from)
          else if (edgeCluster === hoveredCluster) sameClusterConnected.add(edge.from)
        }
      }
      for (const key of layout.projectPositions.keys()) {
        const [cluster, pName] = key.split('/')
        if (cluster === hoveredCluster && sameClusterConnected.has(pName)) keys.add(key)
        if (crossClusterConnected.has(pName)) keys.add(key)
      }
    }
    return keys
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])

  const svgContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = (e: ReactMouseEvent) => {
    if (zoom <= 1) return
    const container = svgContainerRef.current
    if (!container) return
    isPanningRef.current = true
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handlePanMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return
      const container = svgContainerRef.current
      if (!container) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      container.scrollLeft = panStartRef.current.scrollLeft - dx
      container.scrollTop = panStartRef.current.scrollTop - dy
    }
    const handlePanEnd = () => {
      if (!isPanningRef.current) return
      isPanningRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
    return () => {
      window.removeEventListener('mousemove', handlePanMove)
      window.removeEventListener('mouseup', handlePanEnd)
    }
  }, [])

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

  useEffect(() => {
    return () => {
      if (hidePanelTimeoutRef.current) {
        clearTimeout(hidePanelTimeoutRef.current)
      }
    }
  }, [])

  const projectMap = new Map(state.projects.map((p) => [p.name, p]))

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
    if (dragProject) return

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

  const handleShowMissionPreview = (proj: PayloadProject) => {
    const kbPath = resolveKbPath(proj)
    const baseMission: MissionExport = {
      version: 'kc-mission-v1',
      title: `Install ${proj.displayName}`,
      description: proj.reason ?? '',
      type: 'deploy',
      tags: [proj.category],
      steps: [],
      metadata: { source: kbPath ?? 'mission-control' },
    }
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
      <BlueprintToolbar
        state={state}
        activeClusterCount={healthyState.assignments.filter((a) => a.projectNames.length > 0).length}
        onOverlayChange={onOverlayChange}
        onDeployModeSelect={(mode) => {
          onDeployModeChange(mode)
          const data: InfoPanelData = { kind: 'deployMode', mode, phases: state.phases }
          setStickyPanel(data)
        }}
      />

      <BlueprintWorkspace
        state={state}
        clusters={clusters || []}
        clustersError={clustersError}
        layout={layout}
        svgId={svgId}
        zoom={zoom}
        setZoom={setZoom}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
        zoomStep={ZOOM_STEP}
        infoPanelCollapsed={infoPanelCollapsed}
        setInfoPanelCollapsed={setInfoPanelCollapsed}
        animationsEnabled={animationsEnabled}
        setAnimationsEnabled={setAnimationsEnabled}
        labelsVisible={labelsVisible}
        setLabelsVisible={setLabelsVisible}
        onExportReport={() => exportFullReport(state, healthyState, installedProjects, layout, svgContainerRef)}
        svgContainerRef={svgContainerRef}
        handlePanStart={handlePanStart}
        handleClusterHover={handleClusterHover}
        handleProjectHover={handleProjectHover}
        setHoveredEdge={setHoveredEdge}
        setHoveredProjectKey={setHoveredProjectKey}
        projectMap={projectMap}
        installedProjects={installedProjects}
        glowEdges={glowEdges}
        glowProjectKeys={glowProjectKeys}
        dragProject={dragProject}
        setDragProject={setDragProject}
        dropTarget={dropTarget}
        setDropTarget={setDropTarget}
        onMoveProject={onMoveProject}
        infoPanelWidth={infoPanelWidth}
        handleInfoPanelEnter={handleInfoPanelEnter}
        handleInfoPanelLeave={handleInfoPanelLeave}
        handleResizeStart={handleResizeStart}
        visiblePanel={visiblePanel}
        onShowMissionPreview={handleShowMissionPreview}
      />

      <MissionPreviewModal
        previewMission={previewMission}
        previewRaw={previewRaw}
        previewLoading={previewLoading}
        onToggleRaw={() => setPreviewRaw((p) => !p)}
        onClose={() => {
          setPreviewMission(null)
          setPreviewRaw(false)
        }}
      />
    </div>
  )
}
