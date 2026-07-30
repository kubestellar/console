import { useState, useMemo, useEffect } from 'react'
import { usePods, useDeployments, useServices, useJobs, useHPAs, useConfigMaps, useSecrets, useServiceAccounts } from '../../../hooks/useMCP'
import type { PodInfo, Deployment, Service, Job, HPA, ConfigMap, Secret, ServiceAccount, PVC } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { buildAllResources, type ResourceKind, type NamespaceResourceRow } from './namespaceResourceUtils'

const LOADING_TIMEOUT_THRESHOLD_MS = 10_000

export interface PodsByDeployment {
  byDeployment: Record<string, PodInfo[]>
  standalone: PodInfo[]
}

export interface UseNamespaceResourcesResult {
  pods: PodInfo[]
  deployments: Deployment[]
  services: Service[]
  jobs: Job[]
  hpas: HPA[]
  configmaps: ConfigMap[]
  secrets: Secret[]
  serviceAccounts: ServiceAccount[]
  pvcs: PVC[]
  allResources: NamespaceResourceRow[]
  podsByDeployment: PodsByDeployment
  isInitialLoading: boolean
  isPartiallyLoading: boolean
  isTimedOut: boolean
  deploymentsLoading: boolean
  podsRefreshing: boolean
  podsLastRefresh: Date | null
  viewMode: 'list' | 'tree'
  setViewMode: (mode: 'list' | 'tree') => void
  expandedTypes: Set<string>
  expandedItems: Set<string>
  toggleType: (type: string) => void
  toggleItem: (item: string) => void
  handleResourceClick: (kind: ResourceKind, name: string, ns: string, data?: Record<string, unknown>) => void
}

export function useNamespaceResources(
  clusterName: string,
  namespace: string,
  onClose?: () => void,
): UseNamespaceResourcesResult {
  const { pods, isLoading: podsLoading, isRefreshing: podsRefreshing, lastRefresh: podsLastRefresh } = usePods(clusterName, namespace, 'name', 100)
  const { deployments, isLoading: deploymentsLoading } = useDeployments(clusterName, namespace)
  const { services, isLoading: servicesLoading } = useServices(clusterName, namespace)
  const { jobs, isLoading: jobsLoading } = useJobs(clusterName, namespace)
  const { hpas, isLoading: hpasLoading } = useHPAs(clusterName, namespace)
  const { configmaps, isLoading: configmapsLoading } = useConfigMaps(clusterName, namespace)
  const { secrets, isLoading: secretsLoading } = useSecrets(clusterName, namespace)
  const { serviceAccounts, isLoading: serviceAccountsLoading } = useServiceAccounts(clusterName, namespace)
  const { pvcs, isLoading: pvcsLoading } = useCachedPVCs(clusterName, namespace)

  const {
    drillToPod,
    drillToDeployment,
    drillToService,
    drillToJob,
    drillToHPA,
    drillToConfigMap,
    drillToSecret,
    drillToServiceAccount,
    drillToPVC,
  } = useDrillDownActions()

  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['deployments', 'pods']))
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  // Reset timeout state when cluster or namespace changes, then re-arm
  useEffect(() => {
    setLoadingTimedOut(false)
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, LOADING_TIMEOUT_THRESHOLD_MS)
    return () => clearTimeout(timer)
  }, [clusterName, namespace])

  // Show content as soon as pods and deployments (the most important resources) are loaded
  const isInitialLoading = podsLoading && deploymentsLoading && !loadingTimedOut
  const isPartiallyLoading = (
    podsLoading || deploymentsLoading || servicesLoading || jobsLoading ||
    hpasLoading || configmapsLoading || secretsLoading || serviceAccountsLoading || pvcsLoading
  ) && !loadingTimedOut

  // Map pods to their deployment owners
  const podsByDeployment = useMemo<PodsByDeployment>(() => {
    const groups: Record<string, PodInfo[]> = {}
    const standalone: PodInfo[] = []
    ;(pods || []).forEach(pod => {
      const matchingDep = (deployments || []).find(dep => pod.name.startsWith(dep.name + '-'))
      if (matchingDep) {
        if (!groups[matchingDep.name]) groups[matchingDep.name] = []
        groups[matchingDep.name].push(pod)
      } else {
        standalone.push(pod)
      }
    })
    return { byDeployment: groups, standalone }
  }, [pods, deployments])

  // Build flat list of all resources for list view
  const allResources = useMemo(
    () => buildAllResources({ deployments, pods, services, jobs, hpas, configmaps, secrets, serviceAccounts, pvcs }),
    [deployments, pods, services, jobs, hpas, configmaps, secrets, serviceAccounts, pvcs],
  )

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const toggleItem = (item: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })
  }

  const handleResourceClick = (kind: ResourceKind, name: string, ns: string, data?: Record<string, unknown>) => {
    switch (kind) {
      case 'Pod':
        drillToPod(clusterName, ns, name, data)
        break
      case 'Deployment':
        drillToDeployment(clusterName, ns, name, data)
        break
      case 'Service':
        drillToService(clusterName, ns, name, data)
        break
      case 'Job':
        drillToJob(clusterName, ns, name, data)
        break
      case 'HPA':
        drillToHPA(clusterName, ns, name, data)
        break
      case 'ConfigMap':
        drillToConfigMap(clusterName, ns, name, data)
        break
      case 'Secret':
        drillToSecret(clusterName, ns, name, data)
        break
      case 'ServiceAccount':
        drillToServiceAccount(clusterName, ns, name, data)
        break
      case 'PVC':
        drillToPVC(clusterName, ns, name, data)
        break
    }
    if (onClose) onClose()
  }

  return {
    pods,
    deployments,
    services,
    jobs,
    hpas,
    configmaps,
    secrets,
    serviceAccounts,
    pvcs,
    allResources,
    podsByDeployment,
    isInitialLoading,
    isPartiallyLoading,
    isTimedOut: loadingTimedOut,
    deploymentsLoading,
    podsRefreshing: podsRefreshing ?? false,
    podsLastRefresh: podsLastRefresh ?? null,
    viewMode,
    setViewMode,
    expandedTypes,
    expandedItems,
    toggleType,
    toggleItem,
    handleResourceClick,
  }
}
