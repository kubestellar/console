import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Pencil, X, Check, Loader2, WifiOff, ChevronRight, CheckCircle, AlertTriangle, AlertCircle, ChevronDown, HardDrive, Network, FolderOpen, Plus, Trash2, Box, Layers, Server, List, GitBranch, Eye, Terminal, FileText, Info, Activity, Briefcase, Lock, Settings, LayoutGrid, Wrench } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useClusters, useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNVIDIAOperators, useNamespaceStats, useNodes, usePods, useDeployments, useServices, useJobs, useHPAs, useConfigMaps, useSecrets, usePodLogs, ClusterInfo, refreshSingleCluster } from '../../hooks/useMCP'
import { AddCardModal } from '../dashboard/AddCardModal'
import { TemplatesModal } from '../dashboard/TemplatesModal'
import { FloatingDashboardActions } from '../dashboard/FloatingDashboardActions'
import { DashboardTemplate } from '../dashboard/templates'
import { useDashboard } from '../../lib/dashboards'
import { ClusterDetailModal } from './ClusterDetailModal'
import {
  RenameModal,
  StatsOverview,
  FilterTabs,
  ClusterGrid,
  GPUDetailModal,
  SortableClusterCard,
  DragPreviewCard,
  CardConfigModal,
  type ClusterLayoutMode,
} from './components'
import { isClusterUnreachable } from './utils'
import { formatK8sMemory } from '../../lib/formatters'
import { useRefreshIndicator } from '../../hooks/useRefreshIndicator'
import { DashboardHeader } from '../shared/DashboardHeader'
import { getDefaultCards } from '../../config/dashboards'

// Storage key for cluster page cards
const CLUSTERS_CARDS_KEY = 'kubestellar-clusters-cards'

// Default cards loaded from centralized config
const DEFAULT_CLUSTERS_CARDS = getDefaultCards('clusters')

import { useLocalAgent } from '../../hooks/useLocalAgent'
import { isInClusterMode } from '../../hooks/useBackendHealth'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { usePermissions } from '../../hooks/usePermissions'
import { useMissions } from '../../hooks/useMissions'
import { Gauge } from '../charts/Gauge'
import { ClusterCardSkeleton, StatsOverviewSkeleton } from '../ui/ClusterCardSkeleton'
import { useIsModeSwitching } from '../../lib/unified/demo'
import { useTranslation } from 'react-i18next'

// Helper to format labels/annotations for tooltip
function formatMetadata(labels?: Record<string, string>, annotations?: Record<string, string>): string {
  const parts: string[] = []
  if (labels && Object.keys(labels).length > 0) {
    parts.push('Labels:')
    Object.entries(labels).slice(0, 5).forEach(([k, v]) => {
      parts.push(`  ${k}=${v}`)
    })
    if (Object.keys(labels).length > 5) {
      parts.push(`  ... +${Object.keys(labels).length - 5} more`)
    }
  }
  if (annotations && Object.keys(annotations).length > 0) {
    if (parts.length > 0) parts.push('')
    parts.push('Annotations:')
    Object.entries(annotations).slice(0, 3).forEach(([k, v]) => {
      const truncVal = v.length > 50 ? v.substring(0, 50) + '...' : v
      parts.push(`  ${k}=${truncVal}`)
    })
    if (Object.keys(annotations).length > 3) {
      parts.push(`  ... +${Object.keys(annotations).length - 3} more`)
    }
  }
  return parts.join('\n')
}

// Resource Detail Modal
interface ResourceDetailModalProps {
  resource: {
    kind: 'Pod' | 'Deployment' | 'Node' | 'Service' | 'Job' | 'HPA' | 'ConfigMap' | 'Secret'
    name: string
    namespace?: string
    cluster: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    data?: Record<string, unknown>
  }
  onClose: () => void
}

