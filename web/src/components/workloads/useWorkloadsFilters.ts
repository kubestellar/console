import { useMemo } from 'react'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'

const POD_ISSUES_ERROR_THRESHOLD = 3
const DEPLOYMENT_ISSUES_ERROR_THRESHOLD = 3

export interface WorkloadDeployment {
  name: string
  namespace: string
  cluster: string
  status: string
  replicas: number
  readyReplicas: number
  image?: string
}

export interface WorkloadIssue {
  name: string
  namespace: string
  cluster: string
}

export interface AppSummary {
  namespace: string
  cluster: string
  deploymentCount: number
  podIssues: number
  deploymentIssues: number
  status: 'healthy' | 'warning' | 'error'
  type: 'namespace'
}

export interface DeploymentSummary {
  name: string
  namespace: string
  cluster: string
  status: 'running' | 'deploying' | 'failed'
  replicas: number
  readyReplicas: number
  type: 'deployment'
  image?: string
}

export type WorkloadItem = AppSummary | DeploymentSummary

interface WorkloadStats {
  total: number
  healthy: number
  warning: number
  critical: number
  totalDeployments: number
  totalPodIssues: number
  totalDeploymentIssues: number
}

interface UseWorkloadsFiltersParams {
  deployments: WorkloadDeployment[]
  podIssues: WorkloadIssue[]
  deploymentIssues: WorkloadIssue[]
}

interface UseWorkloadsFiltersResult {
  apps: WorkloadItem[]
  stats: WorkloadStats
  selectedClusters: string[]
  isAllClustersSelected: boolean
}

export function useWorkloadsFilters({
  deployments,
  podIssues,
  deploymentIssues,
}: UseWorkloadsFiltersParams): UseWorkloadsFiltersResult {
  const {
    selectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  const apps = useMemo(() => {
    let filteredDeployments = deployments
    let filteredPodIssues = podIssues
    let filteredDeploymentIssues = deploymentIssues

    if (!isAllClustersSelected) {
      filteredDeployments = filteredDeployments.filter((deployment) =>
        deployment.cluster && selectedClusters.includes(deployment.cluster),
      )
      filteredPodIssues = filteredPodIssues.filter((issue) =>
        issue.cluster && selectedClusters.includes(issue.cluster),
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter((issue) =>
        issue.cluster && selectedClusters.includes(issue.cluster),
      )
    }

    const trimmedFilter = customFilter.trim()
    if (trimmedFilter) {
      const query = trimmedFilter.toLowerCase()
      filteredDeployments = filteredDeployments.filter((deployment) =>
        deployment.name.toLowerCase().includes(query) ||
        deployment.namespace.toLowerCase().includes(query) ||
        (deployment.cluster && deployment.cluster.toLowerCase().includes(query)),
      )
      filteredPodIssues = filteredPodIssues.filter((issue) =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query)),
      )
      filteredDeploymentIssues = filteredDeploymentIssues.filter((issue) =>
        issue.name.toLowerCase().includes(query) ||
        issue.namespace.toLowerCase().includes(query) ||
        (issue.cluster && issue.cluster.toLowerCase().includes(query)),
      )
    }

    if (trimmedFilter || !isAllClustersSelected) {
      return filteredDeployments
        .map((deployment) => ({
          ...deployment,
          status: deployment.status as DeploymentSummary['status'],
          type: 'deployment' as const,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }

    const appMap = new Map<string, AppSummary>()

    filteredDeployments.forEach((deployment) => {
      const key = `${deployment.cluster}/${deployment.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: deployment.namespace,
          cluster: deployment.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
          type: 'namespace',
        })
      }
      const app = appMap.get(key)
      if (!app) return
      app.deploymentCount++
    })

    filteredPodIssues.forEach((issue) => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
          type: 'namespace',
        })
      }
      const app = appMap.get(key)
      if (!app) return
      app.podIssues++
      app.status = app.podIssues > POD_ISSUES_ERROR_THRESHOLD ? 'error' : 'warning'
    })

    filteredDeploymentIssues.forEach((issue) => {
      const key = `${issue.cluster}/${issue.namespace}`
      if (!appMap.has(key)) {
        appMap.set(key, {
          namespace: issue.namespace,
          cluster: issue.cluster || 'unknown',
          deploymentCount: 0,
          podIssues: 0,
          deploymentIssues: 0,
          status: 'healthy',
          type: 'namespace',
        })
      }
      const app = appMap.get(key)
      if (!app) return
      app.deploymentIssues++
      if (app.deploymentIssues > DEPLOYMENT_ISSUES_ERROR_THRESHOLD) {
        app.status = 'error'
      } else if (app.status === 'healthy') {
        app.status = 'warning'
      }
    })

    const statusOrder: Record<string, number> = { error: 0, critical: 0, warning: 1, healthy: 2 }

    return Array.from(appMap.values()).sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status]
      }
      return b.deploymentCount - a.deploymentCount
    })
  }, [customFilter, deploymentIssues, deployments, isAllClustersSelected, podIssues, selectedClusters])

  const stats = useMemo(() => {
    const namespaceApps = apps.filter((app) => app.type === 'namespace') as AppSummary[]

    return {
      total: namespaceApps.length || apps.length,
      healthy: namespaceApps.filter((app) => app.status === 'healthy').length,
      warning: namespaceApps.filter((app) => app.status === 'warning').length,
      critical: namespaceApps.filter((app) => app.status === 'error').length,
      totalDeployments: deployments.length,
      totalPodIssues: podIssues.length,
      totalDeploymentIssues: deploymentIssues.length,
    }
  }, [apps, deploymentIssues, deployments, podIssues])

  return {
    apps,
    stats,
    selectedClusters,
    isAllClustersSelected,
  }
}
