import { useState, useMemo, useEffect } from 'react'
import { ChevronRight, ChevronDown, Box, Layers, Network, List, GitBranch, Activity, Briefcase, Lock, Settings, Loader2, User, HardDrive, AlertCircle } from 'lucide-react'
import { usePods, useDeployments, useServices, useJobs, useHPAs, useConfigMaps, useSecrets, useServiceAccounts, usePVCs } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { useTranslation } from 'react-i18next'

type ResourceKind = 'Pod' | 'Deployment' | 'Service' | 'Job' | 'HPA' | 'ConfigMap' | 'Secret' | 'ServiceAccount' | 'PVC'

interface NamespaceResourcesProps {
  clusterName: string
  namespace: string
  onClose?: () => void
}

export function NamespaceResources({ clusterName, namespace, onClose }: NamespaceResourcesProps) {
  const { t } = useTranslation()
  const { pods, isLoading: podsLoading } = usePods(clusterName, namespace, 'name', 100)
  const { deployments, isLoading: deploymentsLoading } = useDeployments(clusterName, namespace)
  const { services, isLoading: servicesLoading } = useServices(clusterName, namespace)
  const { jobs, isLoading: jobsLoading } = useJobs(clusterName, namespace)
  const { hpas, isLoading: hpasLoading } = useHPAs(clusterName, namespace)
  const { configmaps, isLoading: configmapsLoading } = useConfigMaps(clusterName, namespace)
  const { secrets, isLoading: secretsLoading } = useSecrets(clusterName, namespace)
  const { serviceAccounts, isLoading: serviceAccountsLoading } = useServiceAccounts(clusterName, namespace)
  const { pvcs, isLoading: pvcsLoading } = usePVCs(clusterName, namespace)

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

  // Timeout after 10 seconds to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingTimedOut(true)
    }, 10000)
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
  const podsByDeployment = useMemo(() => {
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
  }, [pods, deployments])

  // Build flat list of all resources for list view
  const allResources = useMemo(() => {
    const resources: Array<{
      kind: ResourceKind
      name: string
      namespace?: string
      status?: string
      statusColor: string
      detail?: string
      data?: Record<string, unknown>
    }> = []

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

    services.forEach(svc => resources.push({
      kind: 'Service',
      name: svc.name,
      namespace: svc.namespace,
      status: svc.type,
      statusColor: 'cyan',
      detail: svc.ports?.slice(0, 2).join(', '),
      data: { type: svc.type, clusterIP: svc.clusterIP, externalIP: svc.externalIP, ports: svc.ports, age: svc.age }
    }))

    jobs.forEach(job => resources.push({
      kind: 'Job',
      name: job.name,
      namespace: job.namespace,
      status: job.status,
      statusColor: job.status === 'Complete' ? 'green' : job.status === 'Running' ? 'blue' : 'red',
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
      statusColor: 'pink',
      detail: `${secret.dataCount} keys`,
      data: { type: secret.type, dataCount: secret.dataCount, age: secret.age }
    }))

    serviceAccounts.forEach(sa => resources.push({
      kind: 'ServiceAccount',
      name: sa.name,
      namespace: sa.namespace,
      status: `${sa.secrets?.length || 0} secrets`,
      statusColor: 'teal',
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

  // Resource kind icon mapping
  const getKindIcon = (kind: ResourceKind) => {
    switch (kind) {
      case 'Pod': return <Box className="w-3.5 h-3.5 text-blue-400" />
      case 'Deployment': return <Layers className="w-3.5 h-3.5 text-purple-400" />
      case 'Service': return <Network className="w-3.5 h-3.5 text-cyan-400" />
      case 'Job': return <Briefcase className="w-3.5 h-3.5 text-amber-400" />
      case 'HPA': return <Activity className="w-3.5 h-3.5 text-violet-400" />
      case 'ConfigMap': return <Settings className="w-3.5 h-3.5 text-orange-400" />
      case 'Secret': return <Lock className="w-3.5 h-3.5 text-pink-400" />
      case 'ServiceAccount': return <User className="w-3.5 h-3.5 text-teal-400" />
      case 'PVC': return <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
    }
  }

  const getStatusBgColor = (color: string) => {
    switch (color) {
      case 'green': return 'bg-green-500/20 text-green-400'
      case 'blue': return 'bg-blue-500/20 text-blue-400'
      case 'yellow': return 'bg-yellow-500/20 text-yellow-400'
      case 'red': return 'bg-red-500/20 text-red-400'
      case 'cyan': return 'bg-cyan-500/20 text-cyan-400'
      case 'purple': return 'bg-purple-500/20 text-purple-400'
      case 'orange': return 'bg-orange-500/20 text-orange-400'
      case 'pink': return 'bg-pink-500/20 text-pink-400'
      case 'teal': return 'bg-teal-500/20 text-teal-400'
      case 'emerald': return 'bg-emerald-500/20 text-emerald-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
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
            <span>Loading more...</span>
          </div>
        )}
        {!isPartiallyLoading && <div />}
        <div className="flex items-center gap-1 p-0.5 rounded bg-secondary/50">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            title="Tree view"
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
              className="flex items-center justify-between p-2 rounded bg-card/30 text-sm group hover:bg-card/50 transition-colors cursor-pointer"
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
              <div className="mb-1">
                <button onClick={() => toggleType('deployments')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('deployments') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium"><Layers className="w-3 h-3" />Deploy</span>
                  <span className="text-muted-foreground">({deployments.length})</span>
                </button>
                {expandedTypes.has('deployments') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {deployments.map((dep) => {
                      const depPods = podsByDeployment.byDeployment[dep.name] || []
                      const isExpanded = expandedItems.has(`dep-${dep.name}`)
                      return (
                        <div key={dep.name} className="mb-0.5">
                          <div className="flex items-center gap-2 py-1 px-1 rounded hover:bg-card/30">
                            <button onClick={() => depPods.length > 0 && toggleItem(`dep-${dep.name}`)} className="flex items-center">
                              {depPods.length > 0 ? (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />) : <span className="w-3" />}
                            </button>
                            <button
                              onClick={() => handleResourceClick('Deployment', dep.name, dep.namespace, { replicas: dep.replicas, readyReplicas: dep.readyReplicas, status: dep.status })}
                              className="flex items-center gap-2 flex-1"
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
                                <div
                                  key={pod.name}
                                  className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                                  onClick={() => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                                >
                                  <Box className="w-3 h-3 text-blue-400" />
                                  <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                                  <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
                                  <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                                </div>
                              ))}
                              {depPods.length > 10 && <div className="text-xs text-muted-foreground pl-5">+{depPods.length - 10} more</div>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {podsByDeployment.standalone.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('pods')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('pods') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium"><Box className="w-3 h-3" />{t('common.pod')}</span>
                  <span className="text-muted-foreground">Standalone ({podsByDeployment.standalone.length})</span>
                </button>
                {expandedTypes.has('pods') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {podsByDeployment.standalone.slice(0, 20).map(pod => (
                      <div
                        key={pod.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('Pod', pod.name, pod.namespace, { status: pod.status, restarts: pod.restarts })}
                      >
                        <Box className="w-3 h-3 text-blue-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                        <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                    {podsByDeployment.standalone.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{podsByDeployment.standalone.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            {services.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('services')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('services') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-medium"><Network className="w-3 h-3" />Svc</span>
                  <span className="text-muted-foreground">({services.length})</span>
                </button>
                {expandedTypes.has('services') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {services.map(svc => (
                      <div
                        key={svc.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('Service', svc.name, svc.namespace, { type: svc.type, clusterIP: svc.clusterIP, ports: svc.ports })}
                      >
                        <Network className="w-3 h-3 text-cyan-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={svc.name}>{svc.name}</span>
                        <span className="text-cyan-400">{svc.type}</span>
                        {svc.ports && svc.ports.length > 0 && <span className="text-muted-foreground">{svc.ports[0]}</span>}
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {jobs.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('jobs')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('jobs') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium"><Briefcase className="w-3 h-3" />Job</span>
                  <span className="text-muted-foreground">({jobs.length})</span>
                </button>
                {expandedTypes.has('jobs') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {jobs.map(job => (
                      <div
                        key={job.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('Job', job.name, job.namespace, { status: job.status, completions: job.completions })}
                      >
                        <Briefcase className="w-3 h-3 text-amber-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={job.name}>{job.name}</span>
                        <span className={job.status === 'Complete' ? 'text-green-400' : job.status === 'Running' ? 'text-blue-400' : 'text-red-400'}>{job.status}</span>
                        <span className="text-muted-foreground">{job.completions}</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hpas.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('hpas')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('hpas') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium"><Activity className="w-3 h-3" />HPA</span>
                  <span className="text-muted-foreground">({hpas.length})</span>
                </button>
                {expandedTypes.has('hpas') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {hpas.map(hpa => (
                      <div
                        key={hpa.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('HPA', hpa.name, hpa.namespace, { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas })}
                      >
                        <Activity className="w-3 h-3 text-violet-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={hpa.name}>{hpa.name}</span>
                        <span className="text-violet-400">{hpa.currentReplicas}/{hpa.minReplicas}-{hpa.maxReplicas}</span>
                        <span className="text-muted-foreground">→ {hpa.reference}</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {serviceAccounts.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('serviceaccounts')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('serviceaccounts') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-400 font-medium"><User className="w-3 h-3" />SA</span>
                  <span className="text-muted-foreground">({serviceAccounts.length})</span>
                </button>
                {expandedTypes.has('serviceaccounts') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {serviceAccounts.slice(0, 20).map(sa => (
                      <div
                        key={sa.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('ServiceAccount', sa.name, sa.namespace, { secrets: sa.secrets, imagePullSecrets: sa.imagePullSecrets })}
                      >
                        <User className="w-3 h-3 text-teal-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={sa.name}>{sa.name}</span>
                        <span className="text-muted-foreground">{sa.secrets?.length || 0} secrets</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                    {serviceAccounts.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{serviceAccounts.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            {pvcs.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('pvcs')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('pvcs') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium"><HardDrive className="w-3 h-3" />PVC</span>
                  <span className="text-muted-foreground">({pvcs.length})</span>
                </button>
                {expandedTypes.has('pvcs') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {pvcs.slice(0, 20).map(pvc => (
                      <div
                        key={pvc.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('PVC', pvc.name, pvc.namespace, { status: pvc.status, storageClass: pvc.storageClass, capacity: pvc.capacity })}
                      >
                        <HardDrive className="w-3 h-3 text-emerald-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={pvc.name}>{pvc.name}</span>
                        <span className={pvc.status === 'Bound' ? 'text-green-400' : pvc.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pvc.status}</span>
                        {pvc.capacity && <span className="text-muted-foreground">{pvc.capacity}</span>}
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                    {pvcs.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{pvcs.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            {configmaps.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('configmaps')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('configmaps') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium"><Settings className="w-3 h-3" />CM</span>
                  <span className="text-muted-foreground">({configmaps.length})</span>
                </button>
                {expandedTypes.has('configmaps') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {configmaps.slice(0, 20).map(cm => (
                      <div
                        key={cm.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('ConfigMap', cm.name, cm.namespace, { dataCount: cm.dataCount })}
                      >
                        <Settings className="w-3 h-3 text-orange-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={cm.name}>{cm.name}</span>
                        <span className="text-muted-foreground">{cm.dataCount} keys</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                    {configmaps.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{configmaps.length - 20} more</div>}
                  </div>
                )}
              </div>
            )}

            {secrets.length > 0 && (
              <div className="mb-1">
                <button onClick={() => toggleType('secrets')} className="flex items-center gap-1.5 py-1 hover:bg-card/30 rounded px-1 w-full text-left">
                  {expandedTypes.has('secrets') ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 font-medium"><Lock className="w-3 h-3" />Secret</span>
                  <span className="text-muted-foreground">({secrets.length})</span>
                </button>
                {expandedTypes.has('secrets') && (
                  <div className="ml-4 border-l border-border/30 pl-2">
                    {secrets.slice(0, 20).map(secret => (
                      <div
                        key={secret.name}
                        className="flex items-center gap-2 py-0.5 px-1 text-xs cursor-pointer hover:bg-card/30 rounded"
                        onClick={() => handleResourceClick('Secret', secret.name, secret.namespace, { type: secret.type, dataCount: secret.dataCount })}
                      >
                        <Lock className="w-3 h-3 text-pink-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={secret.name}>{secret.name}</span>
                        <span className="text-pink-400">{secret.type}</span>
                        <span className="text-muted-foreground">{secret.dataCount} keys</span>
                        <ChevronRight className="w-3 h-3 text-primary ml-auto" />
                      </div>
                    ))}
                    {secrets.length > 20 && <div className="text-xs text-muted-foreground pl-5">+{secrets.length - 20} more</div>}
                  </div>
                )}
              </div>
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
