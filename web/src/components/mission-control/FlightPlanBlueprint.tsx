/**
 * FlightPlanBlueprint — Phase 3: Master SVG blueprint.
 *
 * SVG blueprint on left, info panel on right. Hover on any node or cluster
 * populates the right panel with details. Overlays toggle resource views.
 *
 * Sub-modules (refactored per #18875):
 *  - BlueprintLayout.ts                 — layout computation (computeLayout)
 *  - BlueprintReport.ts                 — PDF/print export (exportFullReport)
 *  - BlueprintInfoPanels.tsx            — ProjectInfoPanel, ClusterInfoPanel, DeployModeInfoPanel
 *  - FlightPlanBlueprintConstants.tsx   — constants and configurations
 *  - FlightPlanBlueprintHooks.ts        — custom hooks for state management
 *  - FlightPlanBlueprintHandlers.ts     — event handlers (hover, drag, resize, pan)
 *  - FlightPlanBlueprintGlow.ts         — glow effect computation
 */

import { useId, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Info,
  AlertTriangle,
  Shield } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTranslation } from 'react-i18next'

import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import type {
  MissionControlState,
  OverlayMode } from './types'
import { useClusters } from '../../hooks/mcp/clusters'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
// missionCache provides file-system caching; no lastUpdated timestamp needed — missions are loaded fresh on each open
import type { MissionExport } from '../../lib/missions/types'
import type { PayloadProject } from './types'

import { exportFullReport, shortenClusterName } from './BlueprintReport'
import {
  ProjectInfoPanel,
  ClusterInfoPanel,
  DeployModeInfoPanel,
  generateDefaultPhases,
} from './BlueprintInfoPanels'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
} from './FlightPlanBlueprintConstants'
import {
  useHealthyState,
  useLayout,
  useInfoPanel,
  useZoom,
  useAnimations,
  useHoverState,
  useDragDrop,
  usePan,
  useResize,
} from './FlightPlanBlueprintHooks'
import {
  createProjectHoverHandler,
  createClusterHoverHandler,
  createInfoPanelHandlers,
  createMissionPreviewHandler,
  usePanListeners,
  useResizeListeners,
  useCleanupTimeout,
  type InfoPanelData,
} from './FlightPlanBlueprintHandlers'
import { useGlowEdges, useGlowProjectKeys } from './FlightPlanBlueprintGlow'
import { renderDependencyLabels } from './FlightPlanBlueprintLabels'
import { FlightPlanToolbar, FlightPlanControls } from './FlightPlanBlueprintToolbar'
import { FlightPlanBlueprintMissionPreview } from './FlightPlanBlueprintMissionPreview'

