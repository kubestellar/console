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
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Network,
  Shield,
  Layout,
  HardDrive,
  Info,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Download,
  Tags,
  Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import type {
  MissionControlState,
  OverlayMode } from './types'
import { useClusters } from '../../hooks/mcp/clusters'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { fetchMissionContent } from '../missions/browser/missionCache'
// missionCache provides file-system caching; no lastUpdated timestamp needed — missions are loaded fresh on each open
import type { MissionExport } from '../../lib/missions/types'
import { MissionDetailView } from '../missions/MissionDetailView'
import type { PayloadProject } from './types'

import { computeLayout } from './BlueprintLayout'
import { exportFullReport, shortenClusterName } from './BlueprintReport'
import {
  ProjectInfoPanel,
  ClusterInfoPanel,
  DeployModeInfoPanel,
  generateDefaultPhases,
} from './BlueprintInfoPanels'

/** Resolve kbPath for a project — tries explicit kbPath, then convention-based lookup */
function resolveKbPath(proj: PayloadProject): string | undefined {
  if (proj.kbPath) return proj.kbPath
  // Convention: fixes/cncf-install/install-{name}.json
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
// Overlay buttons
// ---------------------------------------------------------------------------

const OVERLAYS: { key: OverlayMode; icon: React.ReactNode; label: string }[] = [
  { key: 'architecture', icon: <Layout className="w-3.5 h-3.5" />, label: 'Architecture' },
  { key: 'compute', icon: <Zap className="w-3.5 h-3.5" />, label: 'Compute' },
  { key: 'storage', icon: <HardDrive className="w-3.5 h-3.5" />, label: 'Storage' },
  { key: 'network', icon: <Network className="w-3.5 h-3.5" />, label: 'Network' },
  { key: 'security', icon: <Shield className="w-3.5 h-3.5" />, label: 'Security' },
]

// ---------------------------------------------------------------------------
// Info panel type
// ---------------------------------------------------------------------------

type InfoPanelData =
  | { kind: 'project'; info: ProjectHoverInfo }
  | { kind: 'cluster'; info: ClusterHoverInfo }
  | { kind: 'deployMode'; mode: 'phased' | 'yolo'; phases: MissionControlState['phases'] }

// ---------------------------------------------------------------------------
// Panel resize constants
// ---------------------------------------------------------------------------

/** Minimum info-panel width (px) */
const INFO_PANEL_MIN = 280
/** Maximum info-panel width (px) */
const INFO_PANEL_MAX = 600
/** Default info-panel width (px) — 26rem */
const INFO_PANEL_DEFAULT = 416
/** localStorage key for persisted panel width */
const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

// ---------------------------------------------------------------------------
// Zoom constants
// ---------------------------------------------------------------------------

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_STEP = 0.2

// ---------------------------------------------------------------------------
// Dependency-label layout constants
// ---------------------------------------------------------------------------

/** Minimum gap (SVG units) between two label slots to avoid overlap */
const MIN_LABEL_GAP = 14
/** Radius (SVG units) of a project node — used to push labels clear of nodes */
const NODE_RADIUS = 18
/** Vertical offset (SVG units) to place the label above the edge midpoint */
const LABEL_OFFSET_Y = 12

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
  const { clusters, error: clustersError } = useClusters()

  // Filter out explicitly unhealthy clusters and redistribute orphaned projects to healthy ones.
  // Also scope to state.targetClusters when set — without this, assignments from
  // clusters the user later removed from TARGET CLUSTERS still appear in the
  // Flight Plan (e.g. user picks prow + waldorf in Define Mission but ks-docs-oci
  // — left over from a prior session — still shows up as a third lane).
  const healthyState = useMemo(() => {
    const targetSet = new Set(state.targetClusters || [])
    let assignments = targetSet.size === 0
      ? state.assignments
      : state.assignments.filter(a => targetSet.has(a.clusterName))
    // Only build the unhealthy set from clusters that are explicitly marked unhealthy/unreachable.
    // Clusters not present in the clusters list (e.g. not yet loaded) are left alone so that
    // user-assigned projects are never silently dropped.
    const unhealthyNames = clusters?.length
      ? new Set(clusters.filter(c => c.healthy === false || c.reachable === false).map(c => c.name))
      : new Set<string>()

    // Only filter out explicitly unhealthy clusters
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

    // Allow projects on multiple clusters — composite keys handle positioning
    return { ...state, assignments }
  }, [state, clusters])

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

  // Zoom controls
  const [zoom, setZoom] = useState(1)

  // Animation toggle
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  // Line labels toggle
  const [labelsVisible, setLabelsVisible] = useState(true)

  // Hovered edge (from label hover) or hovered project (composite key: "cluster/project")
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null

  // Compute which edges should glow — cluster-scoped
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
        // Same-cluster edges: only glow if on the hovered cluster
        // Cross-cluster edges: always glow if the hovered project is an endpoint
        if (!edge.crossCluster && edgeCluster !== hoveredCluster) continue
        edges.add(`${edgeCluster}:${edge.from}-${edge.to}`)
      }
    }
    return edges
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])

  // Compute which project nodes should glow — composite keys for cluster scoping
  const glowProjectKeys = useMemo(() => {
    const keys = new Set<string>()
    if (hoveredEdge && layout) {
      for (const key of layout.projectPositions.keys()) {
        const pName = key.split('/')[1]
        if (pName === hoveredEdge.from || pName === hoveredEdge.to) keys.add(key)
      }
    }
    if (hoveredProjectKey && hoveredProjectName && layout) {
      // Always glow the hovered project itself
      keys.add(hoveredProjectKey)
      // Find connected project names — separate same-cluster vs cross-cluster
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
        // Same-cluster connections: glow on same cluster
        if (cluster === hoveredCluster && sameClusterConnected.has(pName)) keys.add(key)
        // Cross-cluster connections: glow on any cluster
        if (crossClusterConnected.has(pName)) keys.add(key)
      }
    }
    return keys
  }, [hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout])

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
      const newWidth = Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, startWidthRef.current - deltaX))
      setInfoPanelWidth(newWidth)
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

  const projectMap = new Map(state.projects.map((p) => [p.name, p]))

  const handleProjectHover = (info: ProjectHoverInfo | null) => {
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
    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
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

  // The visible panel: active hover wins, otherwise fall back to sticky (last hovered)
  const visiblePanel = infoPanel ?? stickyPanel

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div>
          <h2 className="text-lg font-bold">
            Flight Plan{state.title ? `: ${state.title}` : ''}
          </h2>
          <p className="text-xs text-muted-foreground">
            {state.projects.length} projects across{' '}
            {healthyState.assignments.filter((a) => a.projectNames.length > 0).length} clusters
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Overlay toggles */}
          <div className="hidden md:flex items-center rounded-lg border border-border overflow-hidden">
            {OVERLAYS.map((o) => (
              <button
                key={o.key}
                onClick={() => onOverlayChange(o.key)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
                  state.overlay === o.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                )}
                title={o.label}
              >
                {o.icon}
                <span className="hidden lg:inline">{o.label}</span>
              </button>
            ))}
          </div>

          {/* Deploy mode toggle */}
          <div className="flex items-center rounded-lg overflow-hidden">
            <button
              onClick={() => {
                onDeployModeChange('phased')
                const data: InfoPanelData = { kind: 'deployMode', mode: 'phased', phases: state.phases }
                setStickyPanel(data)
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all duration-150 border',
                'rounded-l-lg',
                state.deployMode === 'phased'
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 shadow-inner'
                  : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
              )}
            >
              phased
            </button>
            <button
              onClick={() => {
                onDeployModeChange('yolo')
                const data: InfoPanelData = { kind: 'deployMode', mode: 'yolo', phases: state.phases }
                setStickyPanel(data)
              }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-all duration-150 border -ml-px',
                'rounded-r-lg',
                state.deployMode === 'yolo'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-inner'
                  : 'bg-secondary/30 text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
              )}
            >
              yolo
            </button>
          </div>

          {/* Spacer — action buttons moved to footer */}
          <div />
        </div>
      </div>

      {/* Error banner when cluster data fails to load (issue 6772) */}
      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      {/* Main content: SVG left + Info panel right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* SVG Blueprint */}
        <div className="flex-1 p-4 overflow-hidden relative">
          {/* Zoom & sidebar controls */}
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Reset zoom"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setInfoPanelCollapsed(c => !c)}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-1"
              title={infoPanelCollapsed ? 'Show info panel' : 'Hide info panel'}
            >
              {infoPanelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setAnimationsEnabled(a => !a)}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
            >
              {animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setLabelsVisible(v => !v)}
              className={cn("p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors", !labelsVisible && "opacity-50")}
              title={labelsVisible ? 'Hide line labels' : 'Show line labels'}
            >
              <Tags className="w-4 h-4" />
            </button>
            <button
              onClick={() => exportFullReport(state, healthyState, installedProjects, layout, svgContainerRef)}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Export full report (Print to PDF)"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div
            ref={svgContainerRef}
            className="w-full max-w-full h-full overflow-x-auto overflow-y-auto"
            style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
            onMouseDown={handlePanStart}
          >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, minWidth: `${zoom * 100}%`, minHeight: `${zoom * 100}%` }}
          >
            <svg
              viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
              className="w-full h-full"
            >
              <BlueprintDefs id={svgId} />

              <rect
                width={layout.viewBox.width}
                height={layout.viewBox.height}
                fill={`url(#${svgId}-grid)`}
                opacity={0.5}
              />

              {/* Cluster zones */}
              {Array.from(layout.clusterRects.entries()).map(([name, rect], i) => {
                const cluster = clusters.find((c) => c.name === name)
                return (
                  <ClusterZone
                    key={name}
                    id={svgId}
                    name={shortenClusterName(name)}
                    provider={cluster?.distribution ?? detectCloudProvider(name, cluster?.server, cluster?.namespaces, cluster?.user)}
                    rect={rect}
                    nodeCount={cluster?.nodeCount}
                    cpuCores={cluster?.cpuCores}
                    cpuUsage={cluster?.cpuUsageCores ?? cluster?.cpuRequestsCores}
                    memGB={cluster?.memoryGB}
                    memUsage={cluster?.memoryUsageGB ?? cluster?.memoryRequestsGB}
                    storageGB={cluster?.storageGB}
                    pvcCount={cluster?.pvcCount}
                    pvcBoundCount={cluster?.pvcBoundCount}
                    podCount={cluster?.podCount}
                    index={i}
                    overlay={state.overlay}
                    onHover={handleClusterHover}
                  />
                )
              })}

              {/* Dependency paths — use pre-resolved positions from layout */}
              {layout.dependencyEdges.map((edge, i) => {
                const from = edge.fromPos
                const to = edge.toPos
                if (!from || !to) return null
                if (from.cx <= 0 || from.cy <= 0 || to.cx <= 0 || to.cy <= 0) return null
                const clusterEdgeKey = `${from.clusterName}:${edge.from}-${edge.to}`
                return (
                  <DependencyPath
                    key={clusterEdgeKey}
                    id={svgId}
                    fromX={from.cx}
                    fromY={from.cy}
                    toX={to.cx}
                    toY={to.cy}
                    crossCluster={edge.crossCluster}
                    index={i}
                    label={edge.label}
                    animate={animationsEnabled}
                    highlight={glowEdges.has(clusterEdgeKey)}
                    dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
                    overlayDim={state.overlay !== 'architecture'}
                  />
                )
              })}

              {/* Project nodes — composite keys allow same project on multiple clusters */}
              {Array.from(layout.projectPositions.entries()).map(([compositeKey, pos], i) => {
                const project = projectMap.get(pos.projectName)
                if (!project) return null
                const launchProject = state.launchProgress
                  .flatMap((p) => p.projects)
                  .find((p) => p.name === pos.projectName)
                return (
                  <ProjectNode
                    key={compositeKey}
                    id={svgId}
                    name={project.name}
                    displayName={project.displayName}
                    category={project.category}
                    cx={pos.cx}
                    cy={pos.cy}
                    index={i}
                    status={launchProject?.status}
                    isRequired={project.priority === 'required'}
                    installed={installedProjects.has(project.name)}
                    reason={project.reason}
                    dependencies={project.dependencies}
                    kbPath={project.kbPath}
                    maturity={project.maturity}
                    priority={project.priority}
                    overlay={state.overlay}
                    glow={glowProjectKeys.has(compositeKey)}
                    dimmed={glowProjectKeys.size > 0 && !glowProjectKeys.has(compositeKey)}
                    kubaraChart={project.kubaraChart}
                    onHover={(info) => {
                      handleProjectHover(info)
                      setHoveredProjectKey(info ? compositeKey : null)
                    }}
                    onDragStart={(n) => setDragProject({ name: n, fromCluster: pos.clusterName })}
                    onDragEnd={() => { setDragProject(null); setDropTarget(null) }}
                  />
                )
              })}

              {/* Dependency labels — top layer so they're never hidden behind lines */}
              {labelsVisible && (() => {
                const labelSlots: { x: number; y: number }[] = []
                const nodeCenters = Array.from(layout.projectPositions.values())
                return layout.dependencyEdges.map((edge) => {
                  if (!edge.label) return null
                  const from = edge.fromPos
                  const to = edge.toPos
                  if (!from || !to) return null
                  if (from.cx <= 0 || from.cy <= 0 || to.cx <= 0 || to.cy <= 0) return null

                  const { midX, midY: rawMidY } = computeEdgeMidpoint(from.cx, from.cy, to.cx, to.cy)
                  let labelY = rawMidY - LABEL_OFFSET_Y
                  // Push away from project nodes
                  for (const node of nodeCenters) {
                    const dx = Math.abs(midX - node.cx)
                    const dy = Math.abs(labelY - node.cy)
                    if (dx < 40 && dy < NODE_RADIUS + 8) {
                      labelY = node.cy - NODE_RADIUS - LABEL_OFFSET_Y
                    }
                  }
                  // Avoid overlapping other labels
                  for (const slot of labelSlots) {
                    const dxL = Math.abs(midX - slot.x)
                    const dyL = Math.abs(labelY - slot.y)
                    if (dxL < 60 && dyL < MIN_LABEL_GAP) {
                      labelY = slot.y - MIN_LABEL_GAP
                    }
                  }
                  labelSlots.push({ x: midX, y: labelY })
                  const clusterEdgeKey = `${from.clusterName}:${edge.from}-${edge.to}`
                  return (
                    <DependencyLabel
                      key={`label-${clusterEdgeKey}`}
                      midX={midX}
                      midY={labelY}
                      label={edge.label}
                      crossCluster={edge.crossCluster}
                      fromName={edge.from}
                      toName={edge.to}
                      anchorX={midX}
                      anchorY={rawMidY}
                      onHover={setHoveredEdge}
                      highlight={glowEdges.has(clusterEdgeKey)}
                      dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
                      overlayDim={state.overlay !== 'architecture'}
                    />
                  )
                })
              })()}

              {/* Phase timeline */}
              <PhaseTimeline
                id={svgId}
                phases={state.phases.length > 0 ? state.phases : generateDefaultPhases(state.projects)}
                progress={state.launchProgress}
                viewBoxWidth={layout.viewBox.width}
                y={layout.viewBox.height - 30}
              />

              {/* Title */}
              <text
                x={layout.viewBox.width / 2}
                y={10}
                textAnchor="middle"
                fill="white"
                fontSize={8}
                fontWeight="600"
                fontFamily="system-ui, sans-serif"
                opacity={0.4}
              >
                FLIGHT PLAN{state.title ? `: ${state.title.toUpperCase()}` : ''}
              </text>


            </svg>
          </motion.div>
          </div>

          {/* Drag-and-drop overlay — invisible drop zones per cluster */}
          {dragProject && (
            <div className="absolute inset-4 pointer-events-none" style={{ zIndex: 10 }}>
              <svg
                viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
                className="w-full h-full max-h-full"
              >
                {Array.from(layout.clusterRects.entries()).map(([name, rect]) => (
                  <foreignObject key={name} x={rect.x} y={rect.y} width={rect.width} height={rect.height}>
                    <div
                      className={cn(
                        'w-full h-full rounded-lg border-2 border-dashed transition-colors pointer-events-auto',
                        dropTarget === name
                          ? 'border-primary bg-primary/10'
                          : dragProject.fromCluster === name
                            ? 'border-transparent'
                            : 'border-slate-500/30 hover:border-primary/50 hover:bg-primary/5'
                      )}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDropTarget(name)
                      }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragProject && name !== dragProject.fromCluster) {
                          onMoveProject?.(dragProject.name, dragProject.fromCluster, name)
                        }
                        setDragProject(null)
                        setDropTarget(null)
                      }}
                    />
                  </foreignObject>
                ))}
              </svg>
            </div>
          )}


        </div>

        {/* Right info panel */}
        <div
          className={cn(
            'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
            infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden'
          )}
          style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
        >
          {/* Resize drag handle */}
          <div
            className="absolute top-0 left-0 w-[3px] h-full cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60 transition-colors"
            onMouseDown={handleResizeStart}
          />
          <AnimatePresence mode="wait">
            {visiblePanel ? (
              <motion.div
                key={visiblePanel.kind === 'deployMode' ? `dm-${visiblePanel.mode}` : `${visiblePanel.kind}-${visiblePanel.info.name}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.12 }}
                className="p-4 space-y-4 flex-1 flex flex-col min-h-0"
              >
                {visiblePanel.kind === 'project' ? (
                  <ProjectInfoPanel info={visiblePanel.info} edges={layout?.dependencyEdges} />
                ) : visiblePanel.kind === 'cluster' ? (
                  <ClusterInfoPanel info={visiblePanel.info} />
                ) : (
                  <DeployModeInfoPanel
                    mode={visiblePanel.mode}
                    phases={state.phases}
                    projects={state.projects}
                    onShowProject={(proj) => handleShowMissionPreview(proj)}
                    installedProjects={installedProjects}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6"
              >
                <Info className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm text-center">Hover a project or cluster for details</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Mission preview modal */}
      {(previewMission || previewLoading) && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-xs"
          onClick={(e) => { if (e.target === e.currentTarget) { setPreviewMission(null); setPreviewRaw(false) } }}
          onKeyDownCapture={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              e.nativeEvent.stopImmediatePropagation()
              setPreviewMission(null)
              setPreviewRaw(false)
            }
          }}
          role="dialog"
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          <div className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl">
            {previewLoading ? (
              <div className="flex items-center justify-center py-24 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading mission...
              </div>
            ) : previewMission ? (
              <MissionDetailView
                mission={previewMission}
                rawContent={JSON.stringify(previewMission, null, 2)}
                showRaw={previewRaw}
                onToggleRaw={() => setPreviewRaw((p) => !p)}
                onImport={() => { setPreviewMission(null); setPreviewRaw(false) }}
                onBack={() => { setPreviewMission(null); setPreviewRaw(false) }}
                importLabel="Close"
                hideBackButton
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
