import { useMemo, useState } from 'react'
import {
  Cpu, Network, Activity, Layers, Server,
  RefreshCw, Loader2, ChevronDown, ChevronRight,
} from 'lucide-react'
import { Skeleton } from '../../ui/Skeleton'
import { useCachedLLMdServers } from '../../../hooks/useCachedData'
import { useWorkloadMonitor } from '../../../hooks/useWorkloadMonitor'
import { cn } from '../../../lib/cn'
import { WorkloadMonitorAlerts } from './WorkloadMonitorAlerts'
import { WorkloadMonitorDiagnose } from './WorkloadMonitorDiagnose'
import { LLMD_CLUSTERS } from '../workload-detection/shared'
import type { MonitorIssue, MonitoredResource } from '../../../types/workloadMonitor'

interface LLMdStackMonitorProps {
  config?: Record<string, unknown>
}

interface ComponentSection {
  label: string
  icon: typeof Cpu
  color: string
  items: ComponentItem[]
}

interface ComponentItem {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  detail?: string
  cluster?: string
}

const STATUS_DOT: Record<string, string> = {
  healthy: 'bg-green-400',
  degraded: 'bg-yellow-400',
  unhealthy: 'bg-red-400',
  unknown: 'bg-gray-400',
  running: 'bg-green-400',
  scaling: 'bg-yellow-400',
  stopped: 'bg-red-400',
  error: 'bg-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  healthy: 'bg-green-500/20 text-green-400',
  degraded: 'bg-yellow-500/20 text-yellow-400',
  unhealthy: 'bg-red-500/20 text-red-400',
  unknown: 'bg-gray-500/20 text-gray-400',
}