interface FlightPlanBlueprintProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
  installedProjects?: Set<string>
}

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onMoveProject,
  installedProjects = new Set() }: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, error: clustersError } = useClusters()

  // State management via extracted hooks
  const healthyState = useHealthyState(state)
  const layout = useLayout(healthyState)
  const {
    infoPanelWidth,
    setInfoPanelWidth,
    infoPanelCollapsed,
    setInfoPanelCollapsed,
    isOverInfoPanelRef,
    hidePanelTimeoutRef,
  } = useInfoPanel()
  const { zoom, setZoom } = useZoom()
  const { animationsEnabled, setAnimationsEnabled, labelsVisible, setLabelsVisible } = useAnimations()
  const {
    hoveredEdge,
    setHoveredEdge,
    hoveredProjectKey,
    setHoveredProjectKey,
    hoveredProjectName,
    hoveredCluster,
  } = useHoverState()
  const { dragProject, setDragProject, dropTarget, setDropTarget } = useDragDrop()

  // Info panel state
  const [infoPanel, setInfoPanel] = useState<InfoPanelData | null>(null)
  const [stickyPanel, setStickyPanel] = useState<InfoPanelData | null>(
    () => ({ kind: 'deployMode' as const, mode: state.deployMode, phases: state.phases })
  )

  // Mission preview state
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Pan and resize refs and handlers
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const { handlePanStart, isPanningRef, panStartRef } = usePan(svgContainerRef, zoom)
  const { handleResizeStart: createHandleResizeStart, isResizingRef, startXRef, startWidthRef } = useResize()

  // Event handlers
  const handleProjectHover = createProjectHoverHandler(setInfoPanel, setStickyPanel, hidePanelTimeoutRef)
  const handleClusterHover = createClusterHoverHandler(setInfoPanel, setStickyPanel, hidePanelTimeoutRef, dragProject)
  const { handleInfoPanelEnter, handleInfoPanelLeave } = createInfoPanelHandlers(isOverInfoPanelRef, hidePanelTimeoutRef)
  const handleShowMissionPreview = createMissionPreviewHandler(setPreviewMission, setPreviewLoading)

  // Effect hooks
  usePanListeners(isPanningRef, panStartRef, svgContainerRef)
  useResizeListeners(isResizingRef, startXRef, startWidthRef, setInfoPanelWidth)
  useCleanupTimeout(hidePanelTimeoutRef)

  // Glow effects
  const glowEdges = useGlowEdges(hoveredEdge, hoveredProjectName, hoveredCluster, layout)
  const glowProjectKeys = useGlowProjectKeys(hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout)

  const projectMap = new Map(state.projects.map((p) => [p.name, p]))

  // The visible panel: active hover wins, otherwise fall back to sticky (last hovered)
  const visiblePanel = infoPanel ?? stickyPanel

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Toolbar */}
      <FlightPlanToolbar
        state={healthyState}
        onOverlayChange={onOverlayChange}
        onDeployModeChange={onDeployModeChange}
        onPhaseChange={(phases) => {
          const data: InfoPanelData = {
            kind: 'deployMode',
            mode: state.deployMode,
            phases: phases as MissionControlState['phases'],
          }
          setStickyPanel(data)
        }}
      />

      {/* Error banner when cluster data fails to load (issue 6772) */}
      {clustersError && (
        <div className="mx-6 mt-2 p-2 rounded-lg bg-red-500/20 border border-red-500/50 flex items-center gap-2 text-xs text-red-400">
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span>Cluster data unavailable: {clustersError}</span>
        </div>
      )}

      {/* Main content: SVG left + Info panel right */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* SVG Blueprint */}
        <div className="flex-1 min-h-0 p-4 overflow-hidden relative">
          {/* Zoom & sidebar controls */}
          <FlightPlanControls
            zoom={zoom}
            setZoom={setZoom}
            infoPanelCollapsed={infoPanelCollapsed}
            setInfoPanelCollapsed={setInfoPanelCollapsed}
            animationsEnabled={animationsEnabled}
            setAnimationsEnabled={setAnimationsEnabled}
            labelsVisible={labelsVisible}
            setLabelsVisible={setLabelsVisible}
            onExport={() => exportFullReport(state, healthyState, installedProjects, layout, svgContainerRef)}
          />

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
              {labelsVisible && renderDependencyLabels({
                layout,
                glowEdges,
                glowProjectKeys,
                overlayArchitecture: state.overlay === 'architecture',
                onHover: setHoveredEdge,
              })}

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

        {/* Right info panel */}
        <div
          className={cn(
            'relative border-l border-border bg-card flex flex-col overflow-y-auto shrink-0 transition-[width] duration-200',
            infoPanelCollapsed && 'w-0 border-l-0 overflow-hidden'
          )}
          style={infoPanelCollapsed ? { width: 0 } : { width: infoPanelWidth }}
          onMouseEnter={handleInfoPanelEnter}
          onMouseLeave={handleInfoPanelLeave}
        >
          {/* Resize drag handle */}
          <div
            className="absolute top-0 left-0 w-[3px] h-full cursor-col-resize z-10 hover:bg-primary/40 active:bg-primary/60 transition-colors"
            onMouseDown={(e) => createHandleResizeStart(e, infoPanelWidth)}
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

      <FlightPlanBlueprintMissionPreview
        previewMission={previewMission}
        previewLoading={previewLoading}
        previewRaw={previewRaw}
        setPreviewMission={setPreviewMission}
        setPreviewRaw={setPreviewRaw}
      />
    </div>
  )
}
