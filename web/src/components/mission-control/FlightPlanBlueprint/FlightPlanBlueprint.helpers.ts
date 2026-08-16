import { computeEdgeMidpoint } from '../svg/DependencyPath'
import { fetchMissionContent } from '../../../lib/missions/missionCache'
import type { MissionExport } from '../../../lib/missions/types'
import type { PayloadProject, MissionControlState } from '../types'
import type { ClusterHoverInfo } from '../svg/ClusterZone'
import type { ProjectHoverInfo } from '../svg/ProjectNode'
import type { Cluster } from '../../../hooks/mcp/clusters'
import type { FlightPlanBlueprintProps, InfoPanelData } from '../FlightPlanBlueprint.types'
import {
  INFO_PANEL_DEFAULT,
  INFO_PANEL_MAX,
  INFO_PANEL_MIN,
  INFO_PANEL_LS_KEY,
  LABEL_OFFSET_Y,
  MIN_LABEL_GAP,
  NODE_RADIUS,
} from '../FlightPlanBlueprint.constants'
import { resolveKbPath } from '../FlightPlanBlueprint.utils'

export interface DragProjectState {
  name: string
  fromCluster: string
}

export interface HoveredEdge {
  from: string
  to: string
}

type HealthyState = MissionControlState
type LayoutResult = ReturnType<typeof import('../BlueprintLayout').computeLayout>
type ClusterSummary = Pick<Cluster, 'name' | 'healthy' | 'reachable'>

export function buildHealthyState(
  state: MissionControlState,
  clusters: ClusterSummary[] | undefined,
): HealthyState {
  const targetSet = new Set(state.targetClusters || [])
  let assignments = targetSet.size === 0
    ? state.assignments
    : state.assignments.filter(a => targetSet.has(a.clusterName))
  const unhealthyNames = clusters?.length
    ? new Set(clusters.filter(c => c.healthy === false || c.reachable === false).map(c => c.name))
    : new Set<string>()

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

  return { ...state, assignments }
}

export function createInitialStickyPanel(state: FlightPlanBlueprintProps['state']): InfoPanelData {
  return { kind: 'deployMode', mode: state.deployMode, phases: state.phases }
}

export function getStoredInfoPanelWidth(): number {
  try {
    const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) return parsed
    }
  } catch { /* ignore */ }

  return INFO_PANEL_DEFAULT
}

export function persistInfoPanelWidth(width: number): number {
  try {
    localStorage.setItem(INFO_PANEL_LS_KEY, String(width))
  } catch {
    /* ignore */
  }
  return width
}

export function calculateResizedInfoPanelWidth(startWidth: number, startX: number, clientX: number): number {
  const deltaX = clientX - startX
  return Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, startWidth - deltaX))
}

export function createProjectPanelData(info: ProjectHoverInfo): InfoPanelData {
  return { kind: 'project', info }
}

export function createClusterPanelData(info: ClusterHoverInfo): InfoPanelData {
  return { kind: 'cluster', info }
}

export function createDeployModePanelData(
  phases: FlightPlanBlueprintProps['state']['phases'],
  mode: 'phased' | 'yolo',
): InfoPanelData {
  return { kind: 'deployMode', mode, phases }
}

export function buildGlowEdges(
  layout: LayoutResult,
  hoveredEdge: HoveredEdge | null,
  hoveredProjectKey: string | null,
): Set<string> {
  const edges = new Set<string>()
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null

  if (hoveredEdge) {
    for (const edge of layout.dependencyEdges) {
      if (edge.from === hoveredEdge.from && edge.to === hoveredEdge.to) {
        const cluster = edge.fromPos?.clusterName ?? ''
        edges.add(`${cluster}:${edge.from}-${edge.to}`)
      }
    }
  }

  if (hoveredProjectName && hoveredCluster) {
    for (const edge of layout.dependencyEdges) {
      const edgeCluster = edge.fromPos?.clusterName ?? ''
      const isConnected = edge.from === hoveredProjectName || edge.to === hoveredProjectName
      if (!isConnected) continue
      if (!edge.crossCluster && edgeCluster !== hoveredCluster) continue
      edges.add(`${edgeCluster}:${edge.from}-${edge.to}`)
    }
  }

  return edges
}

export function buildGlowProjectKeys(
  layout: LayoutResult,
  hoveredEdge: HoveredEdge | null,
  hoveredProjectKey: string | null,
): Set<string> {
  const keys = new Set<string>()
  const hoveredProjectName = hoveredProjectKey?.split('/')[1] ?? null
  const hoveredCluster = hoveredProjectKey?.split('/')[0] ?? null

  if (hoveredEdge) {
    for (const key of layout.projectPositions.keys()) {
      const pName = key.split('/')[1]
      if (pName === hoveredEdge.from || pName === hoveredEdge.to) keys.add(key)
    }
  }

  if (hoveredProjectKey && hoveredProjectName) {
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
}

export function createProjectMap(state: FlightPlanBlueprintProps['state']) {
  return new Map(state.projects.map((project) => [project.name, project]))
}

export function clearHidePanelTimeout(hidePanelTimeoutRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (hidePanelTimeoutRef.current) {
    clearTimeout(hidePanelTimeoutRef.current)
    hidePanelTimeoutRef.current = null
  }
}

export async function loadMissionPreview(
  proj: PayloadProject,
  setPreviewMission: (mission: MissionExport | null) => void,
  setPreviewLoading: (loading: boolean) => void,
): Promise<void> {
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
  try {
    const { mission } = await fetchMissionContent(baseMission)
    setPreviewMission(mission)
  } catch {
    setPreviewMission(baseMission)
  } finally {
    setPreviewLoading(false)
  }
}

export interface DependencyLabelPlacement {
  edge: LayoutResult['dependencyEdges'][number]
  midX: number
  rawMidY: number
  labelY: number
}

export function computeDependencyLabels(layout: LayoutResult): Array<DependencyLabelPlacement | null> {
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
    return { edge, midX, rawMidY, labelY }
  })
}
