import { useId, useMemo, useState, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { MissionExport } from '../../lib/missions/types'
import { useClusters } from '../../hooks/mcp/clusters'

import { computeLayout } from './BlueprintLayout'
import { exportFullReport } from './BlueprintReport'
import type { FlightPlanBlueprintProps, InfoPanelData } from './FlightPlanBlueprint.types'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from './FlightPlanBlueprint.constants'
import {
  buildHealthyState,
  buildGlowEdges,
  buildGlowProjectKeys,
  calculateResizedInfoPanelWidth,
  clearHidePanelTimeout,
  computeDependencyLabels,
  createClusterPanelData,
  createDeployModePanelData,
  createInitialStickyPanel,
  createProjectMap,
  createProjectPanelData,
  getStoredInfoPanelWidth,
  loadMissionPreview,
  persistInfoPanelWidth,
} from './FlightPlanBlueprint/FlightPlanBlueprint.helpers'
import { BlueprintToolbar } from './FlightPlanBlueprint/BlueprintToolbar'
import { BlueprintCanvas } from './FlightPlanBlueprint/BlueprintCanvas'
import { BlueprintInfoSidebar } from './FlightPlanBlueprint/BlueprintInfoSidebar'
import { MissionPreviewModal } from './FlightPlanBlueprint/MissionPreviewModal'

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onMoveProject,
  installedProjects = new Set(),
}: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, error: clustersError } = useClusters()

  const healthyState = useMemo(() => buildHealthyState(state, clusters), [state, clusters])
  const layout = useMemo(() => computeLayout(healthyState), [healthyState])
  const dependencyLabels = useMemo(() => computeDependencyLabels(layout), [layout])
  const projectMap = useMemo(() => createProjectMap(state), [state])

  const [infoPanel, setInfoPanel] = useState<InfoPanelData | null>(null)
  const [stickyPanel, setStickyPanel] = useState<InfoPanelData | null>(() => createInitialStickyPanel(state))
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [infoPanelWidth, setInfoPanelWidth] = useState<number>(() => getStoredInfoPanelWidth())
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)

  const hidePanelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const isResizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(infoPanelWidth)

  const glowEdges = useMemo(() => buildGlowEdges(layout, hoveredEdge, hoveredProjectKey), [layout, hoveredEdge, hoveredProjectKey])
  const glowProjectKeys = useMemo(() => buildGlowProjectKeys(layout, hoveredEdge, hoveredProjectKey), [layout, hoveredEdge, hoveredProjectKey])

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

  const handleResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = infoPanelWidth
    document.body.style.cursor = 'col-resize'
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

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return
      setInfoPanelWidth(calculateResizedInfoPanelWidth(startWidthRef.current, startXRef.current, e.clientX))
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setInfoPanelWidth((width) => persistInfoPanelWidth(width))
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => () => {
    clearHidePanelTimeout(hidePanelTimeoutRef)
  }, [])

  const handleProjectHover = (info: Parameters<typeof createProjectPanelData>[0] | null) => {
    clearHidePanelTimeout(hidePanelTimeoutRef)
    if (info) {
      const data = createProjectPanelData(info)
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }

  const handleClusterHover = (info: Parameters<typeof createClusterPanelData>[0] | null) => {
    if (dragProject) return
    clearHidePanelTimeout(hidePanelTimeoutRef)
    if (info) {
      const data = createClusterPanelData(info)
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }

  const handleShowMissionPreview = (project: FlightPlanBlueprintProps['state']['projects'][number]) => {
    void loadMissionPreview(project, setPreviewMission, setPreviewLoading)
  }

  const visiblePanel = infoPanel ?? stickyPanel

  return (
    <div className="h-full min-h-0 flex flex-col">
      <BlueprintToolbar
        title={state.title}
        projectCount={state.projects.length}
        clusterCount={healthyState.assignments.filter((assignment) => assignment.projectNames.length > 0).length}
        overlay={state.overlay}
        deployMode={state.deployMode}
        infoPanelCollapsed={infoPanelCollapsed}
        animationsEnabled={animationsEnabled}
        labelsVisible={labelsVisible}
        onOverlayChange={onOverlayChange}
        onDeployModeChange={(mode) => {
          onDeployModeChange(mode)
          setStickyPanel(createDeployModePanelData(state.phases, mode))
        }}
        onZoomIn={() => setZoom((value) => Math.min(value + ZOOM_STEP, ZOOM_MAX))}
        onZoomOut={() => setZoom((value) => Math.max(value - ZOOM_STEP, ZOOM_MIN))}
        onResetZoom={() => setZoom(1)}
        onToggleInfoPanel={() => setInfoPanelCollapsed((value) => !value)}
        onToggleAnimations={() => setAnimationsEnabled((value) => !value)}
        onToggleLabels={() => setLabelsVisible((value) => !value)}
        onExportReport={() => exportFullReport(state, healthyState, installedProjects, layout, svgContainerRef)}
      />

      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <BlueprintCanvas
          svgId={svgId}
          layout={layout}
          clusters={clusters}
          overlay={state.overlay}
          phases={state.phases}
          projects={state.projects}
          launchProgress={state.launchProgress}
          title={state.title}
          t={t}
          zoom={zoom}
          svgContainerRef={svgContainerRef}
          labelsVisible={labelsVisible}
          animationsEnabled={animationsEnabled}
          glowEdges={glowEdges}
          glowProjectKeys={glowProjectKeys}
          projectMap={projectMap}
          dependencyLabels={dependencyLabels}
          installedProjects={installedProjects}
          dragProject={dragProject}
          dropTarget={dropTarget}
          onPanStart={handlePanStart}
          onClusterHover={handleClusterHover}
          onProjectHover={handleProjectHover}
          onHoveredProjectKeyChange={setHoveredProjectKey}
          onHoveredEdgeChange={setHoveredEdge}
          onDragProjectChange={setDragProject}
          onDropTargetChange={setDropTarget}
          onMoveProject={onMoveProject}
        />

        <BlueprintInfoSidebar
          infoPanelCollapsed={infoPanelCollapsed}
          infoPanelWidth={infoPanelWidth}
          visiblePanel={visiblePanel}
          layout={layout}
          phases={state.phases}
          projects={state.projects}
          installedProjects={installedProjects}
          onMouseEnter={() => clearHidePanelTimeout(hidePanelTimeoutRef)}
          onMouseLeave={() => undefined}
          onResizeStart={handleResizeStart}
          onShowProject={handleShowMissionPreview}
        />
      </div>

      <MissionPreviewModal
        previewMission={previewMission}
        previewLoading={previewLoading}
        previewRaw={previewRaw}
        onClose={() => {
          setPreviewMission(null)
          setPreviewRaw(false)
        }}
        onToggleRaw={() => setPreviewRaw((value) => !value)}
      />
    </div>
  )
}
