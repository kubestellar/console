/**
 * Zod schemas for Kubernetes API responses consumed by useCachedData hooks.
 *
 * These provide runtime validation for the most crash-prone response types:
 * pods, deployments, nodes, GPU nodes, events, and clusters. When the backend
 * contract drifts (field renamed, type changed, field missing), the safeParse
 * path emits a structured console.warn instead of letting the card crash with
 * "Cannot read properties of undefined".
 *
 * Design:
 * - Item schemas use `.passthrough()` so new backend fields are preserved and
 *   do not cause validation failures. We cast the parsed result back to the
 *   existing TypeScript interface at the call site via `validateArrayResponse`,
 *   which returns the fallback type.
 * - All optional fields are explicitly marked `.optional()`.
 * - Wrapper schemas (e.g. `PodsResponseSchema`) validate the envelope the
 *   backend wraps around the array, so `data.pods` is guaranteed to be an array.
 */
import { z } from 'zod'

/**
 * Label/annotation maps — Zod v4 requires two arguments for z.record().
 * We use z.unknown() for values because Kubernetes labels are always strings
 * in practice, but passthrough schemas need compatible index signatures.
 */
const labelsSchema = z.record(z.string(), z.string()).optional()

// ============================================================================
// Container / Pod schemas
// ============================================================================

export const ContainerInfoSchema = z.object({
  name: z.string(),
  image: z.string().optional(),
  ready: z.boolean().optional(),
  restartCount: z.number().optional(),
  state: z.enum(['running', 'waiting', 'terminated']),
  reason: z.string().optional(),
  message: z.string().optional(),
  gpuRequested: z.number().optional(),
})

export const PodInfoSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  cluster: z.string().optional(),
  status: z.string(),
  ready: z.string(),
  restarts: z.number(),
  age: z.string(),
  node: z.string().optional(),
  labels: labelsSchema,
  annotations: labelsSchema,
  containers: z.array(ContainerInfoSchema).optional(),
  cpuRequestMillis: z.number().optional(),
  cpuLimitMillis: z.number().optional(),
  memoryRequestBytes: z.number().optional(),
  memoryLimitBytes: z.number().optional(),
  gpuRequest: z.number().optional(),
  cpuUsageMillis: z.number().optional(),
  memoryUsageBytes: z.number().optional(),
  metricsAvailable: z.boolean().optional(),
})

/** Envelope: `{ pods: PodInfo[] }` returned by the `/pods` endpoint. */
export const PodsResponseSchema = z.object({
  pods: z.array(PodInfoSchema).optional().default([]),
})
export type PodsResponse = z.infer<typeof PodsResponseSchema>

// ============================================================================
// Cluster event schemas
// ============================================================================

export const ClusterEventSchema = z.object({
  type: z.string(),
  reason: z.string(),
  message: z.string(),
  object: z.string(),
  namespace: z.string(),
  cluster: z.string().optional(),
  count: z.number(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
})

/** Envelope: `{ events: ClusterEvent[] }` */
export const EventsResponseSchema = z.object({
  events: z.array(ClusterEventSchema).optional().default([]),
})
export type EventsResponse = z.infer<typeof EventsResponseSchema>

// ============================================================================
// Deployment schemas
// ============================================================================

export const DeploymentSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  cluster: z.string().optional(),
  status: z.enum(['running', 'deploying', 'failed']),
  replicas: z.number(),
  readyReplicas: z.number(),
  updatedReplicas: z.number(),
  availableReplicas: z.number(),
  progress: z.number(),
  image: z.string().optional(),
  age: z.string().optional(),
  labels: labelsSchema,
  annotations: labelsSchema,
  reason: z.string().optional(),
  message: z.string().optional(),
})

/** Envelope: `{ deployments: Deployment[] }` */
export const DeploymentsResponseSchema = z.object({
  deployments: z.array(DeploymentSchema).optional().default([]),
})
export type DeploymentsResponse = z.infer<typeof DeploymentsResponseSchema>

// ============================================================================
// Node schemas
// ============================================================================

export const NodeConditionSchema = z.object({
  type: z.string(),
  status: z.string(),
  reason: z.string().optional(),
  message: z.string().optional(),
})

export const NodeInfoSchema = z.object({
  name: z.string(),
  cluster: z.string().optional(),
  status: z.string(),
  roles: z.array(z.string()),
  internalIP: z.string().optional(),
  externalIP: z.string().optional(),
  kubeletVersion: z.string(),
  containerRuntime: z.string().optional(),
  os: z.string().optional(),
  architecture: z.string().optional(),
  cpuCapacity: z.string(),
  memoryCapacity: z.string(),
  storageCapacity: z.string().optional(),
  podCapacity: z.string(),
  conditions: z.array(NodeConditionSchema),
  labels: labelsSchema,
  taints: z.array(z.string()).optional(),
  age: z.string().optional(),
  unschedulable: z.boolean(),
})

/** Envelope: `{ nodes: NodeInfo[] }` */
export const NodesResponseSchema = z.object({
  nodes: z.array(NodeInfoSchema).optional().default([]),
})
export type NodesResponse = z.infer<typeof NodesResponseSchema>

// ============================================================================
// GPU Node schemas
// ============================================================================

export const GPUTaintSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  effect: z.string(),
})

export const GPUNodeSchema = z.object({
  name: z.string(),
  cluster: z.string(),
  gpuType: z.string(),
  gpuCount: z.number(),
  gpuAllocated: z.number(),
  acceleratorType: z.enum(['GPU', 'TPU', 'AIU', 'XPU']).optional(),
  taints: z.array(GPUTaintSchema).optional(),
  gpuMemoryMB: z.number().optional(),
  gpuFamily: z.string().optional(),
  cudaDriverVersion: z.string().optional(),
  cudaRuntimeVersion: z.string().optional(),
  migCapable: z.boolean().optional(),
  migStrategy: z.string().optional(),
  manufacturer: z.string().optional(),
})

/** Envelope: `{ nodes: GPUNode[] }` */
export const GPUNodesResponseSchema = z.object({
  nodes: z.array(GPUNodeSchema).optional().default([]),
})
export type GPUNodesResponse = z.infer<typeof GPUNodesResponseSchema>

// ============================================================================
// GPU Node Health schemas
// ============================================================================

export const GPUNodeHealthCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
})

export const GPUNodeHealthStatusSchema = z.object({
  nodeName: z.string(),
  cluster: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  gpuCount: z.number(),
  gpuType: z.string(),
  checks: z.array(GPUNodeHealthCheckSchema),
  issues: z.array(z.string()),
  stuckPods: z.number(),
  checkedAt: z.string(),
})

/** Envelope: `{ nodes: GPUNodeHealthStatus[] }` */
export const GPUNodeHealthResponseSchema = z.object({
  nodes: z.array(GPUNodeHealthStatusSchema).optional().default([]),
})
export type GPUNodeHealthResponse = z.infer<typeof GPUNodeHealthResponseSchema>

// ============================================================================
// Cluster list schema (used by fetchClusters)
// ============================================================================

export const ClusterInfoSchema = z.object({
  name: z.string(),
  reachable: z.boolean().optional(),
})

/** Envelope: `{ clusters: ClusterInfo[] }` */
export const ClustersResponseSchema = z.object({
  clusters: z.array(ClusterInfoSchema).optional().default([]),
})
export type ClustersResponse = z.infer<typeof ClustersResponseSchema>
