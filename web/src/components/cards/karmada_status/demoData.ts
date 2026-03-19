/**
 * Demo data for the Karmada multi-cluster orchestration status card.
 *
 * Represents a typical Karmada installation orchestrating workloads across
 * multiple member clusters. Used in demo mode or when no Karmada control
 * plane is accessible.
 *
 * Karmada terminology:
 * - PropagationPolicy: defines which resources to propagate to which clusters
 * - ResourceBinding: tracks propagation of a specific resource instance
 * - ClusterPropagationPolicy: cluster-scoped propagation policy
 * - OverridePolicy: customizes resources per cluster during propagation
 */

/** Demo data shows as checked 30 seconds ago */
const DEMO_LAST_CHECK_OFFSET_MS = 30_000

/** Number of demo member cluster entries */
export type KarmadaHealth = 'healthy' | 'degraded' | 'not-installed'

export type KarmadaClusterStatus = 'Ready' | 'NotReady' | 'Unknown'

export type KarmadaBindingStatus = 'Scheduled' | 'FullySchedulable' | 'Binding' | 'Bound' | 'Failed' | 'Unknown'

export interface KarmadaMemberCluster {
  name: string
  status: KarmadaClusterStatus
  /** Kubernetes version reported by the member cluster */
  kubernetesVersion: string
  /** Number of nodes in the member cluster */
  nodeCount: number
  /** Labels attached to this cluster resource */
  labels: Record<string, string>
  /** Synced resources count */
  syncedResources: number
}

export interface KarmadaPropagationPolicy {
  name: string
  namespace: string
  /** Total number of ResourceBindings created for this policy */
  bindingCount: number
  /** Number of bindings currently in Bound/Scheduled state */
  readyCount: number
  /** Resource selectors covered by this policy */
  resourceSelectors: string[]
  /** Target cluster names (empty means cluster affinity/spread) */
  targetClusters: string[]
}

export interface KarmadaResourceBinding {
  name: string
  namespace: string
  /** Source API resource kind (e.g., Deployment, ConfigMap) */
  resourceKind: string
  /** Propagation status */
  status: KarmadaBindingStatus
  /** Clusters this resource has been propagated to */
  boundClusters: string[]
}

export interface KarmadaDemoData {
  health: KarmadaHealth
  /** Number of ready karmada-controller-manager pods */
  controllerPods: { ready: number; total: number }
  memberClusters: KarmadaMemberCluster[]
  propagationPolicies: KarmadaPropagationPolicy[]
  resourceBindings: KarmadaResourceBinding[]
  /** Total ClusterPropagationPolicy count */
  clusterPoliciesCount: number
  /** Total OverridePolicy count */
  overridePoliciesCount: number
  lastCheckTime: string
}

// ---------------------------------------------------------------------------
// Demo entries
// ---------------------------------------------------------------------------

export const KARMADA_DEMO_DATA: KarmadaDemoData = {
  health: 'degraded',
  controllerPods: { ready: 2, total: 3 },
  memberClusters: [
    {
      name: 'member-us-east',
      status: 'Ready',
      kubernetesVersion: 'v1.29.2',
      nodeCount: 8,
      labels: { region: 'us-east-1', tier: 'production' },
      syncedResources: 1,
    },
    {
      name: 'member-eu-west',
      status: 'Ready',
      kubernetesVersion: 'v1.28.6',
      nodeCount: 6,
      labels: { region: 'eu-west-1', tier: 'production' },
      syncedResources: 1,
    },
    {
      name: 'member-ap-south',
      status: 'NotReady',
      kubernetesVersion: 'v1.28.5',
      nodeCount: 4,
      labels: { region: 'ap-south-1', tier: 'staging' },
      syncedResources: 0,
    },
    {
      name: 'member-us-west',
      status: 'Ready',
      kubernetesVersion: 'v1.29.1',
      nodeCount: 5,
      labels: { region: 'us-west-2', tier: 'staging' },
      syncedResources: 1,
    },
  ],
  propagationPolicies: [
    {
      name: 'frontend-policy',
      namespace: 'production',
      bindingCount: 3,
      readyCount: 2,
      resourceSelectors: ['Deployment:frontend', 'Service:frontend-svc'],
      targetClusters: ['member-us-east', 'member-eu-west', 'member-us-west'],
    },
    {
      name: 'backend-policy',
      namespace: 'production',
      bindingCount: 2,
      readyCount: 2,
      resourceSelectors: ['Deployment:backend-api', 'ConfigMap:backend-config'],
      targetClusters: ['member-us-east', 'member-eu-west'],
    },
    {
      name: 'staging-spread-policy',
      namespace: 'staging',
      bindingCount: 1,
      readyCount: 1,
      resourceSelectors: ['Deployment:test-app'],
      targetClusters: ['member-ap-south', 'member-us-west'],
    },
  ],
  resourceBindings: [
    {
      name: 'frontend-binding-us-east',
      namespace: 'production',
      resourceKind: 'Deployment',
      status: 'Bound',
      boundClusters: ['member-us-east'],
    },
    {
      name: 'frontend-binding-eu-west',
      namespace: 'production',
      resourceKind: 'Deployment',
      status: 'Bound',
      boundClusters: ['member-eu-west'],
    },
    {
      name: 'frontend-binding-ap-south',
      namespace: 'production',
      resourceKind: 'Deployment',
      status: 'Failed',
      boundClusters: [],
    },
    {
      name: 'backend-binding-us-east',
      namespace: 'production',
      resourceKind: 'Deployment',
      status: 'Bound',
      boundClusters: ['member-us-east'],
    },
    {
      name: 'test-app-binding-us-west',
      namespace: 'staging',
      resourceKind: 'Deployment',
      status: 'Scheduled',
      boundClusters: ['member-us-west'],
    },
  ],
  clusterPoliciesCount: 2,
  overridePoliciesCount: 3,
  lastCheckTime: new Date(Date.now() - DEMO_LAST_CHECK_OFFSET_MS).toISOString(),
}
