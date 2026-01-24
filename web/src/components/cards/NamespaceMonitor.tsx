import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Layers, ChevronRight, ChevronDown, Server, Box, Network, HardDrive,
  FileText, FileKey, Clock, Container, Search, RefreshCw, Plus, Minus,
  AlertTriangle, Eye, X, Activity
} from 'lucide-react'
import {
  useClusters, useNamespaces, useDeployments, useServices, usePVCs,
  usePods, useConfigMaps, useSecrets, useJobs
} from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { RefreshButton } from '../ui/RefreshIndicator'
import { CardComponentProps } from './cardRegistry'

// Resource types to monitor
type ResourceType = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'pvcs' | 'jobs'

// Change types for animations
type ChangeType = 'added' | 'modified' | 'deleted' | 'error' | null

interface ResourceChange {
  type: ChangeType
  timestamp: number
  resourceType: ResourceType
  name: string
  namespace: string
  cluster: string
  details?: string
}

// Track resource state for change detection
interface ResourceSnapshot {
  key: string
  name: string
  namespace: string
  cluster: string
  status?: string
  replicas?: number
  readyReplicas?: number
}

// Resource item types for the namespace data map
interface PodItem { name: string; namespace: string; status: string; restarts: number }
interface DeploymentItem { name: string; namespace: string; replicas: number; readyReplicas: number; status?: string }
interface ServiceItem { name: string; namespace: string; type: string }
interface ConfigMapItem { name: string; namespace: string; dataCount?: number }
interface SecretItem { name: string; namespace: string; type?: string }
interface PVCItem { name: string; namespace: string; status: string }
interface JobItem { name: string; namespace: string; status: string }

interface NamespaceData {
  pods: PodItem[]
  deployments: DeploymentItem[]
  services: ServiceItem[]
  configmaps: ConfigMapItem[]
  secrets: SecretItem[]
  pvcs: PVCItem[]
  jobs: JobItem[]
  hasIssues: boolean
}

// Icons for resource types
const ResourceIcons: Record<ResourceType, typeof Container> = {
  pods: Container,
  deployments: Box,
  services: Network,
  configmaps: FileText,
  secrets: FileKey,
  pvcs: HardDrive,
  jobs: Clock,
}

// Colors for resource types
const ResourceColors: Record<ResourceType, string> = {
  pods: 'text-teal-400',
  deployments: 'text-green-400',
  services: 'text-blue-400',
  configmaps: 'text-orange-400',
  secrets: 'text-red-400',
  pvcs: 'text-emerald-400',
  jobs: 'text-amber-400',
}

// Animation classes for changes
const ChangeAnimations: Record<Exclude<ChangeType, null>, string> = {
  added: 'animate-pulse bg-green-500/20 border-green-500/50',
  modified: 'animate-pulse bg-yellow-500/20 border-yellow-500/50',
  deleted: 'animate-pulse bg-red-500/20 border-red-500/50 opacity-50',
  error: 'animate-pulse bg-red-500/30 border-red-500/60',
}

