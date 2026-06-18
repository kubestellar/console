import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import type {
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { ClusterInfo } from '../../hooks/mcp/types'
import { cn } from '../../lib/cn'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { shortenClusterName } from './BlueprintReport'
import { LABEL_OFFSET_Y, MIN_LABEL_GAP, NODE_RADIUS } from './FlightPlanBlueprintConstants'
import { FlightPlanBlueprintCanvasControls } from './FlightPlanBlueprintCanvasControls'
import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone, type ClusterHoverInfo } from './svg/ClusterZone'
import {
  computeEdgeMidpoint,
  DependencyLabel,
  DependencyPath,
} from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import { ProjectNode, type ProjectHoverInfo } from './svg/ProjectNode'
import {
  generateDefaultPhases,
} from './BlueprintInfoPanels'
import type {
  BlueprintLayout,
  MissionControlState,
  PayloadProject,
} from './types'

interface FlightPlanBlueprintCanvasProps {
  svgId: string
  state: MissionControlState
  layout: BlueprintLayout
  clusters: ClusterInfo[]
  zoom: number
  setZoom: (value: SetStateAction<number>) => void
  infoPanelCollapsed: boolean
  setInfoPanelCollapsed: (value: SetStateAction<boolean>) => void
  animationsEnabled: boolean
  setAnimationsEnabled: (value: SetStateAction<boolean>) => void
  labelsVisible: boolean
  setLabelsVisible: (value: SetStateAction<boolean>) => void
  svgContainerRef: RefObject<HTMLDivElement | null>
  handlePanStart: (event: ReactMouseEvent) => void
  handleProjectHover: (info: ProjectHoverInfo | null) => void
  handleClusterHover: (info: ClusterHoverInfo | null) => void
  setHoveredProjectKey: (value: string | null) => void
  setHoveredEdge: (value: { from: string; to: string } | null) => void
  glowEdges: Set<string>
  glowProjectKeys: Set<string>
  projectMap: Map<string, PayloadProject>
  dragProject: { name: string; fromCluster: string } | null
  setDragProject: (value: SetStateAction<{ name: string; fromCluster: string } | null>) => void
  dropTarget: string | null
  setDropTarget: (value: SetStateAction<string | null>) => void
  installedProjects: Set<string>
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  onExport: () => void
}

export function FlightPlanBlueprintCanvas({
  svgId,
  state,
  layout,
  clusters,
  zoom,
  setZoom,
  infoPanelCollapsed,
  setInfoPanelCollapsed,
  animationsEnabled,
  setAnimationsEnabled,
  labelsVisible,
  setLabelsVisible,
  svgContainerRef,
  handlePanStart,
  handleProjectHover,
  handleClusterHover,
  setHoveredProjectKey,
  setHoveredEdge,
  glowEdges,
  glowProjectKeys,
  projectMap,
  dragProject,
  setDragProject,
  dropTarget,
  setDropTarget,
  installedProjects,
  onMoveProject,
  onExport,
}: FlightPlanBlueprintCanvasProps) {
  const { t } = useTranslation()

  return (
    <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
      <FlightPlanBlueprintCanvasControls
        zoom={zoom}
        setZoom={setZoom}
        infoPanelCollapsed={infoPanelCollapsed}
        setInfoPanelCollapsed={setInfoPanelCollapsed}
        animationsEnabled={animationsEnabled}
        setAnimationsEnabled={setAnimationsEnabled}
        labelsVisible={labelsVisible}
        setLabelsVisible={setLabelsVisible}
        onExport={onExport}
      />

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
            style={{
              width: `${zoom * 100}%`,
              height: `${zoom * 100}%`,
              minWidth: `${zoom * 100}%`,
              minHeight: `${zoom * 100}%`,
            }}
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

              {Array.from(layout.clusterRects.entries()).map(([name, rect], index) => {
                const cluster = clusters.find(current => current.name === name)
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
                    index={index}
                    overlay={state.overlay}
                    onHover={handleClusterHover}
                  />
                )
              })}

              {layout.dependencyEdges.map((edge, index) => {
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
                    index={index}
                    label={edge.label}
                    animate={animationsEnabled}
                    highlight={glowEdges.has(clusterEdgeKey)}
                    dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
                    overlayDim={state.overlay !== 'architecture'}
                  />
                )
              })}

              {Array.from(layout.projectPositions.entries()).map(([compositeKey, position], index) => {
                const project = projectMap.get(position.projectName)
                if (!project) return null
                const launchProject = state.launchProgress
                  .flatMap(progress => progress.projects)
                  .find(progressProject => progressProject.name === position.projectName)
                return (
                  <ProjectNode
                    key={compositeKey}
                    id={svgId}
                    name={project.name}
                    displayName={project.displayName}
                    category={project.category}
                    cx={position.cx}
                    cy={position.cy}
                    index={index}
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
                    onDragStart={(name) => setDragProject({ name, fromCluster: position.clusterName })}
                    onDragEnd={() => {
                      setDragProject(null)
                      setDropTarget(null)
                    }}
                  />
                )
              })}

              {labelsVisible && renderDependencyLabels(layout, glowEdges, glowProjectKeys, state, setHoveredEdge)}

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
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropTarget(name)
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => {
                    event.preventDefault()
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

function renderDependencyLabels(
  layout: BlueprintLayout,
  glowEdges: Set<string>,
  glowProjectKeys: Set<string>,
  state: MissionControlState,
  setHoveredEdge: (value: { from: string; to: string } | null) => void,
) {
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
      const dx = Math.abs(midX - slot.x)
      const dy = Math.abs(labelY - slot.y)
      if (dx < 60 && dy < MIN_LABEL_GAP) {
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
}
