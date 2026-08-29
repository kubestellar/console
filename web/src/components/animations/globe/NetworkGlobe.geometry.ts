// Geometry/config builders and named constants for NetworkGlobe.
// Extracted from NetworkGlobe.tsx to keep the component file focused on
// rendering + animation wiring (see issue #21883).
import type { Material, Color, Object3D } from "three"
import { COLORS } from "./colors"

// Hardcoded translations (originally from next-intl)
export const translations = {
  kubestellar: "Console",
  controlPlane: "AI Engine",
  clusters: {
    kubeflexCore: {
      name: "Development Clusters",
      description: "Development clusters for building and iterating on workloads",
    },
    edgeClusters: {
      name: "Edge Clusters",
      description: "Edge computing clusters for distributed workloads",
    },
    productionCluster: {
      name: "Production Clusters",
      description: "Production workloads and mission-critical applications",
    },
    devTestCluster: {
      name: "Test Clusters",
      description: "Test clusters for validation and QA environments",
    },
    multiCloudHub: {
      name: "Multi-Cloud Hub",
      description: "Cross-cloud orchestration and management",
    },
  },
}

// Add this interface for the component props
export interface NetworkGlobeProps {
  isLoaded?: boolean
}

// Define interfaces for better type safety
export interface FlowMaterial extends Material {
  opacity: number
  color: Color
  dashSize?: number
  gapSize?: number
}

export interface FlowChild extends Object3D {
  material?: FlowMaterial
}

export interface CentralNodeChild extends Object3D {
  material?: Material & { opacity?: number }
}

export type ClusterPosition = [number, number, number]

export interface ClusterConfig {
  name: string
  position: ClusterPosition
  nodeCount: number
  radius: number
  color: string
  description: string
}

export interface DataFlow {
  path: ClusterPosition[]
  id: number
  type: "control" | "workload" | "deploy" | "data"
}

// --- Named constants (no magic numbers in NetworkGlobe.tsx) ---

// Globe geometry
export const GLOBE_RADIUS = 3.5
export const GLOBE_WIDTH_SEGMENTS = 48
export const GLOBE_HEIGHT_SEGMENTS = 48
export const GLOBE_WIREFRAME_OPACITY = 0.08

// Grid lines (torus rings)
export const GRID_LINE_COUNT_PER_AXIS = 5
export const GRID_LINE_TUBE_RADIUS = 0.005
export const GRID_LINE_RADIAL_SEGMENTS = 16
export const GRID_LINE_TUBULAR_SEGMENTS = 120
export const GRID_LINE_OPACITY = 0.12

// Rotation speeds — shared by globe, grid lines and rotating content group
export const ROTATION_SPEED_Y = 0.1
export const ROTATION_TILT_X_SPEED = 0.15
export const ROTATION_TILT_X_AMPLITUDE = 0.08
export const ROTATION_TILT_Z_SPEED = 0.08
export const ROTATION_TILT_Z_AMPLITUDE = 0.03

// Central node animation
export const CENTRAL_NODE_ROTATION_SPEED_Y = 0.15
export const CENTRAL_NODE_TILT_X_SPEED = 0.2
export const CENTRAL_NODE_TILT_X_AMPLITUDE = 0.05
export const CENTRAL_NODE_PULSE_SPEED = 1.5
export const CENTRAL_NODE_PULSE_AMPLITUDE = 0.05
export const CENTRAL_NODE_FADE_IN_STEP = 0.01

// Animation reveal progress
export const ANIMATION_PROGRESS_STEP = 0.01
export const ANIMATION_PROGRESS_MAX = 1
export const CLUSTER_REVEAL_STAGGER = 0.15
export const DATA_PACKET_REVEAL_THRESHOLD = 0.7

// Data flow activity cycle
export const FLOW_ROTATION_INTERVAL_MS = 4000
export const FLOW_FADE_IN_STEP = 0.03
export const FLOW_FADE_OUT_STEP = 0.01
export const FLOW_ACTIVE_MAX_OPACITY = 0.7
export const FLOW_IDLE_MAX_OPACITY = 0.06
export const FLOW_ACTIVE_LINE_WIDTH = 2
export const FLOW_IDLE_LINE_WIDTH = 0.8
export const FLOW_ACTIVE_DASH_SIZE = 0.15
export const FLOW_ACTIVE_GAP_SIZE = 0.05
export const FLOW_IDLE_DASH_SIZE = 0.05
export const FLOW_IDLE_GAP_SIZE = 0.12

