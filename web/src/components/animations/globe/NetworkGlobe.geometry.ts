import { COLORS } from "./colors"

/** Hardcoded translations (originally from next-intl). */
export const NETWORK_GLOBE_TRANSLATIONS = {
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

// --- Globe / grid geometry constants ---
export const GLOBE_RADIUS = 3.5
export const GLOBE_SPHERE_SEGMENTS = 48
export const GLOBE_WIREFRAME_OPACITY = 0.08
export const GRID_RING_COUNT = 5
export const GRID_TUBE_RADIUS = 0.005
export const GRID_TUBULAR_SEGMENTS = 16
export const GRID_RADIAL_SEGMENTS = 120
export const GRID_LINE_OPACITY = 0.12

// --- Rotation / tilt animation constants ---
export const GLOBE_ROTATION_Y_SPEED = 0.1
export const GLOBE_TILT_X_SPEED = 0.15
export const GLOBE_TILT_X_AMPLITUDE = 0.08
export const GLOBE_TILT_Z_SPEED = 0.08
export const GLOBE_TILT_Z_AMPLITUDE = 0.03
export const ANIMATION_PROGRESS_STEP = 0.01

export const CENTRAL_NODE_ROTATION_Y_SPEED = 0.15
export const CENTRAL_NODE_TILT_X_SPEED = 0.2
export const CENTRAL_NODE_TILT_X_AMPLITUDE = 0.05
export const CENTRAL_NODE_PULSE_SPEED = 1.5
export const CENTRAL_NODE_PULSE_AMPLITUDE = 0.05
export const CENTRAL_NODE_FADE_STEP = 0.01

// --- Data flow animation constants ---
export const DATA_FLOW_INTERVAL_MS = 4000
export const CROSS_CLUSTER_CONNECTION_PROBABILITY = 0.7
export const FLOW_FADE_IN_STEP = 0.03
export const FLOW_ACTIVE_MAX_OPACITY = 0.7
export const FLOW_FADE_OUT_STEP = 0.01
export const FLOW_IDLE_MIN_OPACITY = 0.06
export const FLOW_ACTIVE_DASH_SIZE = 0.15
export const FLOW_ACTIVE_GAP_SIZE = 0.05
export const FLOW_IDLE_DASH_SIZE = 0.05
export const FLOW_IDLE_GAP_SIZE = 0.12
export const FLOW_ACTIVE_LINE_WIDTH = 2
export const FLOW_IDLE_LINE_WIDTH = 0.8
export const CLUSTER_REVEAL_STAGGER = 0.15
export const DATA_PACKET_MIN_SPEED = 1

export interface ClusterConfig {
  name: string
  position: [number, number, number]
  nodeCount: number
  radius: number
  color: string
  description: string
}

export interface DataFlow {
  path: [number, number, number][]
  id: number
  type: string
}

/** Builds the static cluster configuration used to render the globe's satellite clusters. */
export function buildClusters(): ClusterConfig[] {
  const t = NETWORK_GLOBE_TRANSLATIONS.clusters
  return [
    {
      name: t.kubeflexCore.name,
      position: [0, 3, 0],
      nodeCount: 6,
      radius: 0.8,
      color: COLORS.primary,
      description: t.kubeflexCore.description,
    },
    {
      name: t.edgeClusters.name,
      position: [3, 0, 0],
      nodeCount: 8,
      radius: 1,
      color: COLORS.highlight,
      description: t.edgeClusters.description,
    },
    {
      name: t.productionCluster.name,
      position: [0, -3, 0],
      nodeCount: 5,
      radius: 0.7,
      color: COLORS.success,
      description: t.productionCluster.description,
    },
    {
      name: t.devTestCluster.name,
      position: [-3, 0, 0],
      nodeCount: 7,
      radius: 0.9,
      color: COLORS.accent2,
      description: t.devTestCluster.description,
    },
    {
      name: t.multiCloudHub.name,
      position: [2, 2, -2],
      nodeCount: 4,
      radius: 0.6,
      color: COLORS.accent1,
      description: t.multiCloudHub.description,
    },
  ]
}

/** Builds the data-flow paths connecting the central node to each cluster, plus cross-cluster links. */
export function buildDataFlows(clusters: ClusterConfig[]): DataFlow[] {
  const flows: DataFlow[] = []
  const centralPos: [number, number, number] = [0, 0, 0]

  // Connect central node to each cluster
  clusters.forEach((cluster, clusterIdx) => {
    flows.push({
      path: [centralPos, cluster.position],
      id: clusterIdx,
      type: "control",
    })
  })

  // Add some cross-cluster connections with specific types
  // Guard: indices 0–3 must exist before accessing them directly
  if (clusters.length >= 4) {
    // Production to Edge (workload distribution)
    flows.push({
      path: [clusters[2].position, clusters[1].position],
      id: clusters.length + 1,
      type: "workload",
    })

    // Development to Edge (control commands)
    flows.push({
      path: [clusters[0].position, clusters[1].position],
      id: clusters.length + 2,
      type: "control",
    })

    // Test to Production (deployment pipeline)
    flows.push({
      path: [clusters[3].position, clusters[2].position],
      id: clusters.length + 3,
      type: "deploy",
    })
  }

  // Add some other cross-cluster connections
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (Math.random() > CROSS_CLUSTER_CONNECTION_PROBABILITY) {
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

/** Resolves the display color for a data flow line/packet based on its type and active state. */
export function flowColor(type: string, isActive: boolean): string {
  if (!isActive) return COLORS.primary
  if (type === "workload") return COLORS.success
  if (type === "deploy") return COLORS.accent1
  if (type === "control") return COLORS.secondary
  return COLORS.highlight
}
