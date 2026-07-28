import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, ChevronDown, Box, Layers, Network, List, GitBranch, Activity, Briefcase, Lock, Settings, Loader2, User, HardDrive, AlertCircle } from 'lucide-react'
import { usePods, useDeployments, useServices, useJobs, useHPAs, useConfigMaps, useSecrets, useServiceAccounts } from '../../../hooks/useMCP'
import { useCachedPVCs } from '../../../hooks/useCachedData'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'
import { RefreshIndicator } from '../../ui/RefreshIndicator'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'
import { ResourceTypeAccordion } from './ResourceTypeAccordion'
import { SimpleResourceRow } from './SimpleResourceRow'
import { buildAllResources, getStatusBgColor, type ResourceKind } from './namespaceResourceUtils'

interface NamespaceResourcesProps {
  clusterName: string
  namespace: string
  onClose?: () => void
}

/** Resource kind icon mapping for the list view. */
function getKindIcon(kind: ResourceKind) {
  switch (kind) {
    case 'Pod': return <Box className="w-3.5 h-3.5 text-blue-400" />
    case 'Deployment': return <Layers className="w-3.5 h-3.5 text-purple-400" />
    case 'Service': return <Network className="w-3.5 h-3.5 text-cyan-400" />
    case 'Job': return <Briefcase className="w-3.5 h-3.5 text-yellow-400" />
    case 'HPA': return <Activity className="w-3.5 h-3.5 text-purple-400" />
    case 'ConfigMap': return <Settings className="w-3.5 h-3.5 text-orange-400" />
    case 'Secret': return <Lock className="w-3.5 h-3.5 text-purple-400" />
    case 'ServiceAccount': return <User className="w-3.5 h-3.5 text-cyan-400" />
    case 'PVC': return <HardDrive className="w-3.5 h-3.5 text-green-400" />
  }
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
  const podsByDeployment = (() => {
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
  const allResources = useMemo(
    () => buildAllResources({ deployments, pods, services, jobs, hpas, configmaps, secrets, serviceAccounts, pvcs }),
    [deployments, pods, services, jobs, hpas, configmaps, secrets, serviceAccounts, pvcs],
  )

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
        /* List View - Individual resources with icons */
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {allResources.slice(0, 50).map((resource, idx) => (
            <div
              key={`${resource.kind}-${resource.name}-${idx}`}
              className="flex items-center justify-between p-2 min-h-11 rounded bg-card/30 text-sm group hover:bg-card/50 transition-colors cursor-pointer"
              onClick={() => handleResourceClick(resource.kind, resource.name, resource.namespace || namespace, resource.data)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {getKindIcon(resource.kind)}
                <span className="text-foreground truncate">{resource.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs shrink-0">
                {resource.detail && <span className="text-muted-foreground">{resource.detail}</span>}
                {resource.status && (
                  <span className={`px-1.5 py-0.5 rounded ${getStatusBgColor(resource.statusColor)}`}>
                    {resource.status}
                  </span>
                )}
                <ChevronRight className="w-3 h-3 text-primary" />
              </div>
            </div>
          ))}
          {allResources.length > 50 && <div className="text-xs text-muted-foreground text-center py-2">+{allResources.length - 50} more resources</div>}
        </div>
      ) : (
        /* Tree View */
        <div className="font-mono text-xs max-h-[300px] overflow-y-auto">
          <div className="border-l border-border/50 pl-2">
            {deployments.length > 0 && (
              <ResourceTypeAccordion
                typeKey="deployments"
                isExpanded={expandedTypes.has('deployments')}
                onToggle={toggleType}
                disabled={deploymentsLoading}
                badgeColor="purple"
                badgeIcon={<Layers className="w-3 h-3" />}
                label="Deploy"
                countLabel={`(${deployments.length})`}
              >
                {deployments.map((dep) => {
                  const depPods = podsByDeployment.byDeployment[dep.name] || []
                  const isExpanded = expandedItems.has(`dep-${dep.name}`)
                  return (
                    <div key={dep.name} className="mb-0.5">
                      <div className="flex items-center gap-2 min-h-11 px-1 rounded hover:bg-card/30">
                        <button onClick={() => depPods.length > 0 && toggleItem(`dep-${dep.name}`)} className="min-h-11 min-w-[44px] flex items-center justify-center">
                          {depPods.length > 0 ? (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />) : <span className="w-3" />}
                        </button>
                        <button
                          onClick={() => handleResourceClick('Deployment', dep.name, dep.namespace, { replicas: dep.replicas, readyReplicas: dep.readyReplicas, status: dep.status })}
                          className="flex items-center gap-2 flex-1 min-h-11"
                        >
                          <span className="text-foreground">{dep.name}</span>
                          <span className={`text-xs ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-orange-400'}`}>{dep.readyReplicas}/{dep.replicas}</span>
                          {depPods.length > 0 && <span className="text-xs text-muted-foreground">({depPods.length} pods)</span>}
                          <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                        </button>
                      </div>
                      {isExpanded && depPods.length > 0 && (
                        <div className="ml-4 border-l border-border/30 pl-2">
                          {depPods.slice(0, 10).map(pod => (
                            <SimpleResourceRow
                              key={pod.name}
                              icon={<Box className="w-3 h-3 text-blue-400" />}
                              name={pod.name}
                              primaryText={pod.status}
                              primaryClassName={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
                              onClick={() => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                            />
                          ))}
                          {depPods.length > 10 && <div className="text-xs text-muted-foreground pl-5">+{depPods.length - 10} more</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </ResourceTypeAccordion>
            )}

            {podsByDeployment.standalone.length > 0 && (
              <ResourceTypeAccordion
                typeKey="pods"
                isExpanded={expandedTypes.has('pods')}
                onToggle={toggleType}
                badgeColor="blue"
                badgeIcon={<Box className="w-3 h-3" />}
                label={t('common.pod')}
                countLabel={`Standalone (${podsByDeployment.standalone.length})`}
              >
                {podsByDeployment.standalone.slice(0, 20).map(pod => (
                  <SimpleResourceRow
                    key={pod.name}
                    icon={<Box className="w-3 h-3 text-blue-400" />}
                    name={pod.name}
                    primaryText={pod.status}
                    primaryClassName={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
                    onClick={() => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                  />
                ))}
                {podsByDeployment.standalone.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{podsByDeployment.standalone.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {services.length > 0 && (
              <ResourceTypeAccordion
                typeKey="services"
                isExpanded={expandedTypes.has('services')}
                onToggle={toggleType}
                badgeColor="cyan"
                badgeIcon={<Network className="w-3 h-3" />}
                label="Svc"
                countLabel={`(${services.length})`}
              >
                {services.map(svc => (
                  <SimpleResourceRow
                    key={svc.name}
                    icon={<Network className="w-3 h-3 text-cyan-400" />}
                    name={svc.name}
                    primaryText={svc.type}
                    primaryClassName="text-cyan-400"
                    secondaryText={svc.ports && svc.ports.length > 0 ? svc.ports[0] : undefined}
                    onClick={() => handleResourceClick('Service', svc.name, svc.namespace, { type: svc.type, clusterIP: svc.clusterIP, ports: svc.ports })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {jobs.length > 0 && (
              <ResourceTypeAccordion
                typeKey="jobs"
                isExpanded={expandedTypes.has('jobs')}
                onToggle={toggleType}
                badgeColor="yellow"
                badgeIcon={<Briefcase className="w-3 h-3" />}
                label="Job"
                countLabel={`(${jobs.length})`}
              >
                {jobs.map(job => (
                  <SimpleResourceRow
                    key={job.name}
                    icon={<Briefcase className="w-3 h-3 text-yellow-400" />}
                    name={job.name}
                    primaryText={job.status}
                    primaryClassName={job.status === 'Complete' ? 'text-green-400' : job.status === 'Running' ? 'text-green-400' : 'text-red-400'}
                    secondaryText={job.completions}
                    onClick={() => handleResourceClick('Job', job.name, job.namespace, { status: job.status, completions: job.completions })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {hpas.length > 0 && (
              <ResourceTypeAccordion
                typeKey="hpas"
                isExpanded={expandedTypes.has('hpas')}
                onToggle={toggleType}
                badgeColor="purple"
                badgeIcon={<Activity className="w-3 h-3" />}
                label={<TechnicalAcronym term="HPA">HPA</TechnicalAcronym>}
                countLabel={`(${hpas.length})`}
              >
                {hpas.map(hpa => (
                  <SimpleResourceRow
                    key={hpa.name}
                    icon={<Activity className="w-3 h-3 text-purple-400" />}
                    name={hpa.name}
                    primaryText={`${hpa.currentReplicas}/${hpa.minReplicas}-${hpa.maxReplicas}`}
                    primaryClassName="text-purple-400"
                    secondaryText={`→ ${hpa.reference}`}
                    onClick={() => handleResourceClick('HPA', hpa.name, hpa.namespace, { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas })}
                  />
                ))}
              </ResourceTypeAccordion>
            )}

            {serviceAccounts.length > 0 && (
              <ResourceTypeAccordion
                typeKey="serviceaccounts"
                isExpanded={expandedTypes.has('serviceaccounts')}
                onToggle={toggleType}
                badgeColor="cyan"
                badgeIcon={<User className="w-3 h-3" />}
                label="SA"
                countLabel={`(${serviceAccounts.length})`}
              >
                {serviceAccounts.slice(0, 20).map(sa => (
                  <SimpleResourceRow
                    key={sa.name}
                    icon={<User className="w-3 h-3 text-cyan-400" />}
                    name={sa.name}
                    secondaryText={`${sa.secrets?.length || 0} secrets`}
                    onClick={() => handleResourceClick('ServiceAccount', sa.name, sa.namespace, { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets })}
                  />
                ))}
                {serviceAccounts.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{serviceAccounts.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {pvcs.length > 0 && (
              <ResourceTypeAccordion
                typeKey="pvcs"
                isExpanded={expandedTypes.has('pvcs')}
                onToggle={toggleType}
                badgeColor="green"
                badgeIcon={<HardDrive className="w-3 h-3" />}
                label={<TechnicalAcronym term="PVC">PVC</TechnicalAcronym>}
                countLabel={`(${pvcs.length})`}
              >
                {pvcs.slice(0, 20).map(pvc => (
                  <SimpleResourceRow
                    key={pvc.name}
                    icon={<HardDrive className="w-3 h-3 text-green-400" />}
                    name={pvc.name}
                    primaryText={pvc.status}
                    primaryClassName={pvc.status === 'Bound' ? 'text-green-400' : pvc.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}
                    secondaryText={pvc.capacity}
                    onClick={() => handleResourceClick('PVC', pvc.name, pvc.namespace, { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity })}
                  />
                ))}
                {pvcs.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{pvcs.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {configmaps.length > 0 && (
              <ResourceTypeAccordion
                typeKey="configmaps"
                isExpanded={expandedTypes.has('configmaps')}
                onToggle={toggleType}
                badgeColor="orange"
                badgeIcon={<Settings className="w-3 h-3" />}
                label="CM"
                countLabel={`(${configmaps.length})`}
              >
                {configmaps.slice(0, 20).map(cm => (
                  <SimpleResourceRow
                    key={cm.name}
                    icon={<Settings className="w-3 h-3 text-orange-400" />}
                    name={cm.name}
                    secondaryText={`${cm.dataCount} keys`}
                    onClick={() => handleResourceClick('ConfigMap', cm.name, cm.namespace, { dataCount: cm.dataCount })}
                  />
                ))}
                {configmaps.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{configmaps.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}

            {secrets.length > 0 && (
              <ResourceTypeAccordion
                typeKey="secrets"
                isExpanded={expandedTypes.has('secrets')}
                onToggle={toggleType}
                badgeColor="purple"
                badgeIcon={<Lock className="w-3 h-3" />}
                label="Secret"
                countLabel={`(${secrets.length})`}
              >
                {secrets.slice(0, 20).map(secret => (
                  <SimpleResourceRow
                    key={secret.name}
                    icon={<Lock className="w-3 h-3 text-purple-400" />}
                    name={secret.name}
                    primaryText={secret.type}
                    primaryClassName="text-purple-400"
                    secondaryText={`${secret.dataCount} keys`}
                    onClick={() => handleResourceClick('Secret', secret.name, secret.namespace, { type: secret.type, dataCount: secret.dataCount })}
                  />
                ))}
                {secrets.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{secrets.length - 20} more</div>}
              </ResourceTypeAccordion>
            )}
          </div>
        </div>
      )}

      {!hasResources && (
        <div className="text-sm text-muted-foreground text-center py-4">
          No resources found in this namespace
        </div>
      )}
    </div>
  )
}

