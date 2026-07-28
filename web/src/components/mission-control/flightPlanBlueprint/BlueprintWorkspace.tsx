import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
  AlertTriangle,
  Shield,
} from 'lucide-react'
import { cn } from '../../../lib/cn'
import { detectCloudProvider } from '../../ui/CloudProviderIcon'
import { BlueprintDefs } from '../svg/BlueprintDefs'
import { ClusterZone } from '../svg/ClusterZone'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from '../svg/DependencyPath'
import { ProjectNode } from '../svg/ProjectNode'
import { PhaseTimeline } from '../svg/PhaseTimeline'
import type { ClusterHoverInfo } from '../svg/ClusterZone'
import type { ProjectHoverInfo } from '../svg/ProjectNode'
import type { MissionControlState, PayloadProject } from '../types'
import type { computeLayout } from '../BlueprintLayout'
import { shortenClusterName } from '../BlueprintReport'
import {
  ProjectInfoPanel,
  ClusterInfoPanel,
  DeployModeInfoPanel,
  generateDefaultPhases,
} from '../BlueprintInfoPanels'
import type { InfoPanelData } from './types'

const MIN_LABEL_GAP = 14
const NODE_RADIUS = 18
const LABEL_OFFSET_Y = 12

interface ClusterLike {
  name: string
  distribution?: string
  server?: string
  namespaces?: string[]
  user?: string
  nodeCount?: number
  cpuCores?: number
  cpuUsageCores?: number
  cpuRequestsCores?: number
  memoryGB?: number
  memoryUsageGB?: number
  memoryRequestsGB?: number
  storageGB?: number
  pvcCount?: number
  pvcBoundCount?: number
  podCount?: number
}

interface BlueprintWorkspaceProps {
  state: MissionControlState
  clusters: ClusterLike[]
  clustersError?: string | null
  layout: ReturnType<typeof computeLayout>
  svgId: string
  zoom: number
  setZoom: Dispatch<SetStateAction<number>>
  zoomMin: number
  zoomMax: number
  zoomStep: number
  infoPanelCollapsed: boolean
  setInfoPanelCollapsed: Dispatch<SetStateAction<boolean>>
  animationsEnabled: boolean
  setAnimationsEnabled: Dispatch<SetStateAction<boolean>>
  labelsVisible: boolean
  setLabelsVisible: Dispatch<SetStateAction<boolean>>
  onExportReport: () => void
  svgContainerRef: RefObject<HTMLDivElement | null>
  handlePanStart: (event: ReactMouseEvent) => void
  handleClusterHover: (info: ClusterHoverInfo | null) => void
  handleProjectHover: (info: ProjectHoverInfo | null) => void
  setHoveredEdge: Dispatch<SetStateAction<{ from: string; to: string } | null>>
  setHoveredProjectKey: Dispatch<SetStateAction<string | null>>
  projectMap: Map<string, PayloadProject>
  installedProjects: Set<string>
  glowEdges: Set<string>
  glowProjectKeys: Set<string>
  dragProject: { name: string; fromCluster: string } | null
  setDragProject: Dispatch<SetStateAction<{ name: string; fromCluster: string } | null>>
  dropTarget: string | null
  setDropTarget: Dispatch<SetStateAction<string | null>>
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  infoPanelWidth: number
  handleInfoPanelEnter: () => void
  handleInfoPanelLeave: () => void
  handleResizeStart: (event: ReactMouseEvent) => void
  visiblePanel: InfoPanelData | null
  onShowMissionPreview: (project: PayloadProject) => void
}

export function BlueprintWorkspace({
  state,
  clusters,
  clustersError,
  layout,
  svgId,
  zoom,
  setZoom,
  zoomMin,
  zoomMax,
  zoomStep,
  infoPanelCollapsed,
  setInfoPanelCollapsed,
  animationsEnabled,
  setAnimationsEnabled,
  labelsVisible,
  setLabelsVisible,
  onExportReport,
  svgContainerRef,
  handlePanStart,
  handleClusterHover,
  handleProjectHover,
  setHoveredEdge,
  setHoveredProjectKey,
  projectMap,
  installedProjects,
  glowEdges,
  glowProjectKeys,
  dragProject,
  setDragProject,
  dropTarget,
  setDropTarget,
  onMoveProject,
  infoPanelWidth,
  handleInfoPanelEnter,
  handleInfoPanelLeave,
  handleResizeStart,
  visiblePanel,
  onShowMissionPreview,
}: BlueprintWorkspaceProps) {
  const { t } = useTranslation()

  return (
    <>
      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            <button
              onClick={() => setZoom(z => Math.min(z + zoomStep, zoomMax))}
              className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(z - zoomStep, zoomMin))}
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
              className={cn('p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors', !labelsVisible && 'opacity-50')}
              title={labelsVisible ? 'Hide line labels' : 'Show line labels'}
            >
              <Tags className="w-4 h-4" />
            </button>
            <button
              onClick={onExportReport}
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
                        onHover={(info) => {
                          handleProjectHover(info)
                          setHoveredProjectKey(info ? compositeKey : null)
                        }}
                        onDragStart={(n) => setDragProject({ name: n, fromCluster: pos.clusterName })}
                        onDragEnd={() => { setDragProject(null); setDropTarget(null) }}
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
                          onHover={setHoveredEdge}
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

        <div
          className={cn(
            'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
            infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden'
          )}
          style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
          onMouseEnter={handleInfoPanelEnter}
          onMouseLeave={handleInfoPanelLeave}
        >
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
                    onShowProject={(proj) => onShowMissionPreview(proj)}
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
    </>
  )
}
