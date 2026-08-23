import type { BlueprintLayout, MissionControlState, PayloadProject, ProjectPosition } from './types'
import type { ClusterInfo } from '../../hooks/mcp/types'
import {
  INFO_PANEL_MIN, INFO_PANEL_MAX, INFO_PANEL_DEFAULT, INFO_PANEL_LS_KEY,
  ZOOM_MIN, ZOOM_MAX,
  MIN_LABEL_GAP, NODE_RADIUS, LABEL_OFFSET_Y,
  LABEL_NODE_CLEARANCE_X, LABEL_NODE_CLEARANCE_Y, LABEL_SLOT_CLEARANCE_X,
} from './FlightPlanBlueprint.constants'

/** Resolve kbPath for a project — tries explicit kbPath, then convention-based lookup */
export function resolveKbPath(proj: PayloadProject): string | undefined {
  if (proj.kbPath) return proj.kbPath
  // Convention: fixes/cncf-install/install-{name}.json
  const slug = proj.name.toLowerCase().replace(/\s+/g, '-')
  return `fixes/cncf-install/install-${slug}.json`
}

/**
 * Scope assignments to the selected target clusters and redistribute projects
 * assigned to explicitly unhealthy clusters onto the remaining healthy ones.
 *
 * Clusters that are not present in `clusters` (e.g. not loaded yet) are left
 * alone so that user-assigned projects are never silently dropped.
 */
export function computeHealthyState(
  state: MissionControlState,
  clusters: ClusterInfo[] | undefined,
): MissionControlState {
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

  // Allow projects on multiple clusters — composite keys handle positioning
  return { ...state, assignments }
}

/** Split a `cluster/project` composite key into its two halves. */
export function splitProjectKey(key: string | null): { clusterName: string | null; projectName: string | null } {
  if (!key) return { clusterName: null, projectName: null }
  const [clusterName, projectName] = key.split('/')
  return { clusterName: clusterName ?? null, projectName: projectName ?? null }
}

interface GlowInput {
  hoveredEdge: { from: string; to: string } | null
  hoveredProjectKey: string | null
  hoveredProjectName: string | null
  hoveredCluster: string | null
  layout: BlueprintLayout | null
}

/** Cluster-scoped set of `cluster:from-to` edge keys that should glow. */
export function computeGlowEdges({ hoveredEdge, hoveredProjectName, hoveredCluster, layout }: GlowInput): Set<string> {
  const edges = new Set<string>()
  if (!layout) return edges
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
      // Same-cluster edges: only glow if on the hovered cluster
      // Cross-cluster edges: always glow if the hovered project is an endpoint
      if (!edge.crossCluster && edgeCluster !== hoveredCluster) continue
      edges.add(`${edgeCluster}:${edge.from}-${edge.to}`)
    }
  }
  return edges
}

/** Composite `cluster/project` keys for the project nodes that should glow. */
export function computeGlowProjectKeys({ hoveredEdge, hoveredProjectKey, hoveredProjectName, hoveredCluster, layout }: GlowInput): Set<string> {
  const keys = new Set<string>()
  if (!layout) return keys
  if (hoveredEdge) {
    for (const key of layout.projectPositions.keys()) {
      const pName = key.split('/')[1]
      if (pName === hoveredEdge.from || pName === hoveredEdge.to) keys.add(key)
    }
  }
  if (hoveredProjectKey && hoveredProjectName) {
    // Always glow the hovered project itself
    keys.add(hoveredProjectKey)
    // Find connected project names — separate same-cluster vs cross-cluster
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
      // Same-cluster connections: glow on same cluster
      if (cluster === hoveredCluster && sameClusterConnected.has(pName)) keys.add(key)
      // Cross-cluster connections: glow on any cluster
      if (crossClusterConnected.has(pName)) keys.add(key)
    }
  }
  return keys
}

/** Read the persisted info-panel width, falling back to the default when unset or out of range. */
export function readStoredInfoPanelWidth(): number {
  try {
    const stored = localStorage.getItem(INFO_PANEL_LS_KEY)
    if (stored) {
      const parsed = Number(stored)
      if (parsed >= INFO_PANEL_MIN && parsed <= INFO_PANEL_MAX) return parsed
    }
  } catch { /* ignore */ }
  return INFO_PANEL_DEFAULT
}

/** Clamp an info-panel width to the allowed range. */
export function clampInfoPanelWidth(width: number): number {
  return Math.min(INFO_PANEL_MAX, Math.max(INFO_PANEL_MIN, width))
}

/** Clamp a zoom factor to the allowed range. */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
}

/**
 * Place a dependency label above the edge midpoint, pushing it clear of nearby
 * project nodes and of labels already placed in `labelSlots` (mutated).
 */
export function resolveLabelY(
  midX: number,
  rawMidY: number,
  nodeCenters: ProjectPosition[],
  labelSlots: { x: number; y: number }[],
): number {
  let labelY = rawMidY - LABEL_OFFSET_Y
  // Push away from project nodes
  for (const node of nodeCenters) {
    const dx = Math.abs(midX - node.cx)
    const dy = Math.abs(labelY - node.cy)
    if (dx < LABEL_NODE_CLEARANCE_X && dy < NODE_RADIUS + LABEL_NODE_CLEARANCE_Y) {
      labelY = node.cy - NODE_RADIUS - LABEL_OFFSET_Y
    }
  }
  // Avoid overlapping other labels
  for (const slot of labelSlots) {
    const dxL = Math.abs(midX - slot.x)
    const dyL = Math.abs(labelY - slot.y)
    if (dxL < LABEL_SLOT_CLEARANCE_X && dyL < MIN_LABEL_GAP) {
      labelY = slot.y - MIN_LABEL_GAP
    }
  }
  labelSlots.push({ x: midX, y: labelY })
  return labelY
}
