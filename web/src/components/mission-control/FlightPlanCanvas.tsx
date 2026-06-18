import type { Dispatch, MouseEvent, RefObject, SetStateAction } from 'react'
import { motion } from 'framer-motion'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Download,
  Tags,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { ClusterInfo } from '../../hooks/mcp/types'

import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import type {
  MissionControlState,
  BlueprintLayout,
  PayloadProject,
} from './types'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { exportFullReport, shortenClusterName } from './BlueprintReport'
import { generateDefaultPhases } from './BlueprintInfoPanels'

/** Minimum zoom scale */
const ZOOM_MIN = 0.3
/** Maximum zoom scale */
const ZOOM_MAX = 3
/** Per-click zoom increment */
const ZOOM_STEP = 0.2
/** Minimum gap (SVG units) between two label slots to avoid overlap */
const MIN_LABEL_GAP = 14
/** Radius (SVG units) of a project node — used to push labels clear of nodes */
const NODE_RADIUS = 18
/** Vertical offset (SVG units) to place the label above the edge midpoint */
const LABEL_OFFSET_Y = 12

interface FlightPlanCanvasProps {
  svgId: string
  state: MissionControlState
  healthyState: MissionControlState
  layout: BlueprintLayout
  clusters: ClusterInfo[]
  installedProjects: Set<string>
  projectMap: Map<string, PayloadProject>
  svgContainerRef: RefObject<HTMLDivElement | null>
  zoom: number
  infoPanelCollapsed: boolean
  animationsEnabled: boolean
  labelsVisible: boolean
  dragProject: { name: string; fromCluster: string } | null
  dropTarget: string | null
  glowEdges: Set<string>
  glowProjectKeys: Set<string>
  onSetZoom: Dispatch<SetStateAction<number>>
  onToggleInfoPanel: () => void
  onToggleAnimations: () => void
  onToggleLabels: () => void
  onPanStart: (e: MouseEvent) => void
  onProjectHover: (info: ProjectHoverInfo | null, compositeKey: string | null) => void
  onClusterHover: (info: ClusterHoverInfo | null) => void
  onDragStart: (name: string, fromCluster: string) => void
  onDragEnd: () => void
  onDropTargetChange: (clusterName: string | null) => void
  onDropProject: (toCluster: string) => void
  onEdgeHover: (edge: { from: string; to: string } | null) => void
  t: (key: string) => string
}

export function FlightPlanCanvas({
  svgId,
  state,
  healthyState,
  layout,
  clusters,
  installedProjects,
  projectMap,
  svgContainerRef,
  zoom,
  infoPanelCollapsed,
  animationsEnabled,
  labelsVisible,
  dragProject,
  dropTarget,
  glowEdges,
  glowProjectKeys,
  onSetZoom,
  onToggleInfoPanel,
  onToggleAnimations,
  onToggleLabels,
  onPanStart,
  onProjectHover,
  onClusterHover,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDropProject,
  onEdgeHover,
  t,
}: FlightPlanCanvasProps) {
  return (
    <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          onClick={() => onSetZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSetZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => onSetZoom(1)}
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
          onClick={onToggleAnimations}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
        >
          {animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={onToggleLabels}
          className={cn('p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors', !labelsVisible && 'opacity-50')}
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
          onMouseDown={onPanStart}
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
                    onHover={(info) => onProjectHover(info, info ? compositeKey : null)}
                    onDragStart={(n) => onDragStart(n, pos.clusterName)}
                    onDragEnd={onDragEnd}
                  />
                )
              })}

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
                      onHover={onEdgeHover}
                      highlight={glowEdges.has(clusterEdgeKey)}
                      dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
                      overlayDim={state.overlay !== 'architecture'}
                    />
                  )
                })
              })()}

              <PhaseTimeline
                id={svgId}
                phases={state.phases.length > 0 ? state.phases : generateDefaultPhases(state.projects)}
                progress={state.launchProgress}
                viewBoxWidth={layout.viewBox.width}
                y={layout.viewBox.height - 30}
              />

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
                        : 'border-slate-500/30 hover:border-primary/50 hover:bg-primary/5',
                  )}
                  onDragOver={(e) => {
                    e.preventDefault()
                    onDropTargetChange(name)
                  }}
                  onDragLeave={() => onDropTargetChange(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    onDropProject(name)
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
