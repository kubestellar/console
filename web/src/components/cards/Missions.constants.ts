/**
 * Constants for Missions card component
 */

import { MS_PER_MINUTE } from '../../lib/constants/time'
import type { DeployMission } from '../../hooks/useDeployMissions'

export const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
export const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
export const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
export const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE

export const DEMO_MISSIONS: DeployMission[] = [
  {
    id: 'demo-1',
    workload: 'nginx-frontend',
    namespace: 'production',
    sourceCluster: 'eks-prod-us-east-1',
    targetClusters: ['openshift-prod', 'do-nyc1-prod'],
    groupName: 'production',
    status: 'orbit',
    clusterStatuses: [
      { cluster: 'openshift-prod', status: 'running', replicas: 3, readyReplicas: 3 },
      { cluster: 'do-nyc1-prod', status: 'running', replicas: 3, readyReplicas: 3 },
    ],
    startedAt: Date.now() - FIVE_MINUTES_MS,
    completedAt: Date.now() - FOUR_MINUTES_MS,
  },
  {
    id: 'demo-2',
    workload: 'api-gateway',
    namespace: 'staging',
    sourceCluster: 'gke-staging',
    targetClusters: ['aks-dev-westeu', 'rancher-mgmt'],
    groupName: 'staging',
    status: 'orbit',
    clusterStatuses: [
      { cluster: 'aks-dev-westeu', status: 'running', replicas: 2, readyReplicas: 2 },
      { cluster: 'rancher-mgmt', status: 'running', replicas: 2, readyReplicas: 2 },
    ],
    startedAt: Date.now() - THREE_MINUTES_MS,
    completedAt: Date.now() - TWO_MINUTES_MS,
  },
]

export const STATUS_ORDER: Record<string, number> = {
  launching: 1,
  deploying: 2,
  partial: 3,
  orbit: 4,
  abort: 5,
}

export const CLUSTER_FILTER_STORAGE_KEY = 'kubestellar-card-filter:deployment-missions-clusters'

export type SortByOption = 'status' | 'workload' | 'time' | 'clusters'

export const ITEMS_PER_PAGE_DEFAULT = 10
