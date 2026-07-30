// NetworkGlobe.geometry.ts — Arc/point geometry builders and constants
// Extracted from NetworkGlobe.tsx to reduce file complexity

import { COLORS } from './colors'

// =============================================================================
// Named constants — no magic numbers
// =============================================================================

// Globe geometry
export const GLOBE_RADIUS = 3.5
export const GLOBE_SEGMENTS = 48
export const GRID_LINE_THICKNESS = 0.005
export const GRID_LINE_SEGMENTS = 16
export const GRID_LINE_RADIAL_SEGMENTS = 120
export const GRID_RINGS_COUNT = 5

// Animation speeds (time multipliers)
export const GLOBE_ROTATION_SPEED = 0.1
export const GLOBE_TILT_SPEED = 0.15
export const GLOBE_TILT_AMPLITUDE = 0.08
export const GLOBE_Z_ROTATION_SPEED = 0.08
export const GLOBE_Z_ROTATION_AMPLITUDE = 0.03

export const CENTRAL_NODE_ROTATION_SPEED = 0.15
export const CENTRAL_NODE_TILT_SPEED = 0.2
export const CENTRAL_NODE_TILT_AMPLITUDE = 0.05
export const CENTRAL_NODE_PULSE_SPEED = 1.5
export const CENTRAL_NODE_PULSE_AMPLITUDE = 0.05

// Opacity values
export const GLOBE_WIREFRAME_OPACITY = 0.08
export const GRID_LINE_OPACITY = 0.12
export const FLOW_ACTIVE_OPACITY = 0.7
export const FLOW_INACTIVE_OPACITY = 0.06
export const TEXT_SUBTITLE_OPACITY_MULTIPLIER = 0.8

// Animation progress
export const ANIMATION_INCREMENT = 0.01
export const OPACITY_INCREMENT_FAST = 0.03
export const OPACITY_INCREMENT_SLOW = 0.01
export const DATA_PACKET_THRESHOLD = 0.7

// Data flow animation
export const DATA_FLOW_INTERVAL_MS = 4000
export const ACTIVE_FLOW_LINE_WIDTH = 2
export const INACTIVE_FLOW_LINE_WIDTH = 0.8
export const ACTIVE_DASH_SIZE = 0.15
export const ACTIVE_GAP_SIZE = 0.05
export const INACTIVE_DASH_SIZE = 0.05
export const INACTIVE_GAP_SIZE = 0.12

// Text positioning and sizing
export const TITLE_FONT_SIZE = 0.24
export const TITLE_OUTLINE_WIDTH = 0.015
export const SUBTITLE_FONT_SIZE = 0.1
export const SUBTITLE_OUTLINE_WIDTH = 0.005
export const SUBTITLE_Y_OFFSET = -0.28
export const BILLBOARD_Y_OFFSET = 1.1

// Resource display
export const MAX_DISPLAYED_RESOURCES = 10
export const CLUSTER_STAGGER_FACTOR = 0.15

// Random threshold for cross-cluster connections
export const CROSS_CLUSTER_CONNECTION_THRESHOLD = 0.7

// =============================================================================
// Hardcoded translations (originally from next-intl)
// =============================================================================
export const translations = {
  kubestellar: 'Console',
  controlPlane: 'AI Engine',
  clusters: {
    kubeflexCore: {
      name: 'Development Clusters',
      description: 'Development clusters for building and iterating on workloads',
    },
    edgeClusters: {
      name: 'Edge Clusters',
      description: 'Edge computing clusters for distributed workloads',
    },
    productionCluster: {
      name: 'Production Clusters',
      description: 'Production workloads and mission-critical applications',
    },
    devTestCluster: {
      name: 'Test Clusters',
      description: 'Test clusters for validation and QA environments',
    },
    multiCloudHub: {
      name: 'Multi-Cloud Hub',
      description: 'Cross-cloud orchestration and management',
    },
  },
}

// =============================================================================
// Cluster configurations
// =============================================================================
export interface ClusterConfig {
  name: string
  position: [number, number, number]
  nodeCount: number
  radius: number
  color: string
  description: string
}

export const DEFAULT_CLUSTERS: ClusterConfig[] = [
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

// =============================================================================
// Data flow types and builders
// =============================================================================
export type FlowType = 'control' | 'workload' | 'deploy' | 'data'

export interface DataFlow {
  path: [number, number, number][]
  id: number
  type: FlowType
}

/**
 * Build data flow paths connecting clusters to central node and cross-cluster
 */
export function buildDataFlows(clusters: ClusterConfig[]): DataFlow[] {
  const flows: DataFlow[] = []
  const centralPos: [number, number, number] = [0, 0, 0]

  // Connect central node to each cluster
  clusters.forEach((cluster, clusterIdx) => {
    flows.push({
      path: [centralPos, cluster.position],
      id: clusterIdx,
      type: 'control',
    })
  })

  // Add some cross-cluster connections with specific types
  // Guard: indices 0–3 must exist before accessing them directly
  if (clusters.length >= 4) {
    // Production to Edge (workload distribution)
    flows.push({
      path: [clusters[2].position, clusters[1].position],
      id: clusters.length + 1,
      type: 'workload',
    })

    // Development to Edge (control commands)
    flows.push({
      path: [clusters[0].position, clusters[1].position],
      id: clusters.length + 2,
      type: 'control',
    })

    // Test to Production (deployment pipeline)
    flows.push({
      path: [clusters[3].position, clusters[2].position],
      id: clusters.length + 3,
      type: 'deploy',
    })
  }

  // Add some other cross-cluster connections
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      if (Math.random() > CROSS_CLUSTER_CONNECTION_THRESHOLD) {
        flows.push({
          path: [clusters[i].position, clusters[j].position],
          id: clusters.length + i * 10 + j,
          type: 'data',
        })
      }
    }
  }

  return flows
}

/**
 * Get color for a specific flow type
 */
export function getFlowColor(flowType: FlowType, isActive: boolean): string {
  if (!isActive) return COLORS.primary

  switch (flowType) {
    case 'workload':
      return COLORS.success
    case 'deploy':
      return COLORS.accent1
    case 'control':
      return COLORS.secondary
    default:
      return COLORS.highlight
  }
}
