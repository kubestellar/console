import { usePodIssues, useDeploymentIssues, useEvents, useDeployments, useServices, usePods } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'

export interface PodIssue {
  name: string
  namespace: string
  status: string
  restarts: number
  reason?: string
  issues?: string[]
}

export interface DeploymentIssue {
  name: string
  namespace: string
  cluster?: string
  replicas: number
  readyReplicas: number
  reason?: string
  message?: string
}

export interface NamespaceEvent {
  type: string
  reason: string
  message: string
  object: string
  namespace: string
}

export interface Pod {
  name: string
  status: string
}

export interface Deployment {
  name: string
  replicas: number
  readyReplicas: number
}

export interface Service {
  name: string
  type: string
}

export interface PVC {
  name: string
  status: string
  capacity?: string
}

export interface UseNamespaceDrillDownResult {
  podIssues: PodIssue[]
  deploymentIssues: DeploymentIssue[]
  nsEvents: NamespaceEvent[]
  allDeployments: Deployment[]
  allServices: Service[]
  allPVCs: PVC[]
  allPods: Pod[]
}

/**
 * Owns all data fetching for the Namespace drill-down
 * so the view component stays presentational.
 */
export function useNamespaceDrillDown(cluster: string, namespace: string): UseNamespaceDrillDownResult {
  const clusterShort = cluster.split('/').pop() || cluster

  const { issues: allPodIssues } = usePodIssues(cluster)
  const { issues: allDeploymentIssues } = useDeploymentIssues()
  const { events } = useEvents(cluster, namespace, 20)

  // Resource hooks for the Resources tab
  const { deployments: allDeployments } = useDeployments(clusterShort, namespace)
  const { services: allServices } = useServices(clusterShort, namespace)
  const { pvcs: allPVCs } = useCachedPVCs(clusterShort, namespace)
  const { pods: allPods } = usePods(clusterShort, namespace)

  const podIssues = allPodIssues.filter(p => p.namespace === namespace) as PodIssue[]

  const deploymentIssues = allDeploymentIssues.filter(d => d.namespace === namespace &&
    (d.cluster === cluster || d.cluster?.includes(cluster.split('/')[0]))) as DeploymentIssue[]

  const nsEvents = events.filter(e => e.namespace === namespace) as NamespaceEvent[]

  return {
    podIssues,
    deploymentIssues,
    nsEvents,
    allDeployments: (allDeployments || []) as Deployment[],
    allServices: (allServices || []) as Service[],
    allPVCs: (allPVCs || []) as PVC[],
    allPods: (allPods || []) as Pod[],
  }
}
