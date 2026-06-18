import { useState, useRef, useEffect, useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { motion } from 'framer-motion'
import {
  ZoomIn, ZoomOut, Maximize2, PanelRightClose, PanelRightOpen,
  Pause, Play, Download, Tags, Loader2, AlertTriangle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'
import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import type { MissionControlState, BlueprintLayout } from './types'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { exportFullReport, shortenClusterName } from './BlueprintReport'
import { generateDefaultPhases } from './BlueprintInfoPanels'

// ---------------------------------------------------------------------------
// Canvas-local constants
// ---------------------------------------------------------------------------

const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const ZOOM_STEP = 0.2

/** Minimum gap (SVG units) between two label slots to avoid overlap */
const MIN_LABEL_GAP = 14
/** Radius (SVG units) of a project node — used to push labels clear of nodes */
const NODE_RADIUS = 18
/** Vertical offset (SVG units) to place the label above the edge midpoint */
const LABEL_OFFSET_Y = 12

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BlueprintCanvasProps {
  svgId: string
  layout: BlueprintLayout
  state: MissionControlState
  healthyState: MissionControlState
  clusters: ClusterInfo[]
  installedProjects: Set<string>
  infoPanelCollapsed: boolean
  onToggleInfoPanel: () => void
  onProjectHover: (info: ProjectHoverInfo | null) => void
  onClusterHover: (info: ClusterHoverInfo | null) => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlueprintCanvas({
  svgId,
  layout,
  state,
  healthyState,
  clusters,
  installedProjects,
  infoPanelCollapsed,
  onToggleInfoPanel,
  onProjectHover,
  onClusterHover,
  onMoveProject,
}: BlueprintCanvasProps) {
  const { t } = useTranslation()

  const [zoom, setZoom] = useState(1)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [labelsVisible, setLabelsVisible] = useState(true)
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProjectKey, setHoveredProjectKey] = useState<string | null>(null)
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const svgContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const projectMap = new Map(state.projects.map((p) => [p.name, p]))

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

  return (
    <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
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
          onClick={onToggleInfoPanel}
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

      {/* Empty state when no healthy clusters */}
      {layout.clusterRects.size === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md p-8">
            <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t('layout.missionSidebar.noHealthyClustersTitle')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('layout.missionSidebar.noHealthyClustersMessage')}
            </p>
          </div>
        </div>
      ) : (
      <div
        ref={svgContainerRef}
        className="w-full max-w-full max-h-full h-full overflow-x-auto overflow-y-auto"
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
          preserveAspectRatio="xMidYMid meet"
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
                onHover={onClusterHover}
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
                  onProjectHover(info)
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
              for (const node of nodeCenters) {
                const dx = Math.abs(midX - node.cx)
                const dy = Math.abs(labelY - node.cy)
                if (dx < 40 && dy < NODE_RADIUS + 8) {
                  labelY = node.cy - NODE_RADIUS - LABEL_OFFSET_Y
                }
              }
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
      )}

      {/* Drag-and-drop overlay — invisible drop zones per cluster */}
      {dragProject && layout.clusterRects.size > 0 && (
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
  )
}
