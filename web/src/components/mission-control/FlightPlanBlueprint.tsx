/**
 * FlightPlanBlueprint — Phase 3: Master SVG blueprint.
 *
 * SVG blueprint on left, info panel on right. Hover on any node or cluster
 * populates the right panel with details. Overlays toggle resource views.
 */

import { useId, useMemo, useState, useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rocket,
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
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'

import { BlueprintDefs } from './svg/BlueprintDefs'
import { ClusterZone } from './svg/ClusterZone'
import type { ClusterHoverInfo } from './svg/ClusterZone'
import { ProjectNode } from './svg/ProjectNode'
import type { ProjectHoverInfo } from './svg/ProjectNode'
import { DependencyPath, DependencyLabel, computeEdgeMidpoint } from './svg/DependencyPath'
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

/** Shorten cluster names like "default/api-fmaas-platform-eval-fmaas-res..." to a readable form */
function shortenClusterName(name: string): string {
  // Strip context prefix (e.g. "default/")
  const parts = name.split('/')
  const base = parts[parts.length - 1]
  // If still long, take first meaningful segment
  if (base.length > 24) {
    // Try splitting by common separators and taking key parts
    const segments = base.split(/[-_.]/)
    if (segments.length > 2) {
      // Take first 2-3 segments that are informative
      return segments.slice(0, 3).join('-')
    }
    return base.slice(0, 22) + '…'
  }
  return base
}

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
  installedProjects?: Set<string>
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
      // Composite key: "clusterName/projectName" — allows same project on multiple clusters
      projectPositions.set(`${name}/${pName}`, {
        projectName: pName,
        cx: rect.x + innerPadX + projSpaceX * (pCol + 0.5),
        cy: rect.y + innerPadTop + projSpaceY * (pRow + 0.5),
        clusterName: name,
      })
    })
  })

  // Labels for known integration patterns — keep focused on direct, primary integrations
  const INTEGRATION_LABELS: Record<string, Record<string, string>> = {
    'cert-manager': { istio: 'mTLS', linkerd: 'mTLS certs', 'external-secrets': 'TLS certs' },
    prometheus: { grafana: 'dashboards', thanos: 'long-term storage', alertmanager: 'alerts', falco: 'metrics', 'trivy-operator': 'scan metrics', trivy: 'scan metrics' },
    falco: { kyverno: 'defense layers', 'open-policy-agent': 'runtime + policy' },
    cilium: { 'open-policy-agent': 'network + admission', istio: 'eBPF dataplane' },
    istio: { jaeger: 'distributed traces', envoy: 'sidecar proxy' },
    grafana: { jaeger: 'trace UI', thanos: 'query', loki: 'log query' },
    fluentd: { 'fluent-bit': 'log forwarding' },
    'fluent-bit': { loki: 'log shipping' },
    harbor: { trivy: 'image scanning' },
    flux: { helm: 'chart releases' },
    argocd: { helm: 'chart sync' },
    'argo-cd': { helm: 'chart sync' },
    velero: { longhorn: 'volume backup', rook: 'snapshot backup' },
    keda: { nats: 'event scaler', strimzi: 'Kafka scaler' },
    dapr: { nats: 'pub/sub', strimzi: 'Kafka binding' },
    knative: { istio: 'ingress', contour: 'ingress alt' },
    spiffe: { spire: 'identity runtime' },
    etcd: { coredns: 'service discovery' },
    keycloak: { 'open-policy-agent': 'auth policy', 'cert-manager': 'HTTPS certs' },
    metallb: { contour: 'ingress LB' },
    'external-secrets': { 'external-secrets-operator': 'operator' },
    crossplane: { helm: 'provider-helm' },
  }

  // Reverse lookup: projectName → positions (supports multi-cluster)
  const projectPosByName = new Map<string, ProjectPosition[]>()
  for (const pos of projectPositions.values()) {
    const list = projectPosByName.get(pos.projectName) || []
    list.push(pos)
    projectPosByName.set(pos.projectName, list)
  }

  // Find best position pair for two projects (prefer same-cluster)
  function findEdgePair(a: string, b: string): { from: ProjectPosition; to: ProjectPosition; cross: boolean } | null {
    const posA = projectPosByName.get(a)
    const posB = projectPosByName.get(b)
    if (!posA?.length || !posB?.length) return null
    for (const fa of posA) for (const fb of posB) {
      if (fa.clusterName === fb.clusterName) return { from: fa, to: fb, cross: false }
    }
    return { from: posA[0], to: posB[0], cross: true }
  }

  const dependencyEdges: DependencyEdge[] = []
  const edgeSet = new Set<string>()

  // Explicit dependencies
  for (const project of state.projects) {
    for (const dep of project.dependencies) {
      const pair = findEdgePair(project.name, dep)
      if (pair) {
        const key = `${project.name}->${dep}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          const label = INTEGRATION_LABELS[dep]?.[project.name] ?? INTEGRATION_LABELS[project.name]?.[dep]
          dependencyEdges.push({
            from: project.name,
            to: dep,
            crossCluster: pair.cross,
            label: label,
          })
        }
      }
    }
  }

  // Implicit integration edges (not explicit deps, but known integrations)
  for (const [src, targets] of Object.entries(INTEGRATION_LABELS)) {
    if (!projectPosByName.has(src)) continue
    for (const [target, label] of Object.entries(targets)) {
      if (!projectPosByName.has(target)) continue
      const key1 = `${src}->${target}`
      const key2 = `${target}->${src}`
      if (!edgeSet.has(key1) && !edgeSet.has(key2)) {
        edgeSet.add(key1)
        const pair = findEdgePair(src, target)
        if (pair) {
          dependencyEdges.push({
            from: src,
            to: target,
            crossCluster: pair.cross,
            label,
          })
        }
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
// Full report export (opens print dialog → Save as PDF)
// ---------------------------------------------------------------------------

function exportFullReport(
  state: MissionControlState,
  healthyState: MissionControlState,
  installedProjects: Set<string>,
  _layout: BlueprintLayout | null,
  svgContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const effectivePhases = state.phases.length > 0 ? state.phases : generateDefaultPhases(state.projects)
  const rollbackPhases = [...effectivePhases].reverse()
  const toRemove = state.projects.filter(p => !installedProjects.has(p.name))
  const toKeep = state.projects.filter(p => installedProjects.has(p.name))

  // Serialize SVG
  let svgMarkup = ''
  const svgEl = svgContainerRef.current?.querySelector('svg')
  if (svgEl) {
    const clone = svgEl.cloneNode(true) as SVGElement
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', '#0f172a')
    clone.insertBefore(bg, clone.firstChild)
    svgMarkup = new XMLSerializer().serializeToString(clone)
  }

  // Cluster summary
  const clusterRows = healthyState.assignments
    .filter(a => a.projectNames.length > 0)
    .map(a => `<tr>
      <td>${shortenClusterName(a.clusterName)}</td>
      <td>${a.projectNames.length}</td>
      <td>${a.projectNames.map(n =>
        `<span class="${installedProjects.has(n) ? 'installed' : 'deploy'}">${n}</span>`
      ).join(' ')}</td>
    </tr>`).join('')

  // Phase breakdown
  const phaseRows = effectivePhases.map((phase) => {
    const projs = phase.projectNames.map(n => {
      const isInst = installedProjects.has(n)
      return `<span class="${isInst ? 'installed' : 'deploy'}">${n}${isInst ? ' ✓' : ''}</span>`
    }).join(' ')
    const est = phase.estimatedSeconds ? `${Math.ceil(phase.estimatedSeconds / 60)} min` : ''
    return `<tr><td>${phase.phase}. ${phase.name}</td><td>${est}</td><td>${projs}</td></tr>`
  }).join('')

  // Rollback steps
  const rollbackRows = rollbackPhases.map((phase, i) => {
    const removable = phase.projectNames.filter(n => !installedProjects.has(n))
    if (removable.length === 0) return ''
    return `<tr><td>Step ${i + 1}</td><td>Remove ${phase.name}</td><td>${removable.map(n => `<code>helm uninstall ${n}</code>`).join('<br/>')}</td></tr>`
  }).filter(Boolean).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Flight Plan: ${state.title || 'Mission Control'}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 32px; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 24px; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
  h2 { font-size: 18px; margin-top: 28px; color: #4338ca; }
  h3 { font-size: 14px; margin-top: 20px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .installed { display: inline-block; background: #d1fae5; color: #065f46; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  .deploy { display: inline-block; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  .protected { display: inline-block; background: #d1fae5; color: #065f46; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  .remove { display: inline-block; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin: 1px; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
  .meta { color: #64748b; font-size: 13px; }
  .svg-container { margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  .svg-container svg { width: 100%; height: auto; }
  .section { page-break-inside: avoid; }
  .description { background: #f8fafc; border-left: 3px solid #6366f1; padding: 12px 16px; margin: 12px 0; font-size: 13px; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
</style></head><body>

<h1>Flight Plan: ${state.title || 'Untitled Mission'}</h1>
<p class="meta">Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} · ${state.projects.length} projects · ${healthyState.assignments.filter(a => a.projectNames.length > 0).length} clusters</p>

<div class="section">
<h2>1. Define Mission</h2>
<div class="description">${state.description || 'No description provided'}</div>
<table>
  <thead><tr><th>Project</th><th>Category</th><th>Priority</th><th>Status</th><th>Why</th></tr></thead>
  <tbody>${state.projects.map(p => `<tr>
    <td><strong>${p.displayName}</strong></td>
    <td>${p.category}</td>
    <td>${p.priority}</td>
    <td><span class="${installedProjects.has(p.name) ? 'installed' : 'deploy'}">${installedProjects.has(p.name) ? 'Installed' : 'Needs Deploy'}</span></td>
    <td style="font-size:11px">${p.reason || ''}</td>
  </tr>`).join('')}</tbody>
</table>
</div>

<div class="section">
<h2>2. Chart Course — Cluster Assignments</h2>
<table>
  <thead><tr><th>Cluster</th><th>Projects</th><th>Assignments</th></tr></thead>
  <tbody>${clusterRows}</tbody>
</table>
</div>

<div class="section">
<h2>3. Flight Plan Blueprint</h2>
${svgMarkup ? `<div class="svg-container">${svgMarkup}</div>` : '<p class="meta">SVG blueprint not available</p>'}
</div>

<div class="section">
<h2>4. PHASED Rollout Plan</h2>
<table>
  <thead><tr><th>Phase</th><th>Estimate</th><th>Projects</th></tr></thead>
  <tbody>${phaseRows}</tbody>
</table>
</div>

<div class="section">
<h2>5. YOLO Mode</h2>
<p>Launch all ${state.projects.length} projects simultaneously — no dependency gating.</p>
<p>${state.projects.map(p =>
  `<span class="${installedProjects.has(p.name) ? 'installed' : 'deploy'}">${p.displayName}${installedProjects.has(p.name) ? ' ✓' : ''}</span>`
).join(' ')}</p>
</div>

<div class="section">
<h2>6. Rollback Plan</h2>
${toKeep.length > 0 ? `
<h3>Protected (will not be removed)</h3>
<p>${toKeep.map(p => `<span class="protected">${p.displayName} ✓</span>`).join(' ')}</p>
` : ''}
${toRemove.length > 0 ? `
<h3>Removal Order (reverse phases)</h3>
<table>
  <thead><tr><th>Step</th><th>Action</th><th>Commands</th></tr></thead>
  <tbody>${rollbackRows}</tbody>
</table>
` : '<p>All projects are already installed — nothing to roll back.</p>'}
</div>

<p class="meta" style="margin-top:32px; border-top:1px solid #e2e8f0; padding-top:12px;">
  KubeStellar Console · Mission Control Report · Use browser Print (Cmd+P / Ctrl+P) to save as PDF
</p>

<script>window.onload = () => window.print()</script>
</body></html>`

  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
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
  installedProjects = new Set(),
}: FlightPlanBlueprintProps) {
  const svgId = useId().replace(/:/g, '')
  const { clusters } = useClusters()

  // Filter out unhealthy clusters and redistribute orphaned projects to healthy ones
  const healthyState = useMemo(() => {
    let assignments = state.assignments
    const healthyNames = clusters?.length
      ? new Set(clusters.filter(c => c.healthy !== false).map(c => c.name))
      : null

    // Filter unhealthy clusters
    if (healthyNames) {
      const hasUnhealthy = assignments.some(a => a.projectNames.length > 0 && !healthyNames.has(a.clusterName))
      if (hasUnhealthy) {
        const orphanedProjects: string[] = []
        const healthyAssignments = assignments.filter(a => {
          if (healthyNames.has(a.clusterName)) return true
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
    }

    // Deduplicate: each project can only appear on one cluster in the blueprint.
    // Keep the first assignment (from AI auto-assign or user selection).
    const seen = new Set<string>()
    const dedupedAssignments = assignments.map(a => {
      const unique = a.projectNames.filter(p => {
        if (seen.has(p)) return false
        seen.add(p)
        return true
      })
      return unique.length === a.projectNames.length ? a : { ...a, projectNames: unique }
    })

    return { ...state, assignments: dedupedAssignments }
  }, [state, clusters])

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
  const INFO_PANEL_MIN = 280
  const INFO_PANEL_MAX = 600
  const INFO_PANEL_DEFAULT = 416 // 26rem
  const INFO_PANEL_LS_KEY = 'mission-control-info-panel-width'

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
  const ZOOM_MIN = 0.3
  const ZOOM_MAX = 3
  const ZOOM_STEP = 0.2

  // Animation toggle
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  // Line labels toggle
  const [labelsVisible, setLabelsVisible] = useState(true)

  // Hovered edge (from label hover) or hovered project — highlights connected lines and projects
  const [hoveredEdge, setHoveredEdge] = useState<{ from: string; to: string } | null>(null)
  const [hoveredProject, setHoveredProject] = useState<string | null>(null)

  // Compute which edges and projects should glow
  const glowEdges = useMemo(() => {
    const edges = new Set<string>()
    if (hoveredEdge) {
      edges.add(`${hoveredEdge.from}-${hoveredEdge.to}`)
    }
    if (hoveredProject && layout) {
      for (const edge of layout.dependencyEdges) {
        if (edge.from === hoveredProject || edge.to === hoveredProject) {
          edges.add(`${edge.from}-${edge.to}`)
        }
      }
    }
    return edges
  }, [hoveredEdge, hoveredProject, layout])

  const glowProjects = useMemo(() => {
    const projects = new Set<string>()
    if (hoveredEdge) {
      projects.add(hoveredEdge.from)
      projects.add(hoveredEdge.to)
    }
    if (hoveredProject && layout) {
      // Only glow if the project has connections — isolated projects shouldn't dim everything
      const hasEdges = layout.dependencyEdges.some(e => e.from === hoveredProject || e.to === hoveredProject)
      if (hasEdges) {
        projects.add(hoveredProject)
        for (const edge of layout.dependencyEdges) {
          if (edge.from === hoveredProject) projects.add(edge.to)
          if (edge.to === hoveredProject) projects.add(edge.from)
        }
      }
    }
    return projects
  }, [hoveredEdge, hoveredProject, layout])

  // Detect installed projects via helm releases


  // Pan/drag when zoomed in
  const svgContainerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const handlePanStart = useCallback((e: ReactMouseEvent) => {
    if (zoom <= 1) return
    const container = svgContainerRef.current
    if (!container) return
    isPanningRef.current = true
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [zoom])

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

  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = infoPanelWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [infoPanelWidth])

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
              PHASED
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
            className="w-full h-full overflow-auto"
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

              {/* Dependency paths — find positions by project name from composite-keyed map */}
              {layout.dependencyEdges.map((edge, i) => {
                let from: ProjectPosition | undefined
                let to: ProjectPosition | undefined
                const fromAll: ProjectPosition[] = []
                const toAll: ProjectPosition[] = []
                for (const pos of layout.projectPositions.values()) {
                  if (pos.projectName === edge.from) fromAll.push(pos)
                  if (pos.projectName === edge.to) toAll.push(pos)
                }
                // Prefer same-cluster pair
                for (const fp of fromAll) {
                  for (const tp of toAll) {
                    if (fp.clusterName === tp.clusterName) { from = fp; to = tp; break }
                  }
                  if (from) break
                }
                if (!from && fromAll.length) from = fromAll[0]
                if (!to && toAll.length) to = toAll[0]
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
                    glow={glowProjects.has(project.name)}
                    dimmed={glowProjects.size > 0 && !glowProjects.has(project.name)}
                    onHover={(info) => {
                      handleProjectHover(info)
                      setHoveredProject(info ? project.name : null)
                    }}
                    onDragStart={(n) => setDragProject({ name: n, fromCluster: pos.clusterName })}
                    onDragEnd={() => { setDragProject(null); setDropTarget(null) }}
                  />
                )
              })}

              {/* Dependency labels — top layer so they're never hidden behind lines */}
              {labelsVisible && (() => {
                const MIN_LABEL_GAP = 14
                const labelSlots: { midX: number; midY: number; offsetY: number }[] = []
                return layout.dependencyEdges.map((edge) => {
                  if (!edge.label) return null
                  const from = layout.projectPositions.get(edge.from)
                  const to = layout.projectPositions.get(edge.to)
                  if (!from || !to) return null
                  if (from.cx <= 0 || from.cy <= 0 || to.cx <= 0 || to.cy <= 0) return null

                  const { midX, midY } = computeEdgeMidpoint(from.cx, from.cy, to.cx, to.cy)
                  let offsetY = 0
                  for (const slot of labelSlots) {
                    const dxL = Math.abs(midX - slot.midX)
                    const dyL = Math.abs(midY + offsetY - (slot.midY + slot.offsetY))
                    if (dxL < 60 && dyL < MIN_LABEL_GAP) {
                      offsetY = (slot.midY + slot.offsetY) - midY + MIN_LABEL_GAP
                    }
                  }
                  labelSlots.push({ midX, midY, offsetY })
                  return (
                    <DependencyLabel
                      key={`label-${edge.from}-${edge.to}`}
                      midX={midX}
                      midY={midY + offsetY}
                      label={edge.label}
                      crossCluster={edge.crossCluster}
                      fromName={edge.from}
                      toName={edge.to}
                      anchorX={midX}
                      anchorY={midY}
                      onHover={setHoveredEdge}
                      highlight={glowEdges.has(`${edge.from}-${edge.to}`)}
                      dimmed={glowEdges.size > 0 && !glowEdges.has(`${edge.from}-${edge.to}`)}
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
                className="p-4 space-y-4"
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

function ProjectInfoPanel({ info, edges }: { info: ProjectHoverInfo; edges?: DependencyEdge[] }) {
  // Find connections for this project
  const connections = edges?.filter(e => e.from === info.name || e.to === info.name) ?? []
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

      {/* Connections (from dependency edges) */}
      {connections.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Connections</h4>
          <div className="space-y-1">
            {connections.map((edge, i) => {
              const other = edge.from === info.name ? edge.to : edge.from
              const direction = edge.from === info.name ? '→' : '←'
              return (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    edge.crossCluster ? 'bg-amber-500' : 'bg-indigo-500'
                  )} />
                  <span className="text-foreground/80">{direction} {other}</span>
                  {edge.label && (
                    <span className="text-muted-foreground">({edge.label})</span>
                  )}
                  {edge.crossCluster && (
                    <span className="text-[9px] text-amber-400/70">cross-cluster</span>
                  )}
                </div>
              )
            })}
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

function DeployModeInfoPanel({ mode, phases, projects, onShowProject, installedProjects = new Set() }: {
  mode: 'phased' | 'yolo'
  phases: DeployPhase[]
  projects: PayloadProject[]
  onShowProject?: (project: PayloadProject) => void
  installedProjects?: Set<string>
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
                          {installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                              installed
                            </span>
                          )}
                          {!installedProjects.has(proj.name) && (
                            <span className="text-[9px] ml-1 px-1 py-0.5 rounded bg-slate-500/10 text-slate-400">
                              deploy
                            </span>
                          )}
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
                <span key={proj.name} className={cn(
                  'text-[10px] px-2 py-1 rounded-md border',
                  installedProjects.has(proj.name)
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    : 'bg-violet-500/10 text-violet-300 border-violet-500/20'
                )}>
                  {proj.displayName}
                  {installedProjects.has(proj.name) && <span className="ml-1 opacity-60">✓</span>}
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

      {/* Rollback Plan */}
      {projects.length > 0 && (() => {
        const toRemove = projects.filter(p => !installedProjects.has(p.name))
        const toKeep = projects.filter(p => installedProjects.has(p.name))
        const effectivePhases2 = phases.length > 0 ? phases : generateDefaultPhases(projects)
        const rollbackPhases = [...effectivePhases2].reverse()
        return (
          <div className="pt-2 border-t border-border">
            <h4 className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
              Rollback Plan
            </h4>
            <p className="text-[10px] text-muted-foreground mb-2">
              Reverse deployment in safe order. Already-installed items are preserved.
            </p>

            {toKeep.length > 0 && (
              <div className="mb-2">
                <p className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                  Protected (will not be removed)
                </p>
                <div className="flex flex-wrap gap-1">
                  {toKeep.map(p => (
                    <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {p.displayName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {toRemove.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider mb-1">
                  {mode === 'phased' ? 'Removal Order (reverse phases)' : 'Will Be Removed'}
                </p>
                {mode === 'phased' ? (
                  <div className="space-y-1.5">
                    {rollbackPhases.map((phase, i) => {
                      const removable = phase.projectNames.filter(n => !installedProjects.has(n))
                      if (removable.length === 0) return null
                      return (
                        <div key={phase.phase} className="rounded border border-amber-500/20 bg-amber-500/5 p-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-bold text-amber-400">Step {i + 1}</span>
                            <span className="text-[10px] text-muted-foreground">Remove {phase.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {removable.map(n => (
                              <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                helm uninstall {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {toRemove.map(p => (
                      <span key={p.name} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        helm uninstall {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {toRemove.length === 0 && (
              <p className="text-[10px] text-emerald-400 italic">
                All projects are already installed — nothing to roll back.
              </p>
            )}
          </div>
        )
      })()}
    </>
  )
}