function ResourceDetailModal({ resource, onClose }: ResourceDetailModalProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'describe' | 'labels' | 'logs'>('describe')
  const { startMission } = useMissions()

  const handleRepairPod = () => {
    const issues = resource.data?.issues as string[] | undefined
    const status = resource.data?.status as string | undefined
    const restarts = resource.data?.restarts as number | undefined

    startMission({
      title: `Repair ${resource.name}`,
      description: `Troubleshoot and repair pod issues`,
      type: 'troubleshoot',
      cluster: resource.cluster,
      initialPrompt: `I need help troubleshooting and repairing a Kubernetes pod that is having issues.

**Pod Details:**
- Name: ${resource.name}
- Namespace: ${resource.namespace || 'default'}
- Cluster: ${resource.cluster}
- Status: ${status || 'Unknown'}
- Restarts: ${restarts || 0}
${issues && issues.length > 0 ? `- Issues: ${issues.join(', ')}` : ''}

Please help me:
1. Diagnose what's causing this pod to fail
2. Check the pod events and logs for error messages
3. Identify the root cause
4. Suggest and implement a fix
5. Verify the pod is running correctly after the fix

Start by running diagnostic commands to understand what's happening.`,
      context: {
        podName: resource.name,
        namespace: resource.namespace,
        cluster: resource.cluster,
        status,
        restarts,
        issues,
      },
    })
    onClose()
  }

  // Fetch logs for pods
  const { logs, isLoading: logsLoading, error: logsError, refetch: refetchLogs } = usePodLogs(
    resource.cluster,
    resource.namespace || '',
    resource.kind === 'Pod' ? resource.name : '',
    undefined,
    200
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const getKindColors = () => {
    switch (resource.kind) {
      case 'Pod': return 'bg-blue-500/20 text-blue-400'
      case 'Deployment': return 'bg-purple-500/20 text-purple-400'
      case 'Node': return 'bg-cyan-500/20 text-cyan-400'
      case 'Service': return 'bg-cyan-500/20 text-cyan-400'
      case 'Job': return 'bg-amber-500/20 text-amber-400'
      case 'HPA': return 'bg-violet-500/20 text-violet-400'
      case 'ConfigMap': return 'bg-orange-500/20 text-orange-400'
      case 'Secret': return 'bg-pink-500/20 text-pink-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  const getKindIcon = () => {
    switch (resource.kind) {
      case 'Pod': return <Box className="w-4 h-4" />
      case 'Deployment': return <Layers className="w-4 h-4" />
      case 'Node': return <Server className="w-4 h-4" />
      case 'Service': return <Network className="w-4 h-4" />
      case 'Job': return <Briefcase className="w-4 h-4" />
      case 'HPA': return <Activity className="w-4 h-4" />
      case 'ConfigMap': return <Settings className="w-4 h-4" />
      case 'Secret': return <Lock className="w-4 h-4" />
      default: return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass p-6 rounded-lg w-[700px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${getKindColors()}`}>
              {getKindIcon()}
              {resource.kind}
            </span>
            <span className="font-medium text-foreground">{resource.name}</span>
            {resource.namespace && <span className="text-muted-foreground text-sm">({resource.namespace})</span>}
          </div>
          <div className="flex items-center gap-2">
            {resource.kind === 'Pod' && Array.isArray(resource.data?.issues) && resource.data.issues.length > 0 && (
              <button
                onClick={handleRepairPod}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                title={t('cluster.launchAIRepairMission')}
              >
                <Wrench className="w-4 h-4" />
                {t('cluster.repairPod')}
              </button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab('describe')}
            className={`px-3 py-1.5 rounded-t text-sm flex items-center gap-1.5 ${activeTab === 'describe' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <FileText className="w-4 h-4" />{t('drilldown.tabs.describe')}
          </button>
          <button
            onClick={() => setActiveTab('labels')}
            className={`px-3 py-1.5 rounded-t text-sm flex items-center gap-1.5 ${activeTab === 'labels' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Info className="w-4 h-4" />{t('cluster.labelsAndAnnotations')}
          </button>
          {resource.kind === 'Pod' && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-t text-sm flex items-center gap-1.5 ${activeTab === 'logs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Terminal className="w-4 h-4" />{t('drilldown.tabs.logs')}
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto scroll-enhanced">
          {activeTab === 'describe' && (
            <div className="bg-secondary/50 rounded p-4 font-mono text-xs overflow-auto max-h-[400px]">
              <div className="text-muted-foreground mb-2"># kubectl describe {resource.kind.toLowerCase()} {resource.name} {resource.namespace ? `-n ${resource.namespace}` : ''}</div>
              <div className="space-y-1">
                <div><span className="text-muted-foreground">Name:</span> <span className="text-foreground">{resource.name}</span></div>
                {resource.namespace && <div><span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span> <span className="text-foreground">{resource.namespace}</span></div>}
                <div><span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span> <span className="text-foreground">{resource.cluster}</span></div>
                {resource.data && Object.entries(resource.data).map(([k, v]) => (
                  <div key={k}><span className="text-muted-foreground">{k}:</span> <span className="text-foreground">{String(v)}</span></div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'labels' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Labels ({resource.labels ? Object.keys(resource.labels).length : 0})</h4>
                <div className="flex flex-wrap gap-2">
                  {resource.labels && Object.entries(resource.labels).map(([k, v]) => (
                    <span key={k} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">
                      {k}={v}
                    </span>
                  ))}
                  {(!resource.labels || Object.keys(resource.labels).length === 0) && (
                    <span className="text-xs text-muted-foreground">{t('drilldown.empty.noLabels')}</span>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Annotations ({resource.annotations ? Object.keys(resource.annotations).length : 0})</h4>
                <div className="space-y-2">
                  {resource.annotations && Object.entries(resource.annotations).map(([k, v]) => (
                    <div key={k} className="text-xs font-mono bg-secondary/50 rounded p-2">
                      <div className="text-purple-400 break-all">{k}</div>
                      <div className="text-foreground mt-1 break-all">{v}</div>
                    </div>
                  ))}
                  {(!resource.annotations || Object.keys(resource.annotations).length === 0) && (
                    <span className="text-xs text-muted-foreground">{t('drilldown.empty.noAnnotations')}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logs' && resource.kind === 'Pod' && (
            <div className="bg-secondary/50 rounded p-4 font-mono text-xs overflow-auto max-h-[400px]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-muted-foreground"># kubectl logs {resource.name} -n {resource.namespace}</div>
                <button
                  onClick={() => refetchLogs()}
                  disabled={logsLoading}
                  className="text-xs px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50"
                >
                  {logsLoading ? t('common.loading') : t('common.refresh')}
                </button>
              </div>
              {logsLoading && <div className="text-muted-foreground">{t('cluster.loadingLogs')}</div>}
              {logsError && <div className="text-red-400">{logsError}</div>}
              {!logsLoading && !logsError && !logs && (
                <div className="text-muted-foreground">{t('cluster.noLogsAvailable')}</div>
              )}
              {!logsLoading && logs && (
                <pre className="whitespace-pre-wrap break-all text-foreground">{logs}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Component to show resources in a namespace when drilled into
interface NamespaceResourcesProps {
  clusterName: string
  namespace: string
}

type ResourceKind = 'Pod' | 'Deployment' | 'Service' | 'Job' | 'HPA' | 'ConfigMap' | 'Secret'

function NamespaceResources({ clusterName, namespace }: NamespaceResourcesProps) {
  const { t } = useTranslation()
  const { pods, isLoading: podsLoading } = usePods(clusterName, namespace, 'name', 100)
  const { deployments, isLoading: deploymentsLoading } = useDeployments(clusterName, namespace)
  const { services, isLoading: servicesLoading } = useServices(clusterName, namespace)
  const { jobs, isLoading: jobsLoading } = useJobs(clusterName, namespace)
  const { hpas, isLoading: hpasLoading } = useHPAs(clusterName, namespace)
  const { configmaps, isLoading: configmapsLoading } = useConfigMaps(clusterName, namespace)
  const { secrets, isLoading: secretsLoading } = useSecrets(clusterName, namespace)
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('tree')
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set(['deployments', 'pods']))
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [selectedResource, setSelectedResource] = useState<{
    kind: ResourceKind
    name: string
    namespace?: string
    cluster: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    data?: Record<string, unknown>
  } | null>(null)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  // Timeout after 10 seconds to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => setLoadingTimedOut(true), 10000)
    return () => clearTimeout(timer)
  }, [clusterName, namespace])

  // Show content as soon as pods and deployments load - don't wait for everything
  const isInitialLoading = podsLoading && deploymentsLoading && !loadingTimedOut
  const _isPartiallyLoading = (podsLoading || deploymentsLoading || servicesLoading || jobsLoading || hpasLoading || configmapsLoading || secretsLoading) && !loadingTimedOut
  void _isPartiallyLoading // silence unused warning - available for future use showing partial loading indicator

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
      labels?: Record<string, string>
      annotations?: Record<string, string>
      data?: Record<string, unknown>
    }> = []

    deployments.forEach(dep => resources.push({
      kind: 'Deployment',
      name: dep.name,
      namespace: dep.namespace,
      status: dep.status,
      statusColor: dep.status === 'running' ? 'green' : dep.status === 'deploying' ? 'blue' : 'red',
      detail: `${dep.readyReplicas}/${dep.replicas}`,
      labels: dep.labels,
      annotations: dep.annotations,
      data: { replicas: dep.replicas, readyReplicas: dep.readyReplicas, image: dep.image, status: dep.status, age: dep.age }
    }))

    pods.forEach(pod => resources.push({
      kind: 'Pod',
      name: pod.name,
      namespace: pod.namespace,
      status: pod.status,
      statusColor: pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red',
      detail: pod.ready,
      labels: pod.labels,
      annotations: pod.annotations,
      data: { status: pod.status, ready: pod.ready, restarts: pod.restarts, node: pod.node, age: pod.age }
    }))

    services.forEach(svc => resources.push({
      kind: 'Service',
      name: svc.name,
      namespace: svc.namespace,
      status: svc.type,
      statusColor: 'cyan',
      detail: svc.ports?.slice(0, 2).join(', '),
      labels: svc.labels,
      annotations: svc.annotations,
      data: { type: svc.type, clusterIP: svc.clusterIP, externalIP: svc.externalIP, ports: svc.ports, age: svc.age }
    }))

    jobs.forEach(job => resources.push({
      kind: 'Job',
      name: job.name,
      namespace: job.namespace,
      status: job.status,
      statusColor: job.status === 'Complete' ? 'green' : job.status === 'Running' ? 'blue' : 'red',
      detail: job.completions,
      labels: job.labels,
      annotations: job.annotations,
      data: { status: job.status, completions: job.completions, duration: job.duration, age: job.age }
    }))

    hpas.forEach(hpa => resources.push({
      kind: 'HPA',
      name: hpa.name,
      namespace: hpa.namespace,
      status: `${hpa.currentReplicas}/${hpa.minReplicas}-${hpa.maxReplicas}`,
      statusColor: 'purple',
      detail: hpa.reference,
      labels: hpa.labels,
      annotations: hpa.annotations,
      data: { reference: hpa.reference, minReplicas: hpa.minReplicas, maxReplicas: hpa.maxReplicas, currentReplicas: hpa.currentReplicas, targetCPU: hpa.targetCPU, currentCPU: hpa.currentCPU, age: hpa.age }
    }))

    configmaps.forEach(cm => resources.push({
      kind: 'ConfigMap',
      name: cm.name,
      namespace: cm.namespace,
      status: `${cm.dataCount} keys`,
      statusColor: 'orange',
      labels: cm.labels,
      annotations: cm.annotations,
      data: { dataCount: cm.dataCount, age: cm.age }
    }))

    secrets.forEach(secret => resources.push({
      kind: 'Secret',
      name: secret.name,
      namespace: secret.namespace,
      status: secret.type,
      statusColor: 'pink',
      detail: `${secret.dataCount} keys`,
      labels: secret.labels,
      annotations: secret.annotations,
      data: { type: secret.type, dataCount: secret.dataCount, age: secret.age }
    }))

    return resources
  }, [deployments, pods, services, jobs, hpas, configmaps, secrets])

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
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  if (isInitialLoading && pods.length === 0 && deployments.length === 0) {
    return (
      <div className="px-3 pb-3 pt-0 border-t border-border/30">
        <div className="pl-6 py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading namespace resources...
        </div>
      </div>
    )
  }

  if (loadingTimedOut && pods.length === 0 && deployments.length === 0) {
    return (
      <div className="px-3 pb-3 pt-0 border-t border-border/30">
        <div className="pl-6 py-4 flex items-center gap-2 text-sm text-yellow-400">
          <AlertCircle className="w-4 h-4" />
          Loading timed out. The cluster may be unreachable.
        </div>
      </div>
    )
  }

  const hasResources = allResources.length > 0

  return (
    <div className="px-3 pb-3 pt-0 border-t border-border/30">
      {/* View toggle */}
      <div className="flex justify-end pt-2 pr-2">
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
        <div className="pl-4 space-y-1 pt-2 max-h-[400px] overflow-y-auto">
          {allResources.slice(0, 50).map((resource, idx) => {
            const tooltip = formatMetadata(resource.labels, resource.annotations)
            return (
              <div key={`${resource.kind}-${resource.name}-${idx}`} className="flex items-center justify-between p-2 rounded bg-card/30 text-sm group hover:bg-card/50 transition-colors" title={tooltip || `${resource.kind}: ${resource.name}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {getKindIcon(resource.kind)}
                  <span className="text-foreground truncate">{resource.name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs shrink-0">
                  <button
                    onClick={() => setSelectedResource({
                      kind: resource.kind,
                      name: resource.name,
                      namespace: resource.namespace,
                      cluster: clusterName,
                      labels: resource.labels,
                      annotations: resource.annotations,
                      data: resource.data
                    })}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t('common.viewDetails')}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {resource.detail && <span className="text-muted-foreground">{resource.detail}</span>}
                  {resource.status && (
                    <span className={`px-1.5 py-0.5 rounded ${getStatusBgColor(resource.statusColor)}`}>
                      {resource.status}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {allResources.length > 50 && <div className="text-xs text-muted-foreground text-center py-2">+{allResources.length - 50} more resources</div>}
        </div>
      ) : (
        /* Tree View */
        <div className="pl-4 pt-2 font-mono text-xs">
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
                          <button onClick={() => depPods.length > 0 && toggleItem(`dep-${dep.name}`)} className={`flex items-center gap-2 py-1 px-1 rounded w-full text-left ${depPods.length > 0 ? 'hover:bg-card/30 cursor-pointer' : ''}`}>
                            {depPods.length > 0 ? (isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />) : <span className="w-3" />}
                            <span className="text-foreground">{dep.name}</span>
                            <span className={`text-xs ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-orange-400'}`}>{dep.readyReplicas}/{dep.replicas}</span>
                            {depPods.length > 0 && <span className="text-xs text-muted-foreground">({depPods.length} pods)</span>}
                          </button>
                          {isExpanded && depPods.length > 0 && (
                            <div className="ml-4 border-l border-border/30 pl-2">
                              {depPods.slice(0, 10).map(pod => (
                                <div key={pod.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                                  <Box className="w-3 h-3 text-blue-400" />
                                  <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                                  <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
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
                      <div key={pod.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Box className="w-3 h-3 text-blue-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={pod.name}>{pod.name}</span>
                        <span className={pod.status === 'Running' ? 'text-green-400' : pod.status === 'Pending' ? 'text-yellow-400' : 'text-red-400'}>{pod.status}</span>
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
                      <div key={svc.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Network className="w-3 h-3 text-cyan-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={svc.name}>{svc.name}</span>
                        <span className="text-cyan-400">{svc.type}</span>
                        {svc.ports && svc.ports.length > 0 && <span className="text-muted-foreground">{svc.ports[0]}</span>}
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
                      <div key={job.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Briefcase className="w-3 h-3 text-amber-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={job.name}>{job.name}</span>
                        <span className={job.status === 'Complete' ? 'text-green-400' : job.status === 'Running' ? 'text-blue-400' : 'text-red-400'}>{job.status}</span>
                        <span className="text-muted-foreground">{job.completions}</span>
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
                      <div key={hpa.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Activity className="w-3 h-3 text-violet-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={hpa.name}>{hpa.name}</span>
                        <span className="text-violet-400">{hpa.currentReplicas}/{hpa.minReplicas}-{hpa.maxReplicas}</span>
                        <span className="text-muted-foreground">→ {hpa.reference}</span>
                      </div>
                    ))}
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
                      <div key={cm.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Settings className="w-3 h-3 text-orange-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={cm.name}>{cm.name}</span>
                        <span className="text-muted-foreground">{cm.dataCount} keys</span>
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
                      <div key={secret.name} className="flex items-center gap-2 py-0.5 px-1 text-xs">
                        <Lock className="w-3 h-3 text-pink-400" />
                        <span className="text-foreground truncate max-w-[200px]" title={secret.name}>{secret.name}</span>
                        <span className="text-pink-400">{secret.type}</span>
                        <span className="text-muted-foreground">{secret.dataCount} keys</span>
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

      {/* Resource Detail Modal */}
      {selectedResource && (
        <ResourceDetailModal
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  )
}

// Legacy ClusterDetail - kept for reference, using ClusterDetailModal instead
 
interface _ClusterDetailProps {
  clusterName: string
  onClose: () => void
  onRename?: (clusterName: string) => void
}

 
export function _ClusterDetail({ clusterName, onClose, onRename }: _ClusterDetailProps) {
  const { t } = useTranslation()
  const { health, isLoading } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { nodes: gpuNodes } = useGPUNodes()
  const { nodes: clusterNodes, isLoading: nodesLoading } = useNodes(clusterName)
  const { stats: namespaceStats, isLoading: nsLoading } = useNamespaceStats(clusterName)
  const { deployments: clusterDeployments } = useDeployments(clusterName)
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set())
  const [showAllNamespaces, setShowAllNamespaces] = useState(false)
  const [showPodsByNamespace, setShowPodsByNamespace] = useState(false)
  const [selectedIssueResource, setSelectedIssueResource] = useState<{
    kind: ResourceKind
    name: string
    namespace?: string
    cluster: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    data?: Record<string, unknown>
  } | null>(null)
  const [showNodeDetails, setShowNodeDetails] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null)

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const clusterGPUs = gpuNodes.filter(n => n.cluster === clusterName || n.cluster.includes(clusterName.split('/')[0]))
  const clusterDeploymentIssues = deploymentIssues.filter(d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0]))

  // Determine cluster status - use same logic as ClusterDetailModal
  // Only mark as unreachable when we have confirmed unreachable status, not when loading
  const isUnreachable = health ? (
    health.reachable === false ||
    (health.errorType && ['timeout', 'network', 'certificate'].includes(health.errorType)) ||
    health.nodeCount === 0
  ) : false
  const isHealthy = !isUnreachable && health?.healthy !== false

  // Group GPUs by type for summary
  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: typeof clusterGPUs }> = {}
    clusterGPUs.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: [] }
      }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes.push(node)
    })
    return map
  }, [clusterGPUs])

  const toggleIssue = (id: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="glass p-8 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-transparent border-t-primary" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="glass p-6 rounded-lg w-[800px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header with status icons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {isUnreachable ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/20 text-yellow-400" title={t('cluster.offline')}>
                <WifiOff className="w-4 h-4" />
              </span>
            ) : isHealthy ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/20 text-green-400" title={t('cluster.healthy')}>
                <CheckCircle className="w-4 h-4" />
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/20 text-orange-400" title={t('cluster.unhealthy')}>
                <AlertTriangle className="w-4 h-4" />
              </span>
            )}
            <h2 className="text-xl font-semibold text-foreground">{clusterName.split('/').pop()}</h2>
            {onRename && (
              <button
                onClick={() => onRename(clusterName)}
                className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                title={t('cluster.renameCluster')}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => !isUnreachable && setShowNodeDetails(!showNodeDetails)}
            disabled={isUnreachable}
            className={`p-4 rounded-lg bg-card/50 border text-left transition-colors ${
              !isUnreachable ? 'border-border hover:border-primary/50 hover:bg-card/70 cursor-pointer' : 'border-border cursor-default'
            } ${showNodeDetails ? 'border-primary/50 bg-card/70' : ''}`}
            title={!isUnreachable ? t('cluster.clickToViewNodeDetails') : undefined}
          >
            <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.nodeCount || 0) : '-'}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              Nodes
              {!isUnreachable && <ChevronDown className={`w-3 h-3 transition-transform ${showNodeDetails ? 'rotate-180' : ''}`} />}
            </div>
            <div className="text-xs text-green-400">{!isUnreachable ? `${health?.readyNodes || 0} ready` : 'offline'}</div>
          </button>
          <button
            onClick={() => !isUnreachable && setShowPodsByNamespace(!showPodsByNamespace)}
            disabled={isUnreachable}
            className={`p-4 rounded-lg bg-card/50 border text-left transition-colors ${
              !isUnreachable ? 'border-border hover:border-primary/50 hover:bg-card/70 cursor-pointer' : 'border-border cursor-default'
            } ${showPodsByNamespace ? 'border-primary/50 bg-card/70' : ''}`}
            title={!isUnreachable ? t('cluster.clickToViewWorkloads') : undefined}
          >
            <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
              Workloads
              {!isUnreachable && <ChevronDown className={`w-3 h-3 transition-transform ${showPodsByNamespace ? 'rotate-180' : ''}`} />}
            </div>
            <div className="space-y-0.5 text-xs">
              {!isUnreachable ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Namespaces</span>
                    <span className="text-foreground font-medium">{namespaceStats.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.deployments')}</span>
                    <span className="text-foreground font-medium">{clusterDeployments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('common.pods')}</span>
                    <span className="text-foreground font-medium">{health?.podCount || 0}</span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </div>
          </button>
          <div className="p-4 rounded-lg bg-card/50 border border-border">
            <div className="text-2xl font-bold text-foreground">{!isUnreachable ? clusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0) : '-'}</div>
            <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
            <div className="text-xs text-yellow-400">{!isUnreachable ? `${clusterGPUs.reduce((sum, n) => sum + n.gpuAllocated, 0)} ${t('cluster.allocated')}` : ''}</div>
          </div>
        </div>

        {/* Pods by Namespace - Expandable with drill-down */}
        {!isUnreachable && showPodsByNamespace && namespaceStats.length > 0 && (
          <div className="mb-6">
            <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
              <div className="divide-y divide-border/30">
                {(showAllNamespaces ? namespaceStats : namespaceStats.slice(0, 5)).map((ns) => {
                  const isExpanded = expandedNamespace === ns.name
                  return (
                    <div key={ns.name} className="overflow-hidden">
                      <button
                        onClick={() => setExpandedNamespace(isExpanded ? null : ns.name)}
                        className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-medium"><FolderOpen className="w-3 h-3" />NS</span>
                          <span className="font-mono text-sm text-foreground">{ns.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{ns.podCount} pods</span>
                          {ns.runningPods > 0 && (
                            <span className="text-green-400">{ns.runningPods} running</span>
                          )}
                          {ns.pendingPods > 0 && (
                            <span className="text-yellow-400">{ns.pendingPods} pending</span>
                          )}
                          {ns.failedPods > 0 && (
                            <span className="text-red-400">{ns.failedPods} failed</span>
                          )}
                        </div>
                      </button>
                      {isExpanded && (
                        <NamespaceResources clusterName={clusterName} namespace={ns.name} />
                      )}
                    </div>
                  )
                })}
              </div>
              {namespaceStats.length > 5 && (
                <button
                  onClick={() => setShowAllNamespaces(!showAllNamespaces)}
                  className="w-full p-2 text-sm text-primary hover:bg-card/30 transition-colors border-t border-border/30"
                >
                  {showAllNamespaces ? t('cluster.showLess') : t('cluster.showAllNamespaces', { count: namespaceStats.length })}
                </button>
              )}
            </div>
            {nsLoading && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('cluster.loadingNamespaceData')}
              </div>
            )}
          </div>
        )}

        {/* Issues Section - Expandable */}
        {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              Issues ({podIssues.length + clusterDeploymentIssues.length})
            </h3>
            <div className="space-y-2">
              {podIssues.slice(0, 5).map((issue, i) => {
                const issueId = `pod-${i}`
                const isExpanded = expandedIssues.has(issueId)
                return (
                  <div
                    key={issueId}
                    className="rounded-lg bg-red-500/10 border border-red-500/20 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleIssue(issueId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-red-500/5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-red-400" /> : <ChevronRight className="w-4 h-4 text-red-400" />}
                        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium"><Box className="w-3 h-3" />{t('common.pod')}</span>
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <span className="text-xs text-muted-foreground">({issue.namespace})</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{issue.status}</span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-red-500/20">
                        <div className="pl-6 space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
                            <span className="ml-2 font-mono text-foreground">{issue.namespace}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status:</span>
                            <span className="ml-2 text-red-400">{issue.status}</span>
                          </div>
                          {issue.restarts !== undefined && issue.restarts > 0 && (
                            <div>
                              <span className="text-muted-foreground">{t('drilldown.fields.restarts')}</span>
                              <span className="ml-2 text-orange-400">{issue.restarts}</span>
                            </div>
                          )}
                          {issue.issues.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Issues:</span>
                              <ul className="ml-4 mt-1 list-disc list-inside text-red-400">
                                {issue.issues.map((msg, j) => (
                                  <li key={j}>{msg}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <button
                            onClick={() => setSelectedIssueResource({
                              kind: 'Pod',
                              name: issue.name,
                              namespace: issue.namespace,
                              cluster: clusterName,
                              data: {
                                status: issue.status,
                                restarts: issue.restarts,
                                issues: issue.issues,
                                reason: issue.reason,
                              }
                            })}
                            className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded bg-secondary/50 text-foreground hover:bg-secondary transition-colors text-xs"
                          >
                            <Eye className="w-3 h-3" />
                            View Pod Details
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {clusterDeploymentIssues.slice(0, 3).map((issue, i) => {
                const issueId = `dep-${i}`
                const isExpanded = expandedIssues.has(issueId)
                return (
                  <div
                    key={issueId}
                    className="rounded-lg bg-orange-500/10 border border-orange-500/20 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleIssue(issueId)}
                      className="w-full p-3 flex items-center justify-between text-left hover:bg-orange-500/5 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-orange-400" /> : <ChevronRight className="w-4 h-4 text-orange-400" />}
                        <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium"><Layers className="w-3 h-3" />Deploy</span>
                        <span className="font-medium text-foreground">{issue.name}</span>
                        <span className="text-xs text-muted-foreground">({issue.namespace})</span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-orange-500/20 text-orange-400">
                        {issue.readyReplicas}/{issue.replicas} ready
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-orange-500/20">
                        <div className="pl-6 space-y-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('drilldown.fields.namespace')}</span>
                            <span className="ml-2 font-mono text-foreground">{issue.namespace}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Replicas:</span>
                            <span className="ml-2 text-foreground">{issue.readyReplicas}/{issue.replicas} ready</span>
                          </div>
                          {issue.message && (
                            <div>
                              <span className="text-muted-foreground">{t('drilldown.fields.message')}</span>
                              <span className="ml-2 text-orange-400">{issue.message}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* GPU Section - By Type with Node Assignment */}
        {clusterGPUs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              GPUs by Type
            </h3>
            <div className="space-y-4">
              {Object.entries(gpuByType).map(([type, info]) => (
                <div key={type} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                  {/* GPU Type Summary Header */}
                  <div className="p-3 border-b border-border/50 bg-purple-500/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{type}</span>
                        <span className="text-xs text-muted-foreground">({info.nodes.length} node{info.nodes.length !== 1 ? 's' : ''})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24">
                          <Gauge value={info.allocated} max={info.total} size="sm" />
                        </div>
                        <span className="text-sm text-muted-foreground">{info.allocated}/{info.total} allocated</span>
                      </div>
                    </div>
                  </div>
                  {/* Node Assignment */}
                  <div className="divide-y divide-border/30">
                    {info.nodes.map((node, i) => (
                      <div key={i} className="p-3 flex items-center justify-between hover:bg-card/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <Network className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-foreground">{node.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-16">
                            <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" unit="" />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {node.gpuAllocated}/{node.gpuCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Node Details - List View */}
        {!isUnreachable && showNodeDetails && clusterNodes.length > 0 && (
          <div className="mb-6">
            {/* Node List */}
            <div className="divide-y divide-border/30 rounded-lg border border-border/30 overflow-hidden">
              {clusterNodes.map((node) => {
                const hasIssues = node.conditions.some(c =>
                  (c.type === 'DiskPressure' || c.type === 'MemoryPressure' || c.type === 'PIDPressure' || c.type === 'NetworkUnavailable') &&
                  c.status === 'True'
                )
                const isReady = node.status === 'Ready'
                const isSelected = expandedNodes.has(node.name)

                return (
                  <button
                    key={node.name}
                    onClick={() => {
                      setExpandedNodes(prev => {
                        const next = new Set(prev)
                        if (next.has(node.name)) next.delete(node.name)
                        else next.add(node.name)
                        return next
                      })
                    }}
                    className={`w-full p-3 flex items-center gap-3 text-left transition-colors ${
                      isSelected ? 'bg-primary/10' : 'hover:bg-card/50'
                    }`}
                  >
                    <Server className={`w-4 h-4 flex-shrink-0 ${
                      !isReady ? 'text-red-400' :
                      hasIssues ? 'text-orange-400' :
                      'text-green-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{node.name}</span>
                        {node.roles.map(role => (
                          <span key={role} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0">{role}</span>
                        ))}
                        {hasIssues && <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                      <span>{node.cpuCapacity} CPU</span>
                      <span>{formatK8sMemory(node.memoryCapacity)}</span>
                      {node.internalIP && <span className="font-mono">{node.internalIP}</span>}
                      <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Expanded Node Details */}
            {Array.from(expandedNodes).map(nodeName => {
              const node = clusterNodes.find(n => n.name === nodeName)
              if (!node) return null
              const hasIssues = node.conditions.some(c =>
                (c.type === 'DiskPressure' || c.type === 'MemoryPressure' || c.type === 'PIDPressure' || c.type === 'NetworkUnavailable') &&
                c.status === 'True'
              )
              return (
                <div
                  key={node.name}
                  className={`rounded-lg border overflow-hidden mb-2 ${
                    hasIssues ? 'bg-orange-500/10 border-orange-500/20' : 'bg-card/50 border-border'
                  }`}
                >
                  <div className="p-3 flex items-center justify-between border-b border-border/30">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-medium"><Server className="w-3 h-3" />{t('common.node')}</span>
                      <span className="font-medium text-foreground">{node.name}</span>
                      {node.roles.map(role => (
                        <span key={role} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{role}</span>
                      ))}
                    </div>
                    <button onClick={() => setExpandedNodes(prev => { const next = new Set(prev); next.delete(node.name); return next })} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-3 space-y-3 text-sm">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div><span className="text-muted-foreground">Internal IP:</span><span className="ml-2 font-mono text-foreground">{node.internalIP || '-'}</span></div>
                      {node.externalIP && <div><span className="text-muted-foreground">External IP:</span><span className="ml-2 font-mono text-foreground">{node.externalIP}</span></div>}
                      <div><span className="text-muted-foreground">Kubelet:</span><span className="ml-2 text-foreground">{node.kubeletVersion}</span></div>
                      <div><span className="text-muted-foreground">Runtime:</span><span className="ml-2 text-foreground">{node.containerRuntime || '-'}</span></div>
                      <div><span className="text-muted-foreground">OS/Arch:</span><span className="ml-2 text-foreground">{node.os}/{node.architecture}</span></div>
                      <div><span className="text-muted-foreground">Age:</span><span className="ml-2 text-foreground">{node.age}</span></div>
                    </div>
                    <div><span className="text-muted-foreground">Capacity:</span><span className="ml-2 text-foreground">{node.cpuCapacity} CPU, {formatK8sMemory(node.memoryCapacity)} RAM, {node.podCapacity} pods</span></div>
                    {/* Conditions */}
                    <div>
                      <span className="text-muted-foreground">Conditions:</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {node.conditions.map((cond, i) => (
                          <span key={i} className={`text-xs px-2 py-1 rounded ${
                            cond.type === 'Ready' ? cond.status === 'True' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                            : cond.status === 'True' ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary text-muted-foreground'
                          }`} title={cond.message || cond.reason}>{cond.type}: {cond.status}</span>
                        ))}
                      </div>
                    </div>
                    {/* Taints */}
                    {node.taints && node.taints.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Taints:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {node.taints.map((taint, i) => (<span key={i} className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">{taint}</span>))}
                        </div>
                      </div>
                    )}
                    {/* Labels */}
                    {node.labels && Object.keys(node.labels).length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Labels:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {Object.entries(node.labels).slice(0, 10).map(([k, v]) => (
                            <span key={k} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono">{k}={v}</span>
                          ))}
                          {Object.keys(node.labels).length > 10 && <span className="text-xs text-muted-foreground">+{Object.keys(node.labels).length - 10} more</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {nodesLoading && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading node details...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issue Resource Detail Modal */}
      {selectedIssueResource && (
        <ResourceDetailModal
          resource={selectedIssueResource}
          onClose={() => setSelectedIssueResource(null)}
        />
      )}
    </div>
  )
}

export function Clusters() {
  const { t } = useTranslation()
  const { deduplicatedClusters: clusters, isLoading, isRefreshing: dataRefreshing, lastUpdated, refetch } = useClusters()
  const { showIndicator, triggerRefresh } = useRefreshIndicator(refetch)
  const isRefreshing = dataRefreshing || showIndicator
  const isFetching = isLoading || isRefreshing || showIndicator
  const { nodes: gpuNodes, isLoading: gpuLoading, error: gpuError, refetch: gpuRefetch } = useGPUNodes()
  const { operators: nvidiaOperators } = useNVIDIAOperators()
  const { isConnected, status: agentStatus } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const isModeSwitching = useIsModeSwitching()

  // When demo mode is OFF and agent is not connected, force skeleton display
  // Also show skeleton during mode switching for smooth transitions
  const isAgentOffline = agentStatus === 'disconnected'
  const forceSkeletonForOffline = !isDemoMode && isAgentOffline && !isInClusterMode()
  const { isClusterAdmin, loading: permissionsLoading } = usePermissions()
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
    clusterGroups,
    addClusterGroup,
    deleteClusterGroup,
    selectClusterGroup,
  } = useGlobalFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null)

  // Read filter from URL, default to 'all'
  const urlStatus = searchParams.get('status')
  const validFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
  const [filter, setFilterState] = useState<'all' | 'healthy' | 'unhealthy' | 'unreachable'>(validFilter)

  // Sync filter state with URL changes (e.g., when navigating from sidebar)
  useEffect(() => {
    const newFilter = (urlStatus === 'healthy' || urlStatus === 'unhealthy' || urlStatus === 'unreachable') ? urlStatus : 'all'
    if (newFilter !== filter) {
      setFilterState(newFilter)
    }
  }, [urlStatus, filter])

  // Update URL when filter changes programmatically
  const setFilter = useCallback((newFilter: 'all' | 'healthy' | 'unhealthy' | 'unreachable') => {
    setFilterState(newFilter)
    if (newFilter === 'all') {
      searchParams.delete('status')
    } else {
      searchParams.set('status', newFilter)
    }
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams])
  const [sortBy, setSortBy] = useState<'name' | 'nodes' | 'pods' | 'health'>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [layoutMode, setLayoutMode] = useState<ClusterLayoutMode>(() => {
    const stored = localStorage.getItem('kubestellar-cluster-layout-mode')
    return (stored as ClusterLayoutMode) || 'grid'
  })
  const [renamingCluster, setRenamingCluster] = useState<string | null>(null)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupClusters, setNewGroupClusters] = useState<string[]>([])
  const [showGroups, setShowGroups] = useState(false) // Collapsed by default so cluster cards are visible first

  // Additional UI state
  const [showStats, setShowStats] = useState(true) // Stats overview visible by default
  const [showClusterGrid, setShowClusterGrid] = useState(true) // Cluster cards visible by default
  const [showGPUModal, setShowGPUModal] = useState(false)

  // Use the shared dashboard hook for cards, DnD, modals, auto-refresh
  const {
    cards,
    setCards,
    addCards,
    removeCard,
    configureCard,
    updateCardWidth,
    reset,
    isCustomized,
    showAddCard,
    setShowAddCard,
    showTemplates,
    setShowTemplates,
    configuringCard,
    setConfiguringCard,
    openConfigureCard,
    showCards,
    setShowCards,
    expandCards,
    dnd: { sensors, activeId, handleDragStart, handleDragEnd },
    autoRefresh,
    setAutoRefresh,
  } = useDashboard({
    storageKey: CLUSTERS_CARDS_KEY,
    defaultCards: DEFAULT_CLUSTERS_CARDS,
    onRefresh: refetch,
  })

  // Handle addCard URL param - open modal and clear param
  useEffect(() => {
    if (searchParams.get('addCard') === 'true') {
      setShowAddCard(true)
      searchParams.delete('addCard')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams, setShowAddCard])

  // Trigger refresh when navigating to this page (location.key changes on each navigation)
  useEffect(() => {
    refetch()
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddCards = useCallback((newCards: Array<{ type: string; title: string; config: Record<string, unknown> }>) => {
    addCards(newCards)
    expandCards()
    setShowAddCard(false)
  }, [addCards, expandCards, setShowAddCard])

  const handleRemoveCard = useCallback((cardId: string) => {
    removeCard(cardId)
  }, [removeCard])

  const handleConfigureCard = useCallback((cardId: string) => {
    openConfigureCard(cardId, cards)
  }, [openConfigureCard, cards])

  const handleSaveCardConfig = useCallback((cardId: string, config: Record<string, unknown>) => {
    configureCard(cardId, config)
    setConfiguringCard(null)
  }, [configureCard, setConfiguringCard])

  const handleWidthChange = useCallback((cardId: string, newWidth: number) => {
    updateCardWidth(cardId, newWidth)
  }, [updateCardWidth])

  const applyTemplate = useCallback((template: DashboardTemplate) => {
    const newCards = template.cards.map((card, i) => ({
      id: `card-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      card_type: card.card_type,
      config: card.config || {},
      title: card.title,
    }))
    setCards(newCards)
    expandCards()
    setShowTemplates(false)
  }, [setCards, expandCards, setShowTemplates])

  const handleRenameContext = async (oldName: string, newName: string) => {
    if (!isConnected) throw new Error('Local agent not connected')
    const response = await fetch('http://127.0.0.1:8585/rename-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldName, newName }),
    })
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.message || 'Failed to rename context')
    }
    refetch()
  }

  const filteredClusters = useMemo(() => {
    let result = clusters

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    // Apply local health filter
    // Unreachable = no nodes (can't connect)
    // Healthy = has nodes and healthy flag is true
    // Unhealthy = has nodes but healthy flag is false
    if (filter === 'healthy') {
      result = result.filter(c => !isClusterUnreachable(c) && c.healthy)
    } else if (filter === 'unhealthy') {
      result = result.filter(c => !isClusterUnreachable(c) && !c.healthy)
    } else if (filter === 'unreachable') {
      result = result.filter(c => isClusterUnreachable(c))
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'nodes':
          cmp = (a.nodeCount || 0) - (b.nodeCount || 0)
          break
        case 'pods':
          cmp = (a.podCount || 0) - (b.podCount || 0)
          break
        case 'health':
          const aHealth = isClusterUnreachable(a) ? 0 : a.healthy ? 2 : 1
          const bHealth = isClusterUnreachable(b) ? 0 : b.healthy ? 2 : 1
          cmp = aHealth - bHealth
          break
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [clusters, filter, globalSelectedClusters, isAllClustersSelected, customFilter, sortBy, sortAsc])

  // Get GPU count per cluster
  const gpuByCluster = useMemo(() => {
    const map: Record<string, { total: number; allocated: number }> = {}
    gpuNodes.forEach(node => {
      const clusterKey = node.cluster.split('/')[0]
      if (!map[clusterKey]) {
        map[clusterKey] = { total: 0, allocated: 0 }
      }
      map[clusterKey].total += node.gpuCount
      map[clusterKey].allocated += node.gpuAllocated
    })
    return map
  }, [gpuNodes])

  // Base clusters after global filter (before local health filter)
  const globalFilteredClusters = useMemo(() => {
    let result = clusters

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    // Apply custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query) ||
        c.server?.toLowerCase().includes(query) ||
        c.user?.toLowerCase().includes(query)
      )
    }

    return result
  }, [clusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  const stats = useMemo(() => {
    // Calculate total GPUs from GPU nodes that match filtered clusters
    // Only include GPUs from reachable clusters
    let totalGPUs = 0
    let allocatedGPUs = 0
    globalFilteredClusters.forEach(cluster => {
      // Skip offline clusters - don't count their GPUs
      if (isClusterUnreachable(cluster)) return

      const clusterKey = cluster.name.split('/')[0]
      const gpuInfo = gpuByCluster[clusterKey] || gpuByCluster[cluster.name]
      if (gpuInfo) {
        totalGPUs += gpuInfo.total
        allocatedGPUs += gpuInfo.allocated
      }
    })

    // Separate unreachable, healthy, unhealthy - simplified logic matching sidebar
    // Note: Don't filter by "loading" state to avoid hiding clusters during refresh
    // Unreachable = reachable explicitly false or connection errors or no nodes
    const unreachable = globalFilteredClusters.filter(c => isClusterUnreachable(c)).length
    // Helper: A cluster is healthy if it has nodes OR if healthy flag is explicitly true
    const isHealthy = (c: ClusterInfo) => (c.nodeCount && c.nodeCount > 0) || c.healthy === true
    // Healthy = not unreachable and (has nodes OR healthy flag)
    const healthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && isHealthy(c)).length
    // Unhealthy = not unreachable and not healthy
    const unhealthy = globalFilteredClusters.filter(c => !isClusterUnreachable(c) && !isHealthy(c)).length
    // Loading = initial load only (no data yet), not during refresh
    const loadingCount = globalFilteredClusters.filter(c =>
      c.nodeCount === undefined && c.reachable === undefined
    ).length

    // Check if we have any reachable clusters with resource data
    const hasResourceData = globalFilteredClusters.some(c =>
      !isClusterUnreachable(c) && c.nodeCount !== undefined && c.nodeCount > 0
    )

    return {
      total: globalFilteredClusters.length,
      loading: loadingCount,
      healthy,
      unhealthy,
      unreachable,
      totalNodes: globalFilteredClusters.reduce((sum, c) => sum + (c.nodeCount || 0), 0),
      totalCPUs: globalFilteredClusters.reduce((sum, c) => sum + (c.cpuCores || 0), 0),
      totalMemoryGB: globalFilteredClusters.reduce((sum, c) => sum + (c.memoryGB || 0), 0),
      totalStorageGB: globalFilteredClusters.reduce((sum, c) => sum + (c.storageGB || 0), 0),
      totalPods: globalFilteredClusters.reduce((sum, c) => sum + (c.podCount || 0), 0),
      totalGPUs,
      allocatedGPUs,
      hasResourceData,
    }
  }, [globalFilteredClusters, gpuByCluster])

  // Determine if we should show skeleton content (loading with no data OR offline without demo OR mode switching)
  const showSkeletonContent = (isLoading && clusters.length === 0) || forceSkeletonForOffline || isModeSwitching

  // Note: We no longer block on errors - always show demo data gracefully
  // The error variable is kept for potential future use but UI always renders

  return (
    <div data-testid="clusters-page" className="pt-16">
      {/* Header */}
      <DashboardHeader
        title={t('navigation.clusters')}
        subtitle={t('cluster.subtitle')}
        icon={<Server className="w-6 h-6 text-purple-400" />}
        isFetching={isFetching}
        onRefresh={triggerRefresh}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={setAutoRefresh}
        autoRefreshId="clusters-auto-refresh"
        lastUpdated={lastUpdated}
      />

      {/* Stats Overview - collapsible */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>Stats Overview</span>
            {showStats ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {showStats && (
          showSkeletonContent ? (
            <StatsOverviewSkeleton />
          ) : (
            <StatsOverview
              stats={stats}
              onFilterByStatus={(status) => {
                setFilter(status)
                setShowClusterGrid(true) // Ensure cluster grid is visible
              }}
              onCPUClick={() => window.location.href = '/compute'}
              onMemoryClick={() => window.location.href = '/compute'}
              onStorageClick={() => window.location.href = '/storage'}
              onGPUClick={() => setShowGPUModal(true)}
              onNodesClick={() => window.location.href = '/compute'}
              onPodsClick={() => window.location.href = '/workloads'}
            />
          )
        )}
      </div>

      {/* Cluster Info Cards - collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowClusterGrid(!showClusterGrid)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <Server className="w-4 h-4" />
          <span>Cluster Info Cards {showSkeletonContent ? '' : `(${filteredClusters.length})`}</span>
          {showClusterGrid ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showClusterGrid && (
          showSkeletonContent ? (
            /* Show skeleton cluster cards when offline/loading */
            <>
              <div className="flex gap-2 mb-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-secondary/60 rounded-lg animate-pulse" />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <ClusterCardSkeleton key={i} />
                ))}
              </div>
            </>
          ) : (
            <>
              <FilterTabs
                stats={stats}
                filter={filter}
                onFilterChange={setFilter}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                sortAsc={sortAsc}
                onSortAscChange={setSortAsc}
                layoutMode={layoutMode}
                onLayoutModeChange={(mode) => {
                  setLayoutMode(mode)
                  localStorage.setItem('kubestellar-cluster-layout-mode', mode)
                }}
              />
              <ClusterGrid
                clusters={filteredClusters}
                layoutMode={layoutMode}
                gpuByCluster={gpuByCluster}
                isConnected={isConnected}
                permissionsLoading={permissionsLoading}
                isClusterAdmin={isClusterAdmin}
                onSelectCluster={setSelectedCluster}
                onRenameCluster={setRenamingCluster}
                onRefreshCluster={refreshSingleCluster}
              />
            </>
          )
        )}
      </div>

      {/* Cluster Groups */}
      {(clusterGroups.length > 0 || showGroupForm) && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowGroups(!showGroups)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Cluster Groups ({clusterGroups.length})</span>
              {showGroups ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowGroupForm(!showGroupForm)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Group
            </button>
          </div>

          {showGroups && (
            <div className="space-y-2">
              {/* New Group Form */}
              {showGroupForm && (
                <div className="glass p-4 rounded-lg space-y-3">
                  <input
                    type="text"
                    placeholder="Group name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="text-xs text-muted-foreground mb-1">Select clusters for this group:</div>
                  <div className="flex flex-wrap gap-2">
                    {clusters.map((cluster) => {
                      const isInGroup = newGroupClusters.includes(cluster.name)
                      const unreachable = isClusterUnreachable(cluster)
                      return (
                        <button
                          key={cluster.name}
                          onClick={() => {
                            if (isInGroup) {
                              setNewGroupClusters(prev => prev.filter(c => c !== cluster.name))
                            } else {
                              setNewGroupClusters(prev => [...prev, cluster.name])
                            }
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                            isInGroup
                              ? 'bg-primary/20 text-primary border border-primary/30'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent'
                          }`}
                        >
                          {unreachable ? (
                            <WifiOff className="w-3 h-3 text-yellow-400" />
                          ) : cluster.healthy ? (
                            <CheckCircle className="w-3 h-3 text-green-400" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-orange-400" />
                          )}
                          {cluster.context || cluster.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowGroupForm(false)
                        setNewGroupName('')
                        setNewGroupClusters([])
                      }}
                      className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newGroupName.trim() && newGroupClusters.length > 0) {
                          addClusterGroup({ name: newGroupName.trim(), clusters: newGroupClusters })
                          setShowGroupForm(false)
                          setNewGroupName('')
                          setNewGroupClusters([])
                        }
                      }}
                      disabled={!newGroupName.trim() || newGroupClusters.length === 0}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Create
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Groups */}
              {clusterGroups.map((group) => (
                <div
                  key={group.id}
                  className="glass p-3 rounded-lg flex items-center justify-between hover:bg-secondary/30 transition-colors"
                >
                  <button
                    onClick={() => selectClusterGroup(group.id)}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-medium text-foreground">{group.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {group.clusters.length} cluster{group.clusters.length !== 1 ? 's' : ''}
                        <span className="mx-1">·</span>
                        {group.clusters.slice(0, 3).join(', ')}
                        {group.clusters.length > 3 && ` +${group.clusters.length - 3} more`}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteClusterGroup(group.id)
                    }}
                    className="p-1.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
                    title={t('cluster.deleteGroup')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cluster Dashboard Cards Section */}
      <div className="mb-6">
        {/* Card section header with toggle and buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowCards(!showCards)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Cluster Dashboard Cards ({cards.length})</span>
            {showCards ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Cards grid */}
        {showCards && (
          <>
            {cards.length === 0 ? (
              <div className="glass p-8 rounded-lg border-2 border-dashed border-border/50 text-center">
                <div className="flex justify-center mb-4">
                  <Server className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">Cluster Dashboard</h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
                  Add cards to monitor cluster health, resource usage, and workload status.
                </p>
                <button
                  onClick={() => setShowAddCard(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Cards
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-[minmax(180px,auto)]">
                    {cards.map(card => (
                      <SortableClusterCard
                        key={card.id}
                        card={card}
                        onConfigure={() => handleConfigureCard(card.id)}
                        onRemove={() => handleRemoveCard(card.id)}
                        onWidthChange={(newWidth) => handleWidthChange(card.id, newWidth)}
                        isDragging={activeId === card.id}
                        isRefreshing={isRefreshing}
                        onRefresh={triggerRefresh}
                        lastUpdated={lastUpdated}
                      />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeId ? (
                    <div className="opacity-80 rotate-3 scale-105">
                      <DragPreviewCard card={cards.find(c => c.id === activeId)!} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </div>

      {selectedCluster && (
        <ClusterDetailModal
          clusterName={selectedCluster}
          clusterUser={clusters.find(c => c.name === selectedCluster)?.user}
          onClose={() => setSelectedCluster(null)}
          onRename={(name) => {
            setSelectedCluster(null)
            setRenamingCluster(name)
          }}
        />
      )}

      {renamingCluster && (
        <RenameModal
          clusterName={renamingCluster}
          currentDisplayName={clusters.find(c => c.name === renamingCluster)?.context || renamingCluster}
          onClose={() => setRenamingCluster(null)}
          onRename={handleRenameContext}
        />
      )}

      {/* Floating action buttons */}
      <FloatingDashboardActions
        onAddCard={() => setShowAddCard(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onResetToDefaults={reset}
        isCustomized={isCustomized}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCard}
        onClose={() => setShowAddCard(false)}
        onAddCards={handleAddCards}
        existingCardTypes={cards.map(c => c.card_type)}
      />

      {/* Card Configuration Modal */}
      {configuringCard && (
        <CardConfigModal
          card={configuringCard}
          clusters={clusters}
          onSave={(config) => handleSaveCardConfig(configuringCard.id, config)}
          onClose={() => setConfiguringCard(null)}
        />
      )}

      {/* Templates Modal */}
      <TemplatesModal
        isOpen={showTemplates}
        onClose={() => setShowTemplates(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* GPU Detail Modal */}
      {showGPUModal && (
        <GPUDetailModal
          gpuNodes={gpuNodes}
          isLoading={gpuLoading}
          error={gpuError}
          onRefresh={gpuRefetch}
          onClose={() => setShowGPUModal(false)}
          operatorStatus={nvidiaOperators}
        />
      )}
    </div>
  )
}