export function NamespaceMonitor({ config: _config }: CardComponentProps) {
  const { clusters, isRefreshing, refetch: refetchClusters, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { selectedClusters, isAllClustersSelected } = useGlobalFilters()
  const { drillToNamespace, drillToPod, drillToDeployment, drillToService, drillToPVC } = useDrillDownActions()

  // UI state
  const [searchFilter, setSearchFilter] = useState('')
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set())
  const [expandedNamespaces, setExpandedNamespaces] = useState<Set<string>>(new Set())
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)
  const [activeResourceTypes, setActiveResourceTypes] = useState<Set<ResourceType>>(
    new Set(['pods', 'deployments', 'services'])
  )

  // Change tracking
  const [recentChanges, setRecentChanges] = useState<ResourceChange[]>([])
  const [showChangesPanel, setShowChangesPanel] = useState(false)
  const previousSnapshotsRef = useRef<Map<string, ResourceSnapshot>>(new Map())
  const changeTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Resource modal
  const [modalResource, setModalResource] = useState<{
    type: ResourceType
    name: string
    namespace: string
    cluster: string
  } | null>(null)

  // Get filtered clusters
  const filteredClusters = useMemo(() => {
    let result = clusters.filter(c => c.reachable !== false)
    if (!isAllClustersSelected) {
      result = result.filter(c => selectedClusters.includes(c.name))
    }
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(query))
    }
    return result
  }, [clusters, selectedClusters, isAllClustersSelected, searchFilter])

  // Fetch data for selected cluster
  const { namespaces } = useNamespaces(selectedCluster || undefined)
  const { deployments } = useDeployments(selectedCluster || undefined)
  const { services } = useServices(selectedCluster || undefined)
  const { pvcs } = usePVCs(selectedCluster || undefined)
  const { pods } = usePods(selectedCluster || undefined, undefined, 'name', 500)
  const { configmaps } = useConfigMaps(selectedCluster || undefined)
  const { secrets } = useSecrets(selectedCluster || undefined)
  const { jobs } = useJobs(selectedCluster || undefined)

  // Build snapshots and detect changes
  useEffect(() => {
    if (!selectedCluster) return

    const currentSnapshots = new Map<string, ResourceSnapshot>()
    const newChanges: ResourceChange[] = []

    // Process pods
    pods?.forEach(pod => {
      const key = `${selectedCluster}:${pod.namespace}:pod:${pod.name}`
      currentSnapshots.set(key, {
        key,
        name: pod.name,
        namespace: pod.namespace,
        cluster: selectedCluster,
        status: pod.status,
      })
    })

    // Process deployments
    deployments?.forEach(dep => {
      const key = `${selectedCluster}:${dep.namespace}:deployment:${dep.name}`
      currentSnapshots.set(key, {
        key,
        name: dep.name,
        namespace: dep.namespace,
        cluster: selectedCluster,
        status: dep.status,
        replicas: dep.replicas,
        readyReplicas: dep.readyReplicas,
      })
    })

    // Process services
    services?.forEach(svc => {
      const key = `${selectedCluster}:${svc.namespace}:service:${svc.name}`
      currentSnapshots.set(key, {
        key,
        name: svc.name,
        namespace: svc.namespace,
        cluster: selectedCluster,
      })
    })

    // Process pvcs
    pvcs?.forEach(pvc => {
      const key = `${selectedCluster}:${pvc.namespace}:pvc:${pvc.name}`
      currentSnapshots.set(key, {
        key,
        name: pvc.name,
        namespace: pvc.namespace,
        cluster: selectedCluster,
        status: pvc.status,
      })
    })

    // Process configmaps
    configmaps?.forEach(cm => {
      const key = `${selectedCluster}:${cm.namespace}:configmap:${cm.name}`
      currentSnapshots.set(key, {
        key,
        name: cm.name,
        namespace: cm.namespace,
        cluster: selectedCluster,
      })
    })

    // Process secrets
    secrets?.forEach(secret => {
      const key = `${selectedCluster}:${secret.namespace}:secret:${secret.name}`
      currentSnapshots.set(key, {
        key,
        name: secret.name,
        namespace: secret.namespace,
        cluster: selectedCluster,
      })
    })

    // Process jobs
    jobs?.forEach(job => {
      const key = `${selectedCluster}:${job.namespace}:job:${job.name}`
      currentSnapshots.set(key, {
        key,
        name: job.name,
        namespace: job.namespace,
        cluster: selectedCluster,
        status: job.status,
      })
    })

    // Detect changes (only if we have previous snapshots)
    if (previousSnapshotsRef.current.size > 0) {
      // Check for additions and modifications
      currentSnapshots.forEach((current, key) => {
        const previous = previousSnapshotsRef.current.get(key)
        const resourceType = key.split(':')[2] as ResourceType

        if (!previous) {
          // New resource
          newChanges.push({
            type: 'added',
            timestamp: Date.now(),
            resourceType,
            name: current.name,
            namespace: current.namespace,
            cluster: current.cluster,
            details: 'New resource created',
          })
        } else if (current.status !== previous.status ||
                   current.replicas !== previous.replicas ||
                   current.readyReplicas !== previous.readyReplicas) {
          // Modified resource
          const isError = current.status === 'CrashLoopBackOff' ||
                         current.status === 'Error' ||
                         current.status === 'Failed' ||
                         (current.readyReplicas !== undefined && current.readyReplicas < (current.replicas || 0))

          newChanges.push({
            type: isError ? 'error' : 'modified',
            timestamp: Date.now(),
            resourceType,
            name: current.name,
            namespace: current.namespace,
            cluster: current.cluster,
            details: `Status: ${previous.status} → ${current.status}`,
          })
        }
      })

      // Check for deletions
      previousSnapshotsRef.current.forEach((previous, key) => {
        if (!currentSnapshots.has(key)) {
          const resourceType = key.split(':')[2] as ResourceType
          newChanges.push({
            type: 'deleted',
            timestamp: Date.now(),
            resourceType,
            name: previous.name,
            namespace: previous.namespace,
            cluster: previous.cluster,
            details: 'Resource deleted',
          })
        }
      })
    }

    // Update snapshots
    previousSnapshotsRef.current = currentSnapshots

    // Add new changes (keep last 50)
    if (newChanges.length > 0) {
      setRecentChanges(prev => [...newChanges, ...prev].slice(0, 50))
    }
  }, [selectedCluster, pods, deployments, services, pvcs, configmaps, secrets, jobs])

  // Get change for a specific resource (for animation)
  const getResourceChange = useCallback((cluster: string, namespace: string, type: ResourceType, name: string): ChangeType => {
    const change = recentChanges.find(
      c => c.cluster === cluster && c.namespace === namespace && c.resourceType === type && c.name === name
    )
    // Only show animation for recent changes (within 5 seconds)
    if (change && Date.now() - change.timestamp < 5000) {
      return change.type
    }
    return null
  }, [recentChanges])

  // Clear change animation after timeout
  const clearChangeAfterTimeout = useCallback((key: string) => {
    if (changeTimeoutRef.current.has(key)) {
      clearTimeout(changeTimeoutRef.current.get(key))
    }
    const timeout = setTimeout(() => {
      changeTimeoutRef.current.delete(key)
    }, 5000)
    changeTimeoutRef.current.set(key, timeout)
  }, [])

  // Toggle cluster expansion
  const toggleCluster = useCallback((clusterName: string) => {
    const isCurrentlyExpanded = expandedClusters.has(clusterName)

    setExpandedClusters(prev => {
      const next = new Set(prev)
      if (next.has(clusterName)) {
        next.delete(clusterName)
      } else {
        next.add(clusterName)
      }
      return next
    })

    // Only set selected cluster when expanding (not collapsing)
    if (!isCurrentlyExpanded) {
      setSelectedCluster(clusterName)
    }
  }, [expandedClusters])

  // Toggle namespace expansion
  const toggleNamespace = useCallback((nsKey: string) => {
    setExpandedNamespaces(prev => {
      const next = new Set(prev)
      if (next.has(nsKey)) {
        next.delete(nsKey)
      } else {
        next.add(nsKey)
      }
      return next
    })
  }, [])

  // Toggle resource type filter
  const toggleResourceType = useCallback((type: ResourceType) => {
    setActiveResourceTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        if (next.size > 1) next.delete(type) // Keep at least one
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  // Build namespace data for a cluster
  const getNamespaceData = useCallback((clusterName: string): Map<string, NamespaceData> => {
    if (clusterName !== selectedCluster) return new Map()

    const nsData = new Map<string, NamespaceData>()

    // Filter namespaces by search
    let filteredNs = namespaces || []
    if (searchFilter) {
      const query = searchFilter.toLowerCase()
      filteredNs = filteredNs.filter(ns => ns.toLowerCase().includes(query))
    }

    // Initialize namespaces
    filteredNs.forEach(ns => {
      const nsPods: PodItem[] = (pods || []).filter(p => p.namespace === ns).map(p => ({
        name: p.name,
        namespace: p.namespace,
        status: p.status,
        restarts: p.restarts,
      }))
      const nsDeps: DeploymentItem[] = (deployments || []).filter(d => d.namespace === ns).map(d => ({
        name: d.name,
        namespace: d.namespace,
        replicas: d.replicas,
        readyReplicas: d.readyReplicas,
        status: d.status,
      }))
      const nsSvcs: ServiceItem[] = (services || []).filter(s => s.namespace === ns).map(s => ({
        name: s.name,
        namespace: s.namespace,
        type: s.type,
      }))
      const nsCms: ConfigMapItem[] = (configmaps || []).filter(c => c.namespace === ns).map(c => ({
        name: c.name,
        namespace: c.namespace,
        dataCount: c.dataCount,
      }))
      const nsSecrets: SecretItem[] = (secrets || []).filter(s => s.namespace === ns).map(s => ({
        name: s.name,
        namespace: s.namespace,
        type: s.type,
      }))
      const nsPvcs: PVCItem[] = (pvcs || []).filter(p => p.namespace === ns).map(p => ({
        name: p.name,
        namespace: p.namespace,
        status: p.status,
      }))
      const nsJobs: JobItem[] = (jobs || []).filter(j => j.namespace === ns).map(j => ({
        name: j.name,
        namespace: j.namespace,
        status: j.status,
      }))

      const hasIssues = nsPods.some(p => p.status !== 'Running' && p.status !== 'Succeeded') ||
                       nsDeps.some(d => d.readyReplicas < d.replicas)

      nsData.set(ns, {
        pods: nsPods,
        deployments: nsDeps,
        services: nsSvcs,
        configmaps: nsCms,
        secrets: nsSecrets,
        pvcs: nsPvcs,
        jobs: nsJobs,
        hasIssues,
      })
    })

    return nsData
  }, [selectedCluster, namespaces, pods, deployments, services, configmaps, secrets, pvcs, jobs, searchFilter])

  // Count recent changes by type
  const changeCountsByType = useMemo(() => {
    const counts = { added: 0, modified: 0, deleted: 0, error: 0 }
    const recentTime = Date.now() - 60000 // Last minute
    recentChanges.forEach(c => {
      if (c.timestamp > recentTime && c.type) {
        counts[c.type]++
      }
    })
    return counts
  }, [recentChanges])

  // Resource modal content
  const ResourceModal = () => {
    if (!modalResource) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setModalResource(null)}>
        <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = ResourceIcons[modalResource.type]
                return <Icon className={`w-5 h-5 ${ResourceColors[modalResource.type]}`} />
              })()}
              <span className="font-medium text-foreground">{modalResource.name}</span>
            </div>
            <button onClick={() => setModalResource(null)} className="p-1 hover:bg-secondary rounded">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Server className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cluster:</span>
              <span className="text-foreground">{modalResource.cluster}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Namespace:</span>
              <span className="text-foreground">{modalResource.namespace}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Box className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Type:</span>
              <span className="text-foreground capitalize">{modalResource.type}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <button
              onClick={() => {
                if (modalResource.type === 'pods') {
                  drillToPod(modalResource.cluster, modalResource.namespace, modalResource.name)
                } else if (modalResource.type === 'deployments') {
                  drillToDeployment(modalResource.cluster, modalResource.namespace, modalResource.name)
                } else if (modalResource.type === 'services') {
                  drillToService(modalResource.cluster, modalResource.namespace, modalResource.name)
                } else if (modalResource.type === 'pvcs') {
                  drillToPVC(modalResource.cluster, modalResource.namespace, modalResource.name)
                }
                setModalResource(null)
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded text-sm text-white transition-colors"
            >
              <Eye className="w-4 h-4" />
              View Details
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Changes panel
  const ChangesPanel = () => (
    <div className={`absolute right-0 top-12 w-80 bg-card border border-border rounded-lg shadow-xl z-40 transition-all ${
      showChangesPanel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
    }`}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium text-foreground">Recent Changes</span>
        <button onClick={() => setShowChangesPanel(false)} className="p-1 hover:bg-secondary rounded">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {recentChanges.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No recent changes detected
          </div>
        ) : (
          recentChanges.slice(0, 20).map((change, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 p-2 border-b border-border/50 hover:bg-secondary/50 cursor-pointer ${
                change.type === 'added' ? 'bg-green-500/5' :
                change.type === 'deleted' ? 'bg-red-500/5' :
                change.type === 'error' ? 'bg-red-500/10' : 'bg-yellow-500/5'
              }`}
              onClick={() => setModalResource({
                type: change.resourceType,
                name: change.name,
                namespace: change.namespace,
                cluster: change.cluster,
              })}
            >
              <div className={`mt-0.5 ${
                change.type === 'added' ? 'text-green-400' :
                change.type === 'deleted' ? 'text-red-400' :
                change.type === 'error' ? 'text-red-500' : 'text-yellow-400'
              }`}>
                {change.type === 'added' ? <Plus className="w-3.5 h-3.5" /> :
                 change.type === 'deleted' ? <Minus className="w-3.5 h-3.5" /> :
                 change.type === 'error' ? <AlertTriangle className="w-3.5 h-3.5" /> :
                 <Activity className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const Icon = ResourceIcons[change.resourceType]
                    return <Icon className={`w-3 h-3 ${ResourceColors[change.resourceType]}`} />
                  })()}
                  <span className="text-xs font-medium text-foreground truncate">{change.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {change.namespace} • {new Date(change.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-foreground">Namespace Monitor</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Changes indicator */}
          <button
            onClick={() => setShowChangesPanel(!showChangesPanel)}
            className={`relative flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              changeCountsByType.error > 0 ? 'bg-red-500/20 text-red-400' :
              changeCountsByType.added + changeCountsByType.modified > 0 ? 'bg-purple-500/20 text-purple-400' :
              'bg-secondary text-muted-foreground'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{changeCountsByType.added + changeCountsByType.modified + changeCountsByType.deleted + changeCountsByType.error}</span>
          </button>
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetchClusters}
            size="sm"
          />
        </div>
      </div>

      {/* Changes panel */}
      <ChangesPanel />

      {/* Search */}
      <div className="relative mb-3 flex-shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search clusters, namespaces..."
          className="w-full pl-10 pr-4 py-2 text-sm bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
        />
      </div>

      {/* Resource type filters */}
      <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
        {(Object.keys(ResourceIcons) as ResourceType[]).map(type => {
          const Icon = ResourceIcons[type]
          const isActive = activeResourceTypes.has(type)
          return (
            <button
              key={type}
              onClick={() => toggleResourceType(type)}
              className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border transition-colors ${
                isActive
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                  : 'bg-secondary/50 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className={`w-3 h-3 ${isActive ? ResourceColors[type] : ''}`} />
              <span className="capitalize">{type}</span>
            </button>
          )
        })}
      </div>

      {/* Tree content */}
      <div className="flex-1 bg-card/30 rounded-lg border border-border overflow-y-auto min-h-card-content">
        <div className="p-2">
          {filteredClusters.map(cluster => {
            const isExpanded = expandedClusters.has(cluster.name)
            const namespaceData = isExpanded ? getNamespaceData(cluster.name) : new Map<string, NamespaceData>()
            const namespaceList = Array.from(namespaceData.keys())
              .filter(ns => !ns.startsWith('kube-') && ns !== 'openshift' && !ns.startsWith('openshift-'))
              .sort()

            return (
              <div key={cluster.name} className="mb-1">
                {/* Cluster row */}
                <div
                  className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                  onClick={() => toggleCluster(cluster.name)}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Server className={`w-4 h-4 ${cluster.healthy ? 'text-blue-400' : 'text-red-400'}`} />
                  <span className="text-sm text-foreground flex-1">{cluster.context || cluster.name}</span>
                  <span className="text-xs text-muted-foreground">{cluster.nodeCount} nodes</span>
                </div>

                {/* Namespaces */}
                {isExpanded && (
                  <div className="ml-6 border-l border-border/50">
                    {selectedCluster !== cluster.name ? (
                      <div className="flex items-center gap-2 py-2 px-4 text-xs text-muted-foreground">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Loading...
                      </div>
                    ) : namespaceList.length === 0 ? (
                      <div className="py-2 px-4 text-xs text-muted-foreground">
                        No namespaces found
                      </div>
                    ) : (
                      namespaceList.map(ns => {
                        const nsKey = `${cluster.name}:${ns}`
                        const isNsExpanded = expandedNamespaces.has(nsKey)
                        const data = namespaceData.get(ns)

                        // Skip if data not loaded yet
                        if (!data) return null

                        return (
                          <div key={ns} className="mb-0.5">
                            {/* Namespace row */}
                            <div
                              className={`flex items-center gap-2 py-1.5 px-4 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer ${
                                data.hasIssues ? 'bg-red-500/5' : ''
                              }`}
                              onClick={() => toggleNamespace(nsKey)}
                            >
                              {isNsExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                              <Layers className={`w-3.5 h-3.5 ${data.hasIssues ? 'text-yellow-400' : 'text-yellow-500'}`} />
                              <span
                                className="text-sm text-foreground flex-1 hover:text-purple-400"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  drillToNamespace(cluster.name, ns)
                                }}
                              >
                                {ns}
                              </span>
                              {data.hasIssues && (
                                <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                              )}
                            </div>

                            {/* Resources */}
                            {isNsExpanded && (
                              <div className="ml-4 border-l border-border/30">
                                {/* Pods */}
                                {activeResourceTypes.has('pods') && data.pods.length > 0 && (
                                  <ResourceSection
                                    type="pods"
                                    items={data.pods.map(p => ({
                                      name: p.name,
                                      status: p.status,
                                      healthy: p.status === 'Running' || p.status === 'Succeeded',
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={(name) => drillToPod(cluster.name, ns, name)}
                                    onItemAction={(name) => setModalResource({ type: 'pods', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* Deployments */}
                                {activeResourceTypes.has('deployments') && data.deployments.length > 0 && (
                                  <ResourceSection
                                    type="deployments"
                                    items={data.deployments.map(d => ({
                                      name: d.name,
                                      status: `${d.readyReplicas}/${d.replicas}`,
                                      healthy: d.readyReplicas === d.replicas,
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={(name) => drillToDeployment(cluster.name, ns, name)}
                                    onItemAction={(name) => setModalResource({ type: 'deployments', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* Services */}
                                {activeResourceTypes.has('services') && data.services.length > 0 && (
                                  <ResourceSection
                                    type="services"
                                    items={data.services.map(s => ({
                                      name: s.name,
                                      status: s.type,
                                      healthy: true,
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={(name) => drillToService(cluster.name, ns, name)}
                                    onItemAction={(name) => setModalResource({ type: 'services', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* ConfigMaps */}
                                {activeResourceTypes.has('configmaps') && data.configmaps.length > 0 && (
                                  <ResourceSection
                                    type="configmaps"
                                    items={data.configmaps.map(c => ({
                                      name: c.name,
                                      status: `${c.dataCount || 0} keys`,
                                      healthy: true,
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={() => {}}
                                    onItemAction={(name) => setModalResource({ type: 'configmaps', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* Secrets */}
                                {activeResourceTypes.has('secrets') && data.secrets.length > 0 && (
                                  <ResourceSection
                                    type="secrets"
                                    items={data.secrets.map(s => ({
                                      name: s.name,
                                      status: s.type || 'Opaque',
                                      healthy: true,
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={() => {}}
                                    onItemAction={(name) => setModalResource({ type: 'secrets', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* PVCs */}
                                {activeResourceTypes.has('pvcs') && data.pvcs.length > 0 && (
                                  <ResourceSection
                                    type="pvcs"
                                    items={data.pvcs.map(p => ({
                                      name: p.name,
                                      status: p.status,
                                      healthy: p.status === 'Bound',
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={(name) => drillToPVC(cluster.name, ns, name)}
                                    onItemAction={(name) => setModalResource({ type: 'pvcs', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}

                                {/* Jobs */}
                                {activeResourceTypes.has('jobs') && data.jobs.length > 0 && (
                                  <ResourceSection
                                    type="jobs"
                                    items={data.jobs.map(j => ({
                                      name: j.name,
                                      status: j.status,
                                      healthy: j.status === 'Complete',
                                    }))}
                                    cluster={cluster.name}
                                    namespace={ns}
                                    getResourceChange={getResourceChange}
                                    clearChangeAfterTimeout={clearChangeAfterTimeout}
                                    onItemClick={() => {}}
                                    onItemAction={(name) => setModalResource({ type: 'jobs', name, namespace: ns, cluster: cluster.name })}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {filteredClusters.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              No clusters match the current filter
            </div>
          )}
        </div>
      </div>

      {/* Resource Modal */}
      <ResourceModal />
    </div>
  )
}

// Resource section component
interface ResourceSectionProps {
  type: ResourceType
  items: Array<{ name: string; status: string; healthy: boolean }>
  cluster: string
  namespace: string
  getResourceChange: (cluster: string, namespace: string, type: ResourceType, name: string) => ChangeType
  clearChangeAfterTimeout: (key: string) => void
  onItemClick: (name: string) => void
  onItemAction: (name: string) => void
}

function ResourceSection({
  type,
  items,
  cluster,
  namespace,
  getResourceChange,
  clearChangeAfterTimeout,
  onItemClick,
  onItemAction,
}: ResourceSectionProps) {
  const Icon = ResourceIcons[type]
  const color = ResourceColors[type]

  return (
    <div className="py-1 px-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3 h-3 ${color}`} />
        <span className="capitalize">{type}</span>
        <span>({items.length})</span>
      </div>
      <div className="space-y-0.5">
        {items.slice(0, 10).map(item => {
          const changeType = getResourceChange(cluster, namespace, type, item.name)
          const key = `${cluster}:${namespace}:${type}:${item.name}`

          if (changeType) {
            clearChangeAfterTimeout(key)
          }

          return (
            <div
              key={item.name}
              className={`flex items-center gap-2 py-1 px-2 rounded text-xs group transition-all border border-transparent ${
                changeType ? ChangeAnimations[changeType] : 'hover:bg-secondary/50'
              }`}
            >
              <span
                className={`flex-1 truncate cursor-pointer hover:text-purple-400 ${
                  item.healthy ? 'text-foreground' : 'text-yellow-400'
                }`}
                onClick={() => onItemClick(item.name)}
              >
                {item.name}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                item.healthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {item.status}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onItemAction(item.name)
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-secondary rounded transition-opacity"
              >
                <Eye className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )
        })}
        {items.length > 10 && (
          <div className="text-[10px] text-muted-foreground px-2 py-1">
            +{items.length - 10} more
          </div>
        )}
      </div>
    </div>
  )
}
