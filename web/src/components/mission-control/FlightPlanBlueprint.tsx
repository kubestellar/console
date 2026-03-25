/**
 * FlightPlanBlueprint — Phase 3: Master SVG blueprint.
 *
 * SVG blueprint on left, info panel on right. Hover on any node or cluster
 * populates the right panel with details. Overlays toggle resource views.
 */

import { useId, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rocket,
  Zap,
  Network,
  Shield,
  Layout,
  HardDrive,
  Info,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath } from './svg/DependencyPath'
import { PhaseTimeline } from './svg/PhaseTimeline'
import type {
  MissionControlState,
  OverlayMode,
  BlueprintLayout,
  LayoutRect,
  ProjectPosition,
  DependencyEdge,
} from './types'
import { useClusters } from '../../hooks/mcp/clusters'
import { detectCloudProvider } from '../ui/CloudProviderIcon'
import { fetchMissionContent } from '../missions/browser/missionCache'
import type { MissionExport } from '../../lib/missions/types'
import { MissionDetailView } from '../missions/MissionDetailView'
import { PayloadProject as PP } from './types'

/** Resolve kbPath for a project — tries explicit kbPath, then convention-based lookup */
function resolveKbPath(proj: PP): string | undefined {
  if (proj.kbPath) return proj.kbPath
  // Convention: solutions/cncf-install/install-{name}.json
  const slug = proj.name.toLowerCase().replace(/\s+/g, '-')
  return `solutions/cncf-install/install-${slug}.json`
}

interface FlightPlanBlueprintProps {
  state: MissionControlState
  onOverlayChange: (overlay: OverlayMode) => void
  onDeployModeChange: (mode: 'phased' | 'yolo') => void
  onLaunch: () => void
  onMoveProject?: (projectName: string, fromCluster: string, toCluster: string) => void
}

// ---------------------------------------------------------------------------
// Layout computation (deterministic grid)
// ---------------------------------------------------------------------------

