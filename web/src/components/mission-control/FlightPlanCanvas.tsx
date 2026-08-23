/**
 * FlightPlanCanvas — the SVG blueprint surface: zoom/pan controls, cluster
 * zones, dependency paths and labels, project nodes, phase timeline, and the
 * drag-and-drop overlay.
 */

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
  AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { exportFullReport, shortenClusterName } from './BlueprintReport'
import { generateDefaultPhases } from './BlueprintInfoPanels'
import { resolveLabelY } from './FlightPlanBlueprint.utils'
import type { MissionControlState } from './types'
import type { FlightPlanBlueprintController } from './useFlightPlanBlueprint'

/** SVG-unit offset from the top of the viewbox for the blueprint title text */
const TITLE_Y = 10
/** SVG-unit offset from the bottom of the viewbox for the phase timeline */
const TIMELINE_OFFSET_Y = 30
/** Percentage multiplier converting the zoom factor to a CSS size */
const ZOOM_PERCENT = 100

interface FlightPlanCanvasProps {
  state: MissionControlState
  controller: FlightPlanBlueprintController
  installedProjects: Set<string>
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
}

export function FlightPlanCanvas({
  state,
  controller,
  installedProjects,
  onMoveProject }: FlightPlanCanvasProps) {
  const { t } = useTranslation()
  const {
    svgId, clusters, healthyState, layout, projectMap,
    svgContainerRef, zoom, zoomIn, zoomOut, resetZoom, handlePanStart,
    animationsEnabled, toggleAnimations, labelsVisible, toggleLabels,
    infoPanelCollapsed, setInfoPanelCollapsed,
    glowEdges, glowProjectKeys, setHoveredEdge, setHoveredProjectKey,
    handleProjectHover, handleClusterHover,
    dragProject, setDragProject, dropTarget, setDropTarget,
  } = controller

  return (
    <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
      {/* Zoom & sidebar controls */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          onClick={zoomIn}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={zoomOut}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={resetZoom}
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
          onClick={toggleAnimations}
          className="p-1 rounded bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title={animationsEnabled ? 'Pause animations' : 'Resume animations'}
        >
          {animationsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleLabels}
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
        style={{ width: `${zoom * ZOOM_PERCENT}%`, height: `${zoom * ZOOM_PERCENT}%`, minWidth: `${zoom * ZOOM_PERCENT}%`, minHeight: `${zoom * ZOOM_PERCENT}%` }}
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
              const labelY = resolveLabelY(midX, rawMidY, nodeCenters, labelSlots)
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
            y={layout.viewBox.height - TIMELINE_OFFSET_Y}
          />

          {/* Title */}
          <text
            x={layout.viewBox.width / 2}
            y={TITLE_Y}
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