// Cross-cluster connection sampling
export const CROSS_CLUSTER_CONNECTION_CHANCE = 0.7

// Text labels
export const TITLE_FONT_SIZE = 0.24
export const TITLE_OUTLINE_WIDTH = 0.015
export const SUBTITLE_POSITION_Y = -0.28
export const SUBTITLE_FONT_SIZE = 0.1
export const SUBTITLE_COLOR = "#8ab4f8"
export const SUBTITLE_OUTLINE_WIDTH = 0.005
export const SUBTITLE_OPACITY_FACTOR = 0.8

/** Build the cluster configuration list with Console-related names/colors. */
export function buildClusters(): ClusterConfig[] {
  return [
    {
      name: translations.clusters.kubeflexCore.name,
      position: [0, 3, 0],
      nodeCount: 6,
      radius: 0.8,
      color: COLORS.primary,
      description: translations.clusters.kubeflexCore.description,
    },
    {
      name: translations.clusters.edgeClusters.name,
      position: [3, 0, 0],
      nodeCount: 8,
      radius: 1,
      color: COLORS.highlight,
      description: translations.clusters.edgeClusters.description,
    },
    {
      name: translations.clusters.productionCluster.name,
      position: [0, -3, 0],
      nodeCount: 5,
      radius: 0.7,
      color: COLORS.success,
      description: translations.clusters.productionCluster.description,
    },
    {
      name: translations.clusters.devTestCluster.name,
      position: [-3, 0, 0],
      nodeCount: 7,
      radius: 0.9,
      color: COLORS.accent2,
      description: translations.clusters.devTestCluster.description,
    },
    {
      name: translations.clusters.multiCloudHub.name,
      position: [2, 2, -2],
      nodeCount: 4,
      radius: 0.6,
      color: COLORS.accent1,
      description: translations.clusters.multiCloudHub.description,
    },
  ]
}

/** Build data-flow connection paths (central hub + cross-cluster links). */
export function buildDataFlows(clusters: ClusterConfig[]): DataFlow[] {
  const flows: DataFlow[] = []
  const centralPos: ClusterPosition = [0, 0, 0]

  // Connect central node to each cluster
  clusters.forEach((cluster, clusterIdx) => {
    flows.push({
      path: [centralPos, cluster.position],
      id: clusterIdx,
      type: "control",
    })
  })

  // Add typed cross-cluster flows for each adjacent cluster pair.
  // Uses explicit index checks so this scales to any number of clusters
  // without assuming a fixed topology.
  const FLOW_PAIRS: Array<{ from: number; to: number; type: DataFlow["type"]; idOffset: number }> = [
    { from: 2, to: 1, type: "workload", idOffset: 1 }, // distribution: third → second cluster
    { from: 0, to: 1, type: "control",  idOffset: 2 }, // control:      first → second cluster
    { from: 3, to: 2, type: "deploy",   idOffset: 3 }, // deploy:       fourth → third cluster
  ]
  for (const { from, to, type, idOffset } of FLOW_PAIRS) {
    const src = clusters[from]
    const dst = clusters[to]
    if (src && dst) {
      flows.push({
        path: [src.position, dst.position],
        id: clusters.length + idOffset,
        type,
      })
    }
  }

  // Add some other cross-cluster connections
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (Math.random() > CROSS_CLUSTER_CONNECTION_CHANCE) {
        flows.push({
          path: [clusters[i].position, clusters[j].position],
          id: clusters.length + i * 10 + j,
          type: "data",
        })
      }
    }
  }

  return flows
}

/** Resolve the color for a flow line/packet based on its type and activity. */
export function resolveFlowColor(type: DataFlow["type"], isActive: boolean): string {
  if (!isActive) return COLORS.primary
  switch (type) {
    case "workload":
      return COLORS.success
    case "deploy":
      return COLORS.accent1
    case "control":
      return COLORS.secondary
    default:
      return COLORS.highlight
  }
}
