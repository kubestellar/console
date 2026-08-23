/**
 * useFlightPlanBlueprint — stateful logic for FlightPlanBlueprint.
 *
 * Owns hover/sticky panel state, drag-and-drop state, mission preview
 * fetching, panel resize/collapse, zoom and pan. Pure computations live in
 * `FlightPlanBlueprint.utils.ts`.
 */

import { useId, useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'

import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import type { MissionControlState, PayloadProject } from './types'
import type { InfoPanelData } from './FlightPlanBlueprint.types'
import { computeLayout } from './BlueprintLayout'
import { useClusters } from '../../hooks/mcp/clusters'
import { fetchMissionContent } from '../../lib/missions/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import {
  INFO_PANEL_DEFAULT, INFO_PANEL_LS_KEY, ZOOM_STEP,
} from './FlightPlanBlueprint.constants'
import {
  clampInfoPanelWidth,
  clampZoom,
  computeGlowEdges,
  computeGlowProjectKeys,
  computeHealthyState,
  readStoredInfoPanelWidth,
  resolveKbPath,
  splitProjectKey,
} from './FlightPlanBlueprint.utils'

export function useFlightPlanBlueprint(state: MissionControlState) {
  const svgId = useId().replace(/:/g, '')
  const { deduplicatedClusters: clusters, error: clustersError } = useClusters()

  // Filter out explicitly unhealthy clusters and redistribute orphaned projects to healthy ones.
  // Also scope to state.targetClusters when set — without this, assignments from
  // clusters the user later removed from TARGET CLUSTERS still appear in the
  // Flight Plan (e.g. user picks prow + waldorf in Define Mission but ks-docs-oci
  // — left over from a prior session — still shows up as a third lane).
  const healthyState = useMemo(() => computeHealthyState(state, clusters), [state, clusters])

  // #6731 — Memoize layout computation. Previously this ran on every render,
  // and computeLayout traverses every assignment × project to produce node
  // positions, dependency edges, and phase timelines — expensive enough to
  // show up on the main-thread profiler during sidebar toggles and message
  // streaming. `healthyState` is itself memoized, so this re-runs only when
  // the underlying state.assignments / state.projects / clusters change.
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

  // Resizable info panel
  const [infoPanelWidth, setInfoPanelWidth] = useState<number>(readStoredInfoPanelWidth)
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)

  // Track if mouse is over the info panel to keep it visible while interacting
  const isOverInfoPanelRef = useRef(false)
  const hidePanelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zoom controls
  const [zoom, setZoom] = useState(1)

  // Animation toggle
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  // Line labels toggle
  const [labelsVisible, setLabelsVisible] = useState(true)

  // Hovered edge (from label hover) or hovered project (composite key: "cluster/project")
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)
  const { clusterName: hoveredCluster, projectName: hoveredProjectName } = splitProjectKey(hoveredProjectKey)

  const glowEdges = useMemo(
    () => computeGlowEdges({ hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout }),
    [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout]
  )

  const glowProjectKeys = useMemo(
    () => computeGlowProjectKeys({ hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout }),
    [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout]
  )

  // Pan/drag when zoomed in
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
      scrollTop: container.scrollTop }
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
      // Panel is on the right, so dragging left (negative deltaX) should increase width
      const deltaX = e.clientX - startXRef.current
      setInfoPanelWidth(clampInfoPanelWidth(startWidthRef.current - deltaX))
    }
    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Persist to localStorage
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

  const projectMap = new Map(state.projects.map((p) => [p.name, p]))

  const handleProjectHover = (info: ProjectHoverInfo | null) => {
    // Clear any pending hide timeout
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }

    if (info) {
      const data: InfoPanelData = { kind: 'project', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      // Clear infoPanel to show sticky panel, allowing user to interact with sidebar
      setInfoPanel(null)
    }
  }

  const handleClusterHover = (info: ClusterHoverInfo | null) => {
    if (dragProject) return

    // Clear any pending hide timeout
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }

    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      // Clear infoPanel to show sticky panel, allowing user to interact with sidebar
      setInfoPanel(null)
    }
  }

  /** Handlers for info panel hover to keep it visible while interacting */
  const handleInfoPanelEnter = () => {
    isOverInfoPanelRef.current = true
    // Clear any pending hide timeout when entering the panel
    if (hidePanelTimeoutRef.current) {
      clearTimeout(hidePanelTimeoutRef.current)
      hidePanelTimeoutRef.current = null
    }
  }

  const handleInfoPanelLeave = () => {
    isOverInfoPanelRef.current = false
    // Panel remains sticky — only changes when hovering a different node
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

  const closeMissionPreview = () => {
    setPreviewMission(null)
    setPreviewRaw(false)
  }

  return {
    svgId,
    clusters,
    clustersError,
    healthyState,
    layout,
    projectMap,
    // Panels
    // The visible panel: active hover wins, otherwise fall back to sticky (last hovered)
    visiblePanel: infoPanel ?? stickyPanel,
    setStickyPanel,
    infoPanelWidth,
    infoPanelCollapsed,
    setInfoPanelCollapsed,
    handleResizeStart,
    handleInfoPanelEnter,
    handleInfoPanelLeave,
    // Viewport
    svgContainerRef,
    zoom,
    zoomIn: () => setZoom((z) => clampZoom(z + ZOOM_STEP)),
    zoomOut: () => setZoom((z) => clampZoom(z - ZOOM_STEP)),
    resetZoom: () => setZoom(1),
    handlePanStart,
    animationsEnabled,
    toggleAnimations: () => setAnimationsEnabled((a) => !a),
    labelsVisible,
    toggleLabels: () => setLabelsVisible((v) => !v),
    // Hover / glow
    glowEdges,
    glowProjectKeys,
    setHoveredEdge,
    setHoveredProjectKey,
    handleProjectHover,
    handleClusterHover,
    // Drag and drop
    dragProject,
    setDragProject,
    dropTarget,
    setDropTarget,
    // Mission preview
    previewMission,
    previewRaw,
    previewLoading,
    setPreviewRaw,
    handleShowMissionPreview,
    closeMissionPreview,
  }
}

export type FlightPlanBlueprintController = ReturnType<typeof useFlightPlanBlueprint>