export function LLMdStackMonitor({ config: _config }: LLMdStackMonitorProps) {
  const { servers, isLoading: serversLoading, isRefreshing: serversRefreshing, refetch: refetchServers } = useCachedLLMdServers(LLMD_CLUSTERS)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Model Serving', 'EPP', 'Gateway']))

  // Use workload monitor for the primary llm-d namespace
  const llmdCluster = LLMD_CLUSTERS[0] || ''
  const {
    resources,
    issues,
    overallStatus,
    isLoading: monitorLoading,
    isRefreshing: monitorRefreshing,
    refetch: refetchMonitor,
  } = useWorkloadMonitor(llmdCluster, 'llm-d', '', {
    autoRefreshMs: 30_000,
  })

  const isLoading = serversLoading || monitorLoading
  const isRefreshing = serversRefreshing || monitorRefreshing

  // Build component sections from llm-d server data
  const sections = useMemo<ComponentSection[]>(() => {
    const modelServers = servers.filter(s => s.componentType === 'model')
    const eppServers = servers.filter(s => s.componentType === 'epp')
    const gateways = servers.filter(s => s.componentType === 'gateway')
    const prometheus = servers.filter(s => s.componentType === 'prometheus')
    const autoscalers = servers.filter(s => s.componentType === 'autoscaler')

    const mapStatus = (s: string): ComponentItem['status'] => {
      if (s === 'running') return 'healthy'
      if (s === 'scaling') return 'degraded'
      if (s === 'stopped' || s === 'error') return 'unhealthy'
      return 'unknown'
    }

    return [
      {
        label: 'Model Serving',
        icon: Cpu,
        color: 'text-purple-400',
        items: modelServers.map(s => ({
          name: s.name,
          status: mapStatus(s.status),
          detail: `${s.type || 'vLLM'} · ${s.model || 'unknown'} · ${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`,
          cluster: s.cluster,
        })),
      },
      {
        label: 'EPP',
        icon: Layers,
        color: 'text-blue-400',
        items: eppServers.map(s => ({
          name: s.name,
          status: mapStatus(s.status),
          detail: `${s.readyReplicas ?? 0}/${s.replicas ?? 0} replicas`,
          cluster: s.cluster,
        })),
      },
      {
        label: 'Gateway',
        icon: Network,
        color: 'text-cyan-400',
        items: gateways.map(s => ({
          name: s.name,
          status: mapStatus(s.status),
          detail: s.namespace,
          cluster: s.cluster,
        })),
      },
      {
        label: 'Prometheus',
        icon: Activity,
        color: 'text-orange-400',
        items: prometheus.map(s => ({
          name: s.name,
          status: mapStatus(s.status),
          detail: s.namespace,
          cluster: s.cluster,
        })),
      },
      {
        label: 'Autoscaler',
        icon: Server,
        color: 'text-green-400',
        items: autoscalers.map(s => ({
          name: s.name,
          status: mapStatus(s.status),
          detail: s.autoscalerType || 'HPA',
          cluster: s.cluster,
        })),
      },
    ].filter(s => s.items.length > 0)
  }, [servers])

  // Combine issues from monitor and synthesized from llm-d
  const allIssues = useMemo<MonitorIssue[]>(() => {
    const monitorIssues = [...issues]
    // Add synthetic issues from unhealthy llm-d servers
    servers.forEach((s) => {
      if (s.status === 'error' || s.status === 'stopped') {
        monitorIssues.push({
          id: `llmd-${s.name}-${s.status}`,
          resource: {
            id: `${'Deployment'}/${s.namespace}/${s.name}`,
            kind: 'Deployment',
            name: s.name,
            namespace: s.namespace,
            cluster: s.cluster,
            status: s.status === 'error' ? 'unhealthy' : 'degraded',
            category: 'workload',
            lastChecked: new Date().toISOString(),
            optional: false,
            order: 0,
          },
          severity: s.status === 'error' ? 'critical' : 'warning',
          title: `${s.componentType} ${s.name} is ${s.status}`,
          description: `Server ${s.name} in namespace ${s.namespace} is ${s.status}`,
          detectedAt: new Date().toISOString(),
        })
      }
    })
    return monitorIssues
  }, [issues, servers])

  // Combine resources
  const allResources = useMemo<MonitoredResource[]>(() => {
    if (resources.length > 0) return resources
    // Synthesize from servers if no monitor resources
    return servers.map((s, idx) => ({
      id: `${'Deployment'}/${s.namespace}/${s.name}`,
      kind: 'Deployment',
      name: s.name,
      namespace: s.namespace,
      cluster: s.cluster,
      status: s.status === 'running' ? 'healthy' as const :
              s.status === 'scaling' ? 'degraded' as const :
              s.status === 'error' ? 'unhealthy' as const : 'unknown' as const,
      category: 'workload' as const,
      lastChecked: new Date().toISOString(),
      optional: false,
      order: idx,
    }))
  }, [resources, servers])

  // Calculate overall health
  const stackHealth = useMemo(() => {
    if (overallStatus !== 'unknown') return overallStatus
    const statuses = sections.flatMap(s => s.items.map(i => i.status))
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy'
    if (statuses.some(s => s === 'degraded')) return 'degraded'
    if (statuses.every(s => s === 'healthy')) return 'healthy'
    return 'unknown'
  }, [overallStatus, sections])

  const toggleSection = (label: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const handleRefresh = () => {
    refetchServers()
    refetchMonitor()
  }

  if (isLoading && servers.length === 0) {
    return (
      <div className="space-y-3">
        <Skeleton variant="text" width={180} height={20} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="rounded" height={40} />
      </div>
    )
  }

  // Empty state
  if (servers.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Cpu className="w-8 h-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No llm-d stack detected. Deploy llm-d to see monitoring data.
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Looking in clusters: {LLMD_CLUSTERS.join(', ')}
        </p>
      </div>
    )
  }

  const totalComponents = sections.reduce((acc, s) => acc + s.items.length, 0)
  const healthyComponents = sections.reduce(
    (acc, s) => acc + s.items.filter(i => i.status === 'healthy').length,
    0,
  )

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Header */}
      <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-3 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-medium text-foreground">llm-d Stack</span>
        <span className="text-xs text-muted-foreground">
          {healthyComponents}/{totalComponents} components
        </span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded ml-auto', STATUS_BADGE[stackHealth] || STATUS_BADGE.unknown)}>
          {stackHealth}
        </span>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-secondary transition-colors"
          title="Refresh"
        >
          {isRefreshing
            ? <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      </div>

      {/* Component sections */}
      <div className="flex-1 overflow-y-auto space-y-0.5">
        {sections.map(section => {
          const SectionIcon = section.icon
          const isExpanded = expandedSections.has(section.label)
          const sectionHealthy = section.items.filter(i => i.status === 'healthy').length
          const allHealthy = sectionHealthy === section.items.length

          return (
            <div key={section.label} className="border-b border-border/30 last:border-0">
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center gap-2 py-1.5 px-1 text-left hover:bg-card/30 rounded transition-colors"
              >
                {isExpanded
                  ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                <SectionIcon className={cn('w-3.5 h-3.5 shrink-0', section.color)} />
                <span className="text-sm text-foreground flex-1">{section.label}</span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  allHealthy ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400',
                )}>
                  {sectionHealthy}/{section.items.length}
                </span>
              </button>
              {isExpanded && (
                <div className="ml-8 mb-1.5 space-y-0.5">
                  {section.items.map((item, idx) => (
                    <div key={`${section.label}-${idx}-${item.name}`} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-card/30 transition-colors">
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[item.status] || 'bg-gray-400')} />
                      <span className="text-xs text-foreground truncate flex-1">{item.name}</span>
                      {item.detail && (
                        <span className="text-[10px] text-muted-foreground shrink-0 truncate max-w-[200px]">
                          {item.detail}
                        </span>
                      )}
                      {item.cluster && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-muted-foreground shrink-0">
                          {item.cluster}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Alerts */}
      <WorkloadMonitorAlerts issues={allIssues} />

      {/* AI Diagnose (no repair for llm-d) */}
      <WorkloadMonitorDiagnose
        resources={allResources}
        issues={allIssues}
        monitorType="llmd"
        diagnosable={true}
        repairable={false}
        workloadContext={{
          clusters: LLMD_CLUSTERS,
          stackHealth,
          totalComponents,
          healthyComponents,
          sections: sections.map(s => ({
            label: s.label,
            total: s.items.length,
            healthy: s.items.filter(i => i.status === 'healthy').length,
          })),
        }}
      />
    </div>
  )
}