function computeLayout(state: MissionControlState): BlueprintLayout {
  // Determine how many projects the densest cluster has — scale viewbox accordingly
  const clusterProjects = new Map<string, string[]>()
  for (const assignment of state.assignments) {
    if (assignment.projectNames.length > 0) {
      clusterProjects.set(assignment.clusterName, assignment.projectNames)
    }
  }

  const clusterNames = Array.from(clusterProjects.keys())
  const clusterCount = clusterNames.length || 1
  const maxProjectsInCluster = Math.max(1, ...Array.from(clusterProjects.values()).map((p) => p.length))

  // Scale viewbox based on project density — more projects need more vertical space
  const projRows = Math.ceil(maxProjectsInCluster / 3)
  const VB_W = 560
  const VB_H = Math.max(360, 160 + projRows * 80)
  const PADDING = 18
  const TIMELINE_H = 30
  const usableH = VB_H - PADDING * 2 - TIMELINE_H - 10

  const cols = clusterCount <= 3 ? clusterCount : 2
  const rows = Math.ceil(clusterCount / cols)
  const cellW = (VB_W - PADDING * 2 - (cols - 1) * 12) / cols
  const cellH = (usableH - (rows - 1) * 12) / rows

  const clusterRects = new Map<string, LayoutRect>()
  const projectPositions = new Map<string, ProjectPosition>()

  clusterNames.forEach((name, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const rect: LayoutRect = {
      x: PADDING + col * (cellW + 12),
      y: PADDING + row * (cellH + 12),
      width: cellW,
      height: cellH,
    }
    clusterRects.set(name, rect)

    const projects = clusterProjects.get(name) ?? []
    const pCols = projects.length <= 2 ? projects.length : Math.min(3, projects.length)
    const pRows = Math.ceil(projects.length / pCols)
    const innerPadX = 20
    const innerPadTop = 32
    const innerPadBot = 22
    const innerW = rect.width - innerPadX * 2
    const innerH = rect.height - innerPadTop - innerPadBot
    const projSpaceX = innerW / pCols
    const projSpaceY = Math.max(innerH / pRows, 50) // minimum 50 units between rows

    projects.forEach((pName, j) => {
      const pCol = j % pCols
      const pRow = Math.floor(j / pCols)
      projectPositions.set(pName, {
        projectName: pName,
        cx: rect.x + innerPadX + projSpaceX * (pCol + 0.5),
        cy: rect.y + innerPadTop + projSpaceY * (pRow + 0.5),
        clusterName: name,
      })
    })
  })

  // Labels for known integration patterns
  const INTEGRATION_LABELS: Record<string, Record<string, string>> = {
    'cert-manager': { 'external-secrets': 'TLS certs', 'external-secrets-operator': 'TLS certs', keycloak: 'HTTPS certs', istio: 'mTLS' },
    prometheus: { falco: 'metrics', cilium: 'Hubble metrics', 'trivy-operator': 'scan metrics', trivy: 'scan metrics', grype: 'scan metrics', kyverno: 'policy metrics', keycloak: 'JMX metrics' },
    falco: { kyverno: 'defense layers', 'open-policy-agent': 'runtime + policy' },
    cilium: { kyverno: 'L3-L7 + admission', 'open-policy-agent': 'network + admission' },
  }

  const dependencyEdges: DependencyEdge[] = []
  const edgeSet = new Set<string>()

  // Explicit dependencies
  for (const project of state.projects) {
    for (const dep of project.dependencies) {
      if (projectPositions.has(dep) && projectPositions.has(project.name)) {
        const fromPos = projectPositions.get(project.name)!
        const toPos = projectPositions.get(dep)!
        const key = `${project.name}->${dep}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          const label = INTEGRATION_LABELS[dep]?.[project.name] ?? INTEGRATION_LABELS[project.name]?.[dep]
          dependencyEdges.push({
            from: project.name,
            to: dep,
            crossCluster: fromPos.clusterName !== toPos.clusterName,
            label: label ?? 'depends on',
          })
        }
      }
    }
  }

  // Implicit integration edges (not explicit deps, but known integrations)
  for (const [src, targets] of Object.entries(INTEGRATION_LABELS)) {
    if (!projectPositions.has(src)) continue
    for (const [target, label] of Object.entries(targets)) {
      if (!projectPositions.has(target)) continue
      const key1 = `${src}->${target}`
      const key2 = `${target}->${src}`
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1)
        const fromPos = projectPositions.get(src)!
        const toPos = projectPositions.get(target)!
        dependencyEdges.push({
          from: src,
          to: target,
          crossCluster: fromPos.clusterName !== toPos.clusterName,
          label,
        })
      }
    }
  }

  return {
    clusterRects,
    projectPositions,
    dependencyEdges,
    viewBox: { width: VB_W, height: VB_H },
  }
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
// Gauge bar for info panel
// ---------------------------------------------------------------------------

function GaugeRow({ label, value, max, unit }: {
  label: string; value?: number; max?: number; unit?: string
}) {
  const pctVal = (value != null && max != null && max > 0)
    ? Math.round((value / max) * 100)
    : undefined
  const display = value != null
    ? max != null ? `${Math.round(value)} / ${max}${unit ?? ''}` : `${Math.round(value)}${unit ?? ''}`
    : max != null ? `— / ${max}${unit ?? ''}` : 'N/A'
  const barColor = pctVal != null
    ? pctVal >= 80 ? '#ef4444' : pctVal >= 50 ? '#f59e0b' : '#22c55e'
    : '#334155'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400 font-medium">{label}</span>
        <span className="text-slate-300 tabular-nums">{display}{pctVal != null ? ` (${pctVal}%)` : ''}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        {pctVal != null && (
          <div className="h-full rounded-full transition-all" style={{ width: `${pctVal}%`, backgroundColor: barColor }} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-slate-400',
  running: 'text-amber-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'READY TO DEPLOY',
  running: 'DEPLOYING',
  completed: 'INSTALLED',
  failed: 'FAILED',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FlightPlanBlueprint({
  state,
  onOverlayChange,
  onDeployModeChange,
  onLaunch,
  onMoveProject,
}: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { clusters } = useClusters()
  const layout = useMemo(() => computeLayout(state), [state])
  const [infoPanel, setInfoPanel] = useState<InfoPanelData | null>(null)
  const [stickyPanel, setStickyPanel] = useState<InfoPanelData | null>(null)
  const [dragProject, setDragProject] = useState<{ name: string; fromCluster: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [previewMission, setPreviewMission] = useState<MissionExport | null>(null)
  const [previewRaw, setPreviewRaw] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const projectMap = useMemo(() => {
    return new Map(state.projects.map((p) => [p.name, p]))
  }, [state.projects])

  const handleProjectHover = useCallback((info: ProjectHoverInfo | null) => {
    if (info) {
      const data: InfoPanelData = { kind: 'project', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }, [])

  const handleClusterHover = useCallback((info: ClusterHoverInfo | null) => {
    if (dragProject) return
    if (info) {
      const data: InfoPanelData = { kind: 'cluster', info }
      setInfoPanel(data)
      setStickyPanel(data)
    } else {
      setInfoPanel(null)
    }
  }, [dragProject])

  /** Open mission preview modal for a project (fetches from KB) */
  const handleShowMissionPreview = useCallback((proj: PayloadProject) => {
    const kbPath = resolveKbPath(proj)
    const baseMission: MissionExport = {
      version: 'kc-mission-v1',
      title: `Install ${proj.displayName}`,
      description: proj.reason ?? '',
      type: 'deploy',
      tags: [proj.category],
      steps: [],
      metadata: { source: kbPath ?? 'mission-control' },
    }
    if (!kbPath) {
      setPreviewMission(baseMission)
      return
    }
    setPreviewLoading(true)
    fetchMissionContent(baseMission)
      .then(({ mission: m }) => setPreviewMission(m))
      .catch(() => setPreviewMission(baseMission))
      .finally(() => setPreviewLoading(false))
  }, [])

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
            {state.assignments.filter((a) => a.projectNames.length > 0).length} clusters
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
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => onDeployModeChange('phased')}
              onMouseEnter={() => {
                const data: InfoPanelData = { kind: 'deployMode', mode: 'phased', phases: state.phases }
                setInfoPanel(data)
                setStickyPanel(data)
              }}
              onMouseLeave={() => setInfoPanel(null)}
              className={cn(
                'px-3 py-1.5 text-xs transition-colors',
                state.deployMode === 'phased'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Phased
            </button>
            <button
              onClick={() => onDeployModeChange('yolo')}
              onMouseEnter={() => {
                const data: InfoPanelData = { kind: 'deployMode', mode: 'yolo', phases: state.phases }
                setInfoPanel(data)
                setStickyPanel(data)
              }}
              onMouseLeave={() => setInfoPanel(null)}
              className={cn(
                'px-3 py-1.5 text-xs transition-colors',
                state.deployMode === 'yolo'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              YOLO
            </button>
          </div>

          {/* Launch button */}
          <Button
            variant="primary"
            size="sm"
            onClick={onLaunch}
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-violet-500/25"
            icon={<Rocket className="w-4 h-4" />}
          >
            Launch Mission
          </Button>
        </div>
      </div>

      {/* Main content: SVG left + Info panel right */}
      <div className="flex-1 flex overflow-hidden">
        {/* SVG Blueprint */}
        <div className="flex-1 p-4 overflow-hidden relative">
          <motion.div
            className="w-full h-full flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <svg
              viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
              className="w-full h-full max-h-full"
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
                    name={name}
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

              {/* Dependency paths */}
              {layout.dependencyEdges.map((edge, i) => {
                const from = layout.projectPositions.get(edge.from)
                const to = layout.projectPositions.get(edge.to)
                // Skip edges where either endpoint is outside the viewbox (stray lines)
                if (!from || !to) return null
                if (from.cx <= 0 || from.cy <= 0 || to.cx <= 0 || to.cy <= 0) return null
                return (
                  <DependencyPath
                    key={`${edge.from}-${edge.to}`}
                    id={svgId}
                    fromX={from.cx}
                    fromY={from.cy}
                    toX={to.cx}
                    toY={to.cy}
                    crossCluster={edge.crossCluster}
                    index={i}
                    label={edge.label}
                  />
                )
              })}

              {/* Project nodes */}
              {Array.from(layout.projectPositions.entries()).map(([name, pos], i) => {
                const project = projectMap.get(name)
                if (!project) return null
                const launchProject = state.launchProgress
                  .flatMap((p) => p.projects)
                  .find((p) => p.name === name)
                return (
                  <ProjectNode
                    key={name}
                    id={svgId}
                    name={project.name}
                    displayName={project.displayName}
                    category={project.category}
                    cx={pos.cx}
                    cy={pos.cy}
                    index={i}
                    status={launchProject?.status}
                    isRequired={project.priority === 'required'}
                    reason={project.reason}
                    dependencies={project.dependencies}
                    kbPath={project.kbPath}
                    maturity={project.maturity}
                    priority={project.priority}
                    overlay={state.overlay}
                    onHover={handleProjectHover}
                    onDragStart={(n) => setDragProject({ name: n, fromCluster: pos.clusterName })}
                    onDragEnd={() => { setDragProject(null); setDropTarget(null) }}
                  />
                )
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
        <div className="w-[26rem] border-l border-border bg-card flex flex-col overflow-y-auto shrink-0">
          <AnimatePresence mode="wait">
            {visiblePanel ? (
              <motion.div
                key={visiblePanel.kind === 'deployMode' ? `dm-${visiblePanel.mode}` : `${visiblePanel.kind}-${visiblePanel.info.name}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.12 }}
                className="p-4 space-y-4"
              >
                {visiblePanel.kind === 'project' ? (
                  <ProjectInfoPanel info={visiblePanel.info} />
                ) : visiblePanel.kind === 'cluster' ? (
                  <ClusterInfoPanel info={visiblePanel.info} />
                ) : (
                  <DeployModeInfoPanel
                    mode={visiblePanel.mode}
                    phases={state.phases}
                    projects={state.projects}
                    onShowProject={(proj) => handleShowMissionPreview(proj)}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
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

// ---------------------------------------------------------------------------
// Project info panel
// ---------------------------------------------------------------------------

function ProjectInfoPanel({ info }: { info: ProjectHoverInfo }) {
  const [mission, setMission] = useState<MissionExport | null>(null)
  const [loadingSteps, setLoadingSteps] = useState(false)
  const fetchedRef = useRef<string>('')

  // Fetch mission steps when kbPath is available
  useEffect(() => {
    if (!info.kbPath || fetchedRef.current === info.kbPath) return
    fetchedRef.current = info.kbPath
    setLoadingSteps(true)
    const indexMission: MissionExport = {
      version: 'kc-mission-v1',
      title: info.displayName,
      description: info.reason ?? '',
      type: 'custom',
      tags: [],
      steps: [],
      metadata: { source: info.kbPath },
    }
    fetchMissionContent(indexMission)
      .then(({ mission: m }) => setMission(m))
      .catch(() => {/* ignore */})
      .finally(() => setLoadingSteps(false))
  }, [info.kbPath, info.displayName, info.reason])

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{info.displayName}</h3>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {info.category}
          </span>
          {info.maturity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
              {info.maturity}
            </span>
          )}
          {info.priority && (
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
              info.priority === 'required' ? 'bg-red-500/10 text-red-400' :
              info.priority === 'recommended' ? 'bg-blue-500/10 text-blue-400' :
              'bg-gray-500/10 text-gray-400'
            )}>
              {info.priority}
            </span>
          )}
        </div>
      </div>

      {info.reason && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Why</h4>
          <p className="text-sm text-foreground/80 leading-relaxed">{info.reason}</p>
        </div>
      )}

      {info.dependencies.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Dependencies</h4>
          <div className="flex flex-wrap gap-1">
            {info.dependencies.map((dep) => (
              <span key={dep} className="text-xs px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Install steps from KB mission */}
      {info.kbPath && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Install Steps</h4>
          {loadingSteps ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading mission...
            </div>
          ) : mission?.steps && mission.steps.length > 0 ? (
            <div className="space-y-2">
              {mission.steps.map((step, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] font-bold text-primary mt-0.5 shrink-0">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{step.title || step.description?.slice(0, 60)}</p>
                    {step.command && (
                      <pre className="text-[10px] text-emerald-400 font-mono mt-0.5 bg-slate-800 rounded px-1.5 py-0.5 overflow-x-auto whitespace-pre-wrap break-all">
                        {step.command}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-400 font-mono">
              {info.kbPath.split('/').pop()?.replace('.json', '')}
            </p>
          )}
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <div className={cn('text-sm font-semibold', STATUS_COLORS[info.status] ?? 'text-slate-400')}>
          {STATUS_LABELS[info.status] ?? info.status.toUpperCase()}
          {info.isRequired && <span className="text-muted-foreground font-normal ml-1">(required)</span>}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Cluster info panel
// ---------------------------------------------------------------------------

/** Format large numbers nicely: 13590.945 → "13,591" */
function fmtNum(v: number | undefined): string {
  if (v == null) return '—'
  return Math.round(v).toLocaleString()
}

function ClusterInfoPanel({ info }: { info: ClusterHoverInfo }) {
  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">{info.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {info.provider.toUpperCase()}
          {info.nodeCount != null ? ` · ${info.nodeCount} nodes` : ''}
          {info.podCount != null ? ` · ${info.podCount} pods` : ''}
        </p>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resources</h4>
        <div className="space-y-3">
          <GaugeRow label="CPU" value={info.cpuUsage} max={info.cpuCores} unit=" cores" />
          <GaugeRow label="Memory" value={info.memUsage} max={info.memGB != null ? Math.round(info.memGB) : undefined} unit=" GB" />
          <GaugeRow label="Storage" value={undefined} max={info.storageGB != null ? Math.round(info.storageGB) : undefined} unit=" GB" />
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Capacity</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">CPU</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.cpuCores)} cores</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Memory</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.memGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Storage</span>
            <span className="text-foreground tabular-nums">{fmtNum(info.storageGB)} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">PVC</span>
            <span className="text-foreground tabular-nums">{info.pvcBoundCount ?? '?'}/{info.pvcCount ?? '?'}</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Accelerators</h4>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.gpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">GPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">{info.tpuCount ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">TPU</div>
          </div>
          <div className="text-center rounded-lg bg-slate-800/50 py-2">
            <div className="text-base font-bold text-foreground">—</div>
            <div className="text-[10px] text-muted-foreground">XPU</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Deploy mode info panel
// ---------------------------------------------------------------------------

import { Eye } from 'lucide-react'
import type { DeployPhase, PayloadProject } from './types'

/** Map of known dependency integration notes */
const DEPENDENCY_NOTES: Record<string, Record<string, string>> = {
  'cert-manager': {
    istio: 'cert-manager provides TLS certificates that Istio uses for mTLS between services',
    'external-secrets': 'cert-manager can issue certs stored/synced via External Secrets Operator',
    keycloak: 'cert-manager provides TLS certificates for Keycloak HTTPS endpoints',
  },
  helm: {
    '*': 'Helm must be available on the cluster before any Helm-based installations',
  },
  prometheus: {
    falco: 'Falco exports metrics to Prometheus for runtime security alerting',
    cilium: 'Cilium Hubble metrics are scraped by Prometheus for network observability',
    'trivy-operator': 'Trivy vulnerability scan results are exported as Prometheus metrics',
    kyverno: 'Kyverno policy violation metrics feed into Prometheus dashboards',
    keycloak: 'Keycloak exposes JMX/metrics endpoints for Prometheus scraping',
  },
  falco: {
    kyverno: 'Falco detects runtime threats; Kyverno enforces admission policies — complementary defense layers',
    'open-policy-agent': 'Falco handles runtime detection while OPA handles admission-time policy enforcement',
  },
  cilium: {
    'open-policy-agent': 'Cilium network policies can complement OPA admission policies for defense in depth',
    kyverno: 'Cilium handles L3/L4/L7 network policy; Kyverno handles Kubernetes admission policy',
  },
}

function getDependencyNotes(projects: PayloadProject[]): string[] {
  const notes: string[] = []
  const nameSet = new Set(projects.map((p) => p.name))
  for (const project of projects) {
    for (const dep of project.dependencies) {
      const depNotes = DEPENDENCY_NOTES[dep]
      if (!depNotes) continue
      const specific = depNotes[project.name]
      if (specific && nameSet.has(dep)) {
        notes.push(specific)
      }
      const wildcard = depNotes['*']
      if (wildcard && !notes.includes(wildcard)) {
        notes.push(wildcard)
      }
    }
  }
  // Also check reverse: if project A is in DEPENDENCY_NOTES and project B is in the payload
  for (const [src, targets] of Object.entries(DEPENDENCY_NOTES)) {
    if (!nameSet.has(src)) continue
    for (const [target, note] of Object.entries(targets)) {
      if (target === '*') continue
      if (nameSet.has(target) && !notes.includes(note)) {
        notes.push(note)
      }
    }
  }
  return notes
}

/** Auto-generate phases from project dependencies when AI doesn't provide them */
function generateDefaultPhases(projects: PayloadProject[]): DeployPhase[] {
  const nameSet = new Set(projects.map((p) => p.name))
  const placed = new Set<string>()

  // Phase 1: Infrastructure (projects that are dependencies of others, or "helm", "cert-manager")
  const infraNames = new Set(['helm', 'cert-manager', 'external-secrets', 'external-secrets-operator'])
  const phase1: string[] = []
  const phase2: string[] = []
  const phase3: string[] = []

  // Find projects that are deps of other projects
  for (const p of projects) {
    for (const dep of p.dependencies) {
      if (nameSet.has(dep)) infraNames.add(dep)
    }
  }

  for (const p of projects) {
    if (infraNames.has(p.name)) {
      phase1.push(p.name)
      placed.add(p.name)
    }
  }

  // Phase 2: Core security/networking (required projects not in phase 1)
  for (const p of projects) {
    if (placed.has(p.name)) continue
    if (p.priority === 'required') {
      phase2.push(p.name)
      placed.add(p.name)
    }
  }

  // Phase 3: Everything else
  for (const p of projects) {
    if (placed.has(p.name)) continue
    phase3.push(p.name)
    placed.add(p.name)
  }

  const result: DeployPhase[] = []
  // Padded estimates: account for image pulls, CRD registration, RBAC setup, retries
  if (phase1.length > 0) result.push({ phase: 1, name: 'Core Infrastructure', projectNames: phase1, estimatedSeconds: phase1.length * 180 + 120 })
  if (phase2.length > 0) result.push({ phase: result.length + 1, name: 'Security & Networking', projectNames: phase2, estimatedSeconds: phase2.length * 210 + 120 })
  if (phase3.length > 0) result.push({ phase: result.length + 1, name: 'Monitoring & Services', projectNames: phase3, estimatedSeconds: phase3.length * 150 + 60 })
  return result
}

function DeployModeInfoPanel({ mode, phases, projects, onShowProject }: {
  mode: 'phased' | 'yolo'
  phases: DeployPhase[]
  projects: PayloadProject[]
  onShowProject?: (project: PayloadProject) => void
}) {
  const depNotes = useMemo(() => getDependencyNotes(projects), [projects])
  // Use AI-provided phases, or auto-generate from dependencies
  const effectivePhases = useMemo(() => phases.length > 0 ? phases : generateDefaultPhases(projects), [phases, projects])
  const totalEstSec = effectivePhases.reduce((sum, p) => sum + (p.estimatedSeconds ?? 180), 0)
  const aiMinLow = Math.ceil(totalEstSec / 60)
  const aiMinHigh = Math.ceil(totalEstSec * 1.5 / 60)
  // Human estimate: ~20-40 min per project (reading docs, writing YAML, debugging RBAC, etc.)
  const humanHrsLow = Math.max(1, Math.floor(projects.length * 20 / 60))
  const humanHrsHigh = Math.ceil(projects.length * 40 / 60)

  return (
    <>
      <div>
        <h3 className="text-base font-bold text-foreground">
          {mode === 'phased' ? 'Phased Rollout' : 'YOLO Mode'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {mode === 'phased'
            ? 'Deploy projects in sequential phases. Each phase completes before the next begins. Prerequisites and dependencies are respected — infrastructure first, then services, then monitoring.'
            : 'Launch all projects simultaneously across all clusters. No waiting for dependencies. Maximum speed, maximum risk. Best for dev/test environments or when you\'re feeling lucky.'}
        </p>
      </div>

      {/* AI vs Human time comparison */}
      {projects.length > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Time Estimate</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">🤖</span>
                <span className="text-xs font-medium text-foreground">AI-Assisted</span>
              </div>
              <span className="text-sm font-bold text-primary">{aiMinLow}–{aiMinHigh} min</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">👤</span>
                <span className="text-xs font-medium text-foreground">Manual (Human)</span>
              </div>
              <span className="text-sm font-bold text-muted-foreground">{humanHrsLow}–{humanHrsHigh} hrs</span>
            </div>
            <div className="h-px bg-border" />
            <p className="text-[10px] text-muted-foreground italic">
              {Math.round(humanHrsLow * 60 / aiMinHigh)}x faster — includes reading docs, writing YAML, debugging RBAC, troubleshooting image pulls, and configuring integrations
            </p>
          </div>
        </div>
      )}

      {mode === 'phased' && effectivePhases.length > 0 && (
        <p className="text-xs text-primary">
          {effectivePhases.length} phases · {aiMinLow}–{aiMinHigh} min estimated
        </p>
      )}

      {/* Phase breakdown — different layout for phased vs YOLO */}
      {mode === 'phased' && effectivePhases.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Launch Sequence
          </h4>
          <div className="space-y-3">
            {effectivePhases.map((phase, phaseIdx) => {
              const phaseProjects = phase.projectNames
                .map((n) => projects.find((p) => p.name === n))
                .filter(Boolean) as PayloadProject[]
              return (
                <div key={phase.phase} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-white bg-primary rounded-full w-6 h-6 flex items-center justify-center shadow-sm">
                      {phase.phase}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{phase.name}</span>
                    {phase.estimatedSeconds && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {Math.ceil(phase.estimatedSeconds / 60)}–{Math.ceil(phase.estimatedSeconds * 1.5 / 60)} min
                      </span>
                    )}
                  </div>
                  <ul className="space-y-2 ml-1">
                    {phaseProjects.map((proj) => (
                      <li key={proj.name} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-primary mt-0.5 shrink-0">{phaseIdx + 1}.{phaseProjects.indexOf(proj) + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-foreground">{proj.displayName}</span>
                            {onShowProject && (
                              <button
                                onClick={() => onShowProject(proj)}
                                className="p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                title="View install mission"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <span className={cn(
                            'text-[9px] ml-1.5 px-1 py-0.5 rounded',
                            proj.priority === 'required' ? 'bg-red-500/10 text-red-400' :
                            proj.priority === 'recommended' ? 'bg-blue-500/10 text-blue-400' :
                            'bg-gray-500/10 text-gray-400'
                          )}>
                            {proj.priority}
                          </span>
                          {proj.reason && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{proj.reason}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {phaseIdx < effectivePhases.length - 1 && (
                    <div className="flex items-center justify-center mt-2 text-muted-foreground">
                      <span className="text-[10px]">↓ wait for completion ↓</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {mode === 'yolo' && projects.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            All Launched Simultaneously
          </h4>
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex flex-wrap gap-1.5">
              {projects.map((proj) => (
                <span key={proj.name} className="text-[10px] px-2 py-1 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  {proj.displayName}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-violet-400/60 mt-2 italic">
              No ordering — all {projects.length} projects deploy at once
            </p>
          </div>
        </div>
      )}

      {/* Dependency integration notes */}
      {depNotes.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Integration & Dependency Notes
          </h4>
          <ul className="space-y-1.5">
            {depNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="text-primary mt-0.5 shrink-0">→</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          {mode === 'phased' ? 'Safety Features' : 'Considerations'}
        </h4>
        <div className="text-xs text-muted-foreground">
          {mode === 'phased' ? (
            <ul className="space-y-1 list-disc list-inside">
              <li>Safe for production environments</li>
              <li>Automatic pause on failure</li>
              <li>Retry/skip individual projects</li>
              <li>Dependencies validated per phase</li>
              <li>Rollback plan generated for each phase</li>
            </ul>
          ) : (
            <ul className="space-y-1 list-disc list-inside">
              <li>All missions launched in parallel</li>
              <li>No dependency gating — order not guaranteed</li>
              <li>Fastest possible deployment</li>
              <li>Failures don't block other projects</li>
              <li>May need manual intervention if deps fail</li>
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
