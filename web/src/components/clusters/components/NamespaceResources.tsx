import { useState, useMemo, useEffect } from 'react'
import { List, GitBranch, Loader2, AlertCircle } from 'lucide-react'
import { usePods, useDeployments, useServices, useJobs, useHPAs, useConfigMaps, useSecrets, useServiceAccounts } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import {
  LB_PROVISIONING_LABEL,
  LB_STATUS_PROVISIONING,
} from '../../../lib/constants/network'
import type { NamespaceResourceItem, ResourceKind } from './resourceHelpers'
import { ResourceListView } from './ResourceListView'
import { ResourceTreeView, type PodsByDeployment } from './ResourceTreeView'

/** Service type string emitted by the backend for LoadBalancer services.
 * Defined as a constant to avoid magic strings. */
const SERVICE_TYPE_LOAD_BALANCER = 'LoadBalancer'

interface NamespaceResourcesProps {
  clusterName: string
  namespace: string
  onClose?: () => void
}

export function NamespaceResources({ clusterName, namespace, onClose }: NamespaceResourcesProps) {
  const { t } = useTranslation()
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
    drillToPVC } = useDrillDownActions()

  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['deployments', 'pods']))
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  // Reset timeout state when cluster or namespace changes, then re-arm
  const LOADING_TIMEOUT_THRESHOLD_MS = 10_000 // Max wait before showing timed-out state
  useEffect(() => {
    setLoadingTimedOut(false)
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, LOADING_TIMEOUT_THRESHOLD_MS)
    return () => clearTimeout(timer)
  }, [clusterName, namespace])

  // Show content as soon as pods and deployments (the most important resources) are loaded
  // Other resources can continue loading in the background
  const isInitialLoading = podsLoading && deploymentsLoading && !loadingTimedOut
  const isPartiallyLoading = (podsLoading || deploymentsLoading || servicesLoading || jobsLoading || hpasLoading || configmapsLoading || secretsLoading || serviceAccountsLoading || pvcsLoading) && !loadingTimedOut

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

  // Map pods to their deployment owners
  const podsByDeployment: PodsByDeployment = (() => {
    const groups: Record<string, typeof pods> = {}
    const standalone: typeof pods = []

    pods.forEach(pod => {
      const matchingDep = deployments.find(dep => pod.name.startsWith(dep.name + '-'))
      if (matchingDep) {
        if (!groups[matchingDep.name]) groups[matchingDep.name] = []
        groups[matchingDep.name].push(pod)
      } else {
        standalone.push(pod)
      }
    })
    return { byDeployment: groups, standalone }
  })()

  // Build flat list of all resources for list view
  const allResources = useMemo(() => {
    const resources: NamespaceResourceItem[] = []

    deployments.forEach(dep => resources.push({
      kind: 'Deployment',
      name: dep.name,
      namespace: dep.namespace,
      status: dep.status,
      statusColor: dep.status === 'running' ? 'green' : dep.status === 'deploying' ? 'blue' : 'red',
      detail: `${dep.readyReplicas}/${dep.replicas}`,
      data: { replicas: dep.replicas, readyReplicas: dep.readyReplicas, image: dep.image, status: dep.status, age: dep.age }
    }))

    pods.forEach(pod => resources.push({
      kind: 'Pod',
      name: pod.name,
      namespace: pod.namespace,
      status: pod.status,
      statusColor: pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red',
      detail: pod.ready,
      data: { status: pod.status, ready: pod.ready, restarts: pod.restarts, node: pod.node, age: pod.age }
    }))

    services.forEach(svc => {
      // Issue #6153: for LoadBalancer services with no ingress IP/
      // hostname assigned yet, display 'Provisioning' instead of an
      // empty string. We treat either the explicit lbStatus flag from
      // the backend OR a LoadBalancer type with a missing externalIP
      // (for older backends that do not set lbStatus) as provisioning.
      const isPendingLB =
        svc.type === SERVICE_TYPE_LOAD_BALANCER &&
        (svc.lbStatus === LB_STATUS_PROVISIONING || !svc.externalIP)
      const externalIPDisplay = isPendingLB
        ? LB_PROVISIONING_LABEL
        : svc.externalIP
      resources.push({
        kind: 'Service',
        name: svc.name,
        namespace: svc.namespace,
        status: svc.type,
        statusColor: 'cyan',
        detail: (svc.ports ?? []).slice(0, 2).join(', '),
        data: {
          type: svc.type,
          clusterIP: svc.clusterIP,
          externalIP: externalIPDisplay,
          endpoints: svc.endpoints,
          lbStatus: svc.lbStatus,
          ports: svc.ports,
          age: svc.age,
        },
      })
    })

    jobs.forEach(job => resources.push({
      kind: 'Job',
      name: job.name,
      namespace: job.namespace,
      status: job.status,
      statusColor: job.status === 'Complete' ? 'green' : job.status === 'Running' ? 'green' : 'red',
      detail: job.completions,
      data: { status: job.status, completions: job.completions, duration: job.duration, age: job.age }
    }))

    hpas.forEach(hpa => resources.push({
      kind: 'HPA',
      name: hpa.name,
      namespace: hpa.namespace,
      status: `${hpa.currentReplicas}/${hpa.minReplicas}-${hpa.maxReplicas}`,
      statusColor: 'purple',
      detail: hpa.reference,
      data: { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas, currentReplicas: hpa.currentReplicas, targetCPU: hpa.targetCPU, currentCPU: hpa.currentCPU, age: hpa.age }
    }))

    configmaps.forEach(cm => resources.push({
      kind: 'ConfigMap',
      name: cm.name,
      namespace: cm.namespace,
      status: `${cm.dataCount} keys`,
      statusColor: 'orange',
      data: { dataCount: cm.dataCount, age: cm.age }
    }))

    secrets.forEach(secret => resources.push({
      kind: 'Secret',
      name: secret.name,
      namespace: secret.namespace,
      status: secret.type,
      statusColor: 'purple',
      detail: `${secret.dataCount} keys`,
      data: { type: secret.type, dataCount: secret.dataCount, age: secret.age }
    }))

    serviceAccounts.forEach(sa => resources.push({
      kind: 'ServiceAccount',
      name: sa.name,
      namespace: sa.namespace,
      status: `${sa.secrets?.length || 0} secrets`,
      statusColor: 'cyan',
      data: { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets, age: sa.age }
    }))

    pvcs.forEach(pvc => resources.push({
      kind: 'PVC',
      name: pvc.name,
      namespace: pvc.namespace,
      status: pvc.status,
      statusColor: pvc.status === 'Bound' ? 'green' : pvc.status === 'Pending' ? 'yellow' : 'red',
      detail: pvc.capacity,
      data: { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity, accessModes: pvc.accessModes, volumeName: pvc.volumeName, age: pvc.age }
    }))

    return resources
  }, [deployments, pods, services, jobs, hpas, configmaps, secrets, serviceAccounts, pvcs])

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

  // Only show full loading screen if nothing has loaded yet
  if (isInitialLoading && pods.length === 0 && deployments.length === 0) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading namespace resources...
      </div>
    )
  }

  // Show timeout message if loading took too long and we still have no data
  if (loadingTimedOut && pods.length === 0 && deployments.length === 0) {
    return (
      <div className="py-4 flex items-center gap-2 text-sm text-yellow-400">
        <AlertCircle className="w-4 h-4" />
        Loading timed out. The cluster may be unreachable or slow to respond.
      </div>
    )
  }

  const hasResources = allResources.length > 0

  return (
    <div className="pt-2">
      {/* View toggle */}
      <div className="flex justify-between items-center pb-2">
        {isPartiallyLoading && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{t('common.loadingMore')}</span>
          </div>
        )}
        {!isPartiallyLoading && (
          <RefreshIndicator
            isRefreshing={podsRefreshing ?? false}
            lastUpdated={podsLastRefresh}
            size="xs"
          />
        )}
        <div className="flex items-center gap-1 p-0.5 rounded bg-secondary/50">
          <button
            onClick={() => setViewMode('list')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
            aria-label="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded transition-colors ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Tree view"
            aria-label="Tree view"
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <ResourceListView resources={allResources} namespace={namespace} onResourceClick={handleResourceClick} />
      ) : (
        <ResourceTreeView
          t={t}
          deployments={deployments}
          deploymentsLoading={deploymentsLoading}
          podsByDeployment={podsByDeployment}
          services={services}
          jobs={jobs}
          hpas={hpas}
          serviceAccounts={serviceAccounts}
          pvcs={pvcs}
          configmaps={configmaps}
          secrets={secrets}
          expandedTypes={expandedTypes}
          toggleType={toggleType}
          expandedItems={expandedItems}
          toggleItem={toggleItem}
          onResourceClick={handleResourceClick}
        />
      )}

      {!hasResources && (
        <div className="text-sm text-muted-foreground text-center py-4">
          No resources found in this namespace
        </div>
      )}
    </div>
  )
}
