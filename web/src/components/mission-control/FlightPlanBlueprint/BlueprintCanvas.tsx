import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import type { MouseEvent, RefObject } from 'react'
import { cn } from '../../../lib/cn'
import type { Cluster } from '../../../hooks/mcp/clusters'
import { detectCloudProvider } from '../../ui/CloudProviderIcon'
import { generateDefaultPhases } from '../BlueprintInfoPanels'
import { shortenClusterName } from '../BlueprintReport'
import type { ClusterHoverHandler, FlightPlanBlueprintProps, ProjectHoverHandler } from '../FlightPlanBlueprint.types'
import { BlueprintDefs } from '../svg/BlueprintDefs'
import { ClusterZone } from '../svg/ClusterZone'
import { DependencyLabel, DependencyPath } from '../svg/DependencyPath'
import { PhaseTimeline } from '../svg/PhaseTimeline'
import { ProjectNode } from '../svg/ProjectNode'
import type { DependencyLabelPlacement, DragProjectState, HoveredEdge } from './FlightPlanBlueprint.helpers'

interface BlueprintCanvasProps {
  svgId: string
  layout: ReturnType<typeof import('../BlueprintLayout').computeLayout>
  clusters: Cluster[]
  overlay: FlightPlanBlueprintProps['state']['overlay']
  phases: FlightPlanBlueprintProps['state']['phases']
  projects: FlightPlanBlueprintProps['state']['projects']
  launchProgress: FlightPlanBlueprintProps['state']['launchProgress']
  title?: string
  t: (key: string) => string
  zoom: number
  svgContainerRef: RefObject<HTMLDivElement | null>
  labelsVisible: boolean
  animationsEnabled: boolean
  glowEdges: Set<string>
  glowProjectKeys: Set<string>
  projectMap: Map<string, FlightPlanBlueprintProps['state']['projects'][number]>
  dependencyLabels: Array<DependencyLabelPlacement | null>
  installedProjects: Set<string>
  dragProject: DragProjectState | null
  dropTarget: string | null
  onPanStart: (e: MouseEvent) => void
  onClusterHover: ClusterHoverHandler
  onProjectHover: ProjectHoverHandler
  onHoveredProjectKeyChange: (key: string | null) => void
  onHoveredEdgeChange: (edge: HoveredEdge | null) => void
  onDragProjectChange: (project: DragProjectState | null) => void
  onDropTargetChange: (target: string | null) => void
  onMoveProject?: FlightPlanBlueprintProps['onMoveProject']
}

export function BlueprintCanvas({
  svgId,
  layout,
  clusters,
  overlay,
  phases,
  projects,
  launchProgress,
  title,
  t,
  zoom,
  svgContainerRef,
  labelsVisible,
  animationsEnabled,
  glowEdges,
  glowProjectKeys,
  projectMap,
  dependencyLabels,
  installedProjects,
  dragProject,
  dropTarget,
  onPanStart,
  onClusterHover,
  onProjectHover,
  onHoveredProjectKeyChange,
  onHoveredEdgeChange,
  onDragProjectChange,
  onDropTargetChange,
  onMoveProject,
}: BlueprintCanvasProps) {
  return (
    <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
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
            <svg viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
              <BlueprintDefs id={svgId} />
              <rect width={layout.viewBox.width} height={layout.viewBox.height} fill={`url(#${svgId}-grid)`} opacity={0.5} />

              {Array.from(layout.clusterRects.entries()).map(([name, rect], index) => {
                const cluster = clusters.find((item) => item.name === name)
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
                    overlay={overlay}
                    onHover={onClusterHover}
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
                    overlayDim={overlay !== 'architecture'}
                  />
                )
              })}

              {Array.from(layout.projectPositions.entries()).map(([compositeKey, pos], index) => {
                const project = projectMap.get(pos.projectName)
                if (!project) return null
                const launchedProject = launchProgress
                  .flatMap((progress) => progress.projects)
                  .find((progressProject) => progressProject.name === pos.projectName)
                return (
                  <ProjectNode
                    key={compositeKey}
                    id={svgId}
                    name={project.name}
                    displayName={project.displayName}
                    category={project.category}
                    cx={pos.cx}
                    cy={pos.cy}
                    index={index}
                    status={launchedProject?.status}
                    isRequired={project.priority === 'required'}
                    installed={installedProjects.has(project.name)}
                    reason={project.reason}
                    dependencies={project.dependencies}
                    kbPath={project.kbPath}
                    maturity={project.maturity}
                    priority={project.priority}
                    overlay={overlay}
                    glow={glowProjectKeys.has(compositeKey)}
                    dimmed={glowProjectKeys.size > 0 && !glowProjectKeys.has(compositeKey)}
                    kubaraChart={project.kubaraChart}
                    onHover={(info) => {
                      onProjectHover(info)
                      onHoveredProjectKeyChange(info ? compositeKey : null)
                    }}
                    onDragStart={(name) => onDragProjectChange({ name, fromCluster: pos.clusterName })}
                    onDragEnd={() => {
                      onDragProjectChange(null)
                      onDropTargetChange(null)
                    }}
                  />
                )
              })}

              {labelsVisible && dependencyLabels.map((placement) => {
                if (!placement) return null
                const { edge, midX, rawMidY, labelY } = placement
                const from = edge.fromPos
                if (!from) return null
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
                    onHover={onHoveredEdgeChange}
                    highlight={glowEdges.has(clusterEdgeKey)}
                    dimmed={(glowEdges.size > 0 || glowProjectKeys.size > 0) && !glowEdges.has(clusterEdgeKey)}
                    overlayDim={overlay !== 'architecture'}
                  />
                )
              })}

              <PhaseTimeline
                id={svgId}
                phases={phases.length > 0 ? phases : generateDefaultPhases(projects)}
                progress={launchProgress}
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
                FLIGHT PLAN{title ? `: ${title.toUpperCase()}` : ''}
              </text>
            </svg>
          </motion.div>
        </div>
      )}

      {dragProject && layout.clusterRects.size > 0 && (
        <div className="absolute inset-4 pointer-events-none" style={{ zIndex: 10 }}>
          <svg viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`} className="w-full h-full max-h-full">
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
                    onDropTargetChange(name)
                  }}
                  onDragLeave={() => onDropTargetChange(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragProject && name !== dragProject.fromCluster) {
                      onMoveProject?.(dragProject.name, dragProject.fromCluster, name)
                    }
                    onDragProjectChange(null)
                    onDropTargetChange(null)
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
