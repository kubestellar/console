import { useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Shield } from 'lucide-react'
import { useClusters } from '../../hooks/mcp/clusters'
import { computeLayout } from './BlueprintLayout'
import { exportFullReport } from './BlueprintReport'
import { FlightPlanBlueprintCanvas } from './FlightPlanBlueprintCanvas'
import { INFO_PANEL_DEFAULT, INFO_PANEL_LS_KEY, INFO_PANEL_MAX, INFO_PANEL_MIN, type FlightPlanBlueprintProps, type InfoPanelData } from './FlightPlanBlueprintConstants'
import { FlightPlanBlueprintInfoPanel } from './FlightPlanBlueprintInfoPanel'
import { FlightPlanBlueprintToolbar } from './FlightPlanBlueprintToolbar'
import { FlightPlanMissionPreviewModal } from './FlightPlanMissionPreviewModal'
import { createDeployModePanelData } from './FlightPlanBlueprint.utils'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { useFlightPlanMissionPreview } from './useFlightPlanMissionPreview'

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
      : state.assignments.filter(assignment => targetSet.has(assignment.clusterName))
    const unhealthyNames = clusters?.length
      ? new Set(clusters.filter(cluster => cluster.healthy === false || cluster.reachable === false).map(cluster => cluster.name))
      : new Set<string>()

    const hasUnhealthy = assignments.some(assignment => assignment.projectNames.length > 0 && unhealthyNames.has(assignment.clusterName))
    if (hasUnhealthy) {
      const orphanedProjects: string[] = []
      const healthyAssignments = assignments
        .filter((assignment) => {
          if (!unhealthyNames.has(assignment.clusterName)) return true
          orphanedProjects.push(...assignment.projectNames)
          return false
        })
        .map(assignment => ({ ...assignment, projectNames: [...assignment.projectNames] }))

      if (orphanedProjects.length > 0 && healthyAssignments.length > 0) {
        orphanedProjects.forEach((projectName, index) => {
          const target = healthyAssignments[index % healthyAssignments.length]
          if (!target.projectNames.includes(projectName)) {
            target.projectNames.push(projectName)
          }
        })
      }

      assignments = healthyAssignments
    }

    return { ...state, assignments }
  }, [state, clusters])

  const layout = useMemo(() => computeLayout(healthyState), [healthyState])
  const [infoPanel, setInfoPanel] = useState<InfoPanelData | null>(null)
  const [stickyPanel, setStickyPanel] = useState<InfoPanelData | null>(() => createDeployModePanelData(state.deployMode, state.phases))
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const {
    previewMission,
    previewRaw,
    previewLoading,
    showMissionPreview,
    closeMissionPreview,
    togglePreviewRaw,
  } = useFlightPlanMissionPreview()
  const [infoPanelWidth, setInfoPanelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
      if (stored) {
        const parsed = Number(stored)
        if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) return parsed
      }
    } catch {
      // ignore localStorage read failures
    }
    return INFO_PANEL_DEFAULT
  })
  const [infoPanelCollapsed, setInfoPanelCollapsed] = useState(false)
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
          const clusterName = edge.fromPos?.clusterName ?? ''
          edges.add(`${clusterName}:${edge.from}-${edge.to}`)
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
        const projectName = key.split('/')[1]
        if (projectName === hoveredEdge.from || projectName === hoveredEdge.to) {
          keys.add(key)
        }
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
        const [clusterName, projectName] = key.split('/')
        if (clusterName === hoveredCluster && sameClusterConnected.has(projectName)) {
          keys.add(key)
        }
        if (crossClusterConnected.has(projectName)) {
          keys.add(key)
        }
      }
    }

    return keys
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])

  const svgContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = (event: ReactMouseEvent) => {
    if (zoom <= 1) return
    const container = svgContainerRef.current
    if (!container) return

    isPanningRef.current = true
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handlePanMove = (event: MouseEvent) => {
      if (!isPanningRef.current) return
      const container = svgContainerRef.current
      if (!container) return
      const dx = event.clientX - panStartRef.current.x
      const dy = event.clientY - panStartRef.current.y
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

  const handleResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault()
    isResizingRef.current = true
    startXRef.current = event.clientX
    startWidthRef.current = infoPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return
      const deltaX = event.clientX - startXRef.current
      const newWidth = Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, startWidthRef.current - deltaX))
      setInfoPanelWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isResizingRef.current) return
      isResizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setInfoPanelWidth((currentWidth) => {
        try {
          localStorage.setItem(INFO_PANEL_LS_KEY, String(currentWidth))
        } catch {
          // ignore localStorage write failures
        }
        return currentWidth
      })
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [infoPanelWidth])

  useEffect(() => () => {
    if (hidePanelTimeoutRef.current) clearTimeout(hidePanelTimeoutRef.current)
  }, [])

  const projectMap = new Map(state.projects.map(project => [project.name, project]))

  const clearHidePanelTimeout = () => {
    if (!hidePanelTimeoutRef.current) return
    clearTimeout(hidePanelTimeoutRef.current)
    hidePanelTimeoutRef.current = null
  }

  const handleProjectHover = (info: ProjectHoverInfo | null) => {
    clearHidePanelTimeout()
    if (info) {
      const data: InfoPanelData = { kind: 'project', info }
      setInfoPanel(data)
      setStickyPanel(data)
      return
    }
    setInfoPanel(null)
  }

  const handleClusterHover = (info: ClusterHoverInfo | null) => {
    if (dragProject) return
    clearHidePanelTimeout()
    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
      return
    }
    setInfoPanel(null)
  }

  const handleInfoPanelEnter = () => {
    clearHidePanelTimeout()
  }

  const handleInfoPanelLeave = () => undefined

  const handleSelectDeployMode = (mode: FlightPlanBlueprintProps['state']['deployMode']) => {
    onDeployModeChange(mode)
    setStickyPanel(createDeployModePanelData(mode, state.phases))
  }

  const visiblePanel = infoPanel ?? stickyPanel
  const healthyClusterCount = healthyState.assignments.filter(assignment => assignment.projectNames.length > 0).length

  return (
    <div className="h-full min-h-0 flex flex-col">
      <FlightPlanBlueprintToolbar
        state={state}
        healthyClusterCount={healthyClusterCount}
        onOverlayChange={onOverlayChange}
        onSelectDeployMode={handleSelectDeployMode}
      />

      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <FlightPlanBlueprintCanvas
          svgId={svgId}
          state={state}
          layout={layout}
          clusters={clusters}
          zoom={zoom}
          setZoom={setZoom}
          infoPanelCollapsed={infoPanelCollapsed}
          setInfoPanelCollapsed={setInfoPanelCollapsed}
          animationsEnabled={animationsEnabled}
          setAnimationsEnabled={setAnimationsEnabled}
          labelsVisible={labelsVisible}
          setLabelsVisible={setLabelsVisible}
          svgContainerRef={svgContainerRef}
          handlePanStart={handlePanStart}
          handleProjectHover={handleProjectHover}
          handleClusterHover={handleClusterHover}
          setHoveredProjectKey={setHoveredProjectKey}
          setHoveredEdge={setHoveredEdge}
          glowEdges={glowEdges}
          glowProjectKeys={glowProjectKeys}
          projectMap={projectMap}
          dragProject={dragProject}
          setDragProject={setDragProject}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          installedProjects={installedProjects}
          onMoveProject={onMoveProject}
          onExport={() => exportFullReport(state, healthyState, installedProjects, layout, svgContainerRef)}
        />

        <FlightPlanBlueprintInfoPanel
          infoPanelCollapsed={infoPanelCollapsed}
          infoPanelWidth={infoPanelWidth}
          visiblePanel={visiblePanel}
          dependencyEdges={layout?.dependencyEdges}
          phases={state.phases}
          projects={state.projects}
          installedProjects={installedProjects}
          onInfoPanelEnter={handleInfoPanelEnter}
          onInfoPanelLeave={handleInfoPanelLeave}
          onResizeStart={handleResizeStart}
          onShowProject={showMissionPreview}
        />
      </div>

      <FlightPlanMissionPreviewModal
        previewMission={previewMission}
        previewLoading={previewLoading}
        previewRaw={previewRaw}
        onClose={closeMissionPreview}
        onToggleRaw={togglePreviewRaw}
      />
    </div>
  )
}

export { FlightPlanBlueprintCanvas } from './FlightPlanBlueprintCanvas'
export * from './FlightPlanBlueprintConstants'
export { FlightPlanBlueprintInfoPanel } from './FlightPlanBlueprintInfoPanel'
export { FlightPlanMissionPreviewModal } from './FlightPlanMissionPreviewModal'
export { FlightPlanBlueprintToolbar } from './FlightPlanBlueprintToolbar'
export { createDeployModePanelData, resolveKbPath } from './FlightPlanBlueprint.utils'
