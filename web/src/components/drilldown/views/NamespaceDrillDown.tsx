import { useMemo, useState } from 'react'
import { ChevronRight, Search, Box, Network, HardDrive, Layers } from 'lucide-react'
import { usePodIssues, useDeploymentIssues, useEvents, useDeployments, useServices, usePVCs, usePods } from '../../../hooks/useMCP'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { StatusIndicator } from '../../charts/StatusIndicator'
import { StatusBadge } from '../../ui/StatusBadge'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'

type TabType = 'issues' | 'events' | 'resources'
type ResourceFilter = 'all' | 'pods' | 'deployments' | 'services' | 'pvcs'

interface Props {
  data: Record<string, unknown>
}

export function NamespaceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const { drillToDeployment, drillToPod, drillToEvents } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('issues')
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('all')
  const [resourceSearch, setResourceSearch] = useState('')

  const { issues: allPodIssues } = usePodIssues(cluster)
  const { issues: allDeploymentIssues } = useDeploymentIssues()
  const { events } = useEvents(cluster, namespace, 20)

  // Resource hooks for the Resources tab
  const clusterShort = cluster.split('/').pop() || cluster
  const { deployments: allDeployments } = useDeployments(clusterShort, namespace)
  const { services: allServices } = useServices(clusterShort, namespace)
  const { pvcs: allPVCs } = usePVCs(clusterShort, namespace)
  const { pods: allPods } = usePods(clusterShort, namespace)

  const podIssues = useMemo(() =>
    allPodIssues.filter(p => p.namespace === namespace),
    [allPodIssues, namespace]
  )

  const deploymentIssues = useMemo(() =>
    allDeploymentIssues.filter(d => d.namespace === namespace &&
      (d.cluster === cluster || d.cluster?.includes(cluster.split('/')[0]))),
    [allDeploymentIssues, namespace, cluster]
  )

  const nsEvents = useMemo(() =>
    events.filter(e => e.namespace === namespace),
    [events, namespace]
  )

  // Filtered resources for the Resources tab
  const filteredDeployments = useMemo(() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'deployments') return []
    let deps = allDeployments || []
    if (resourceSearch) {
      deps = deps.filter(d => d.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return deps
  }, [allDeployments, resourceFilter, resourceSearch])

  const filteredServices = useMemo(() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'services') return []
    let svcs = allServices || []
    if (resourceSearch) {
      svcs = svcs.filter(s => s.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return svcs
  }, [allServices, resourceFilter, resourceSearch])

  const filteredPVCs = useMemo(() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'pvcs') return []
    let pvcs = allPVCs || []
    if (resourceSearch) {
      pvcs = pvcs.filter(p => p.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return pvcs
  }, [allPVCs, resourceFilter, resourceSearch])

  const filteredPods = useMemo(() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'pods') return []
    let pods = allPods || []
    if (resourceSearch) {
      pods = pods.filter(p => p.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return pods
  }, [allPods, resourceFilter, resourceSearch])

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'issues', label: 'Issues', count: podIssues.length + deploymentIssues.length },
    { id: 'events', label: t('drilldown.fields.recentEvents'), count: nsEvents.length },
    { id: 'resources', label: 'Resources', count: (allDeployments?.length || 0) + (allServices?.length || 0) + (allPVCs?.length || 0) + (allPods?.length || 0) },
  ]

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Deployments with Issues</div>
          <div className="text-2xl font-bold text-foreground">{deploymentIssues.length}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">Pods with Issues</div>
          <div className="text-2xl font-bold text-foreground">{podIssues.length}</div>
        </div>
        <div className="p-4 rounded-lg bg-card/50 border border-border">
          <div className="text-sm text-muted-foreground mb-2">{t('drilldown.fields.recentEvents')}</div>
          <div className="text-2xl font-bold text-foreground">{nsEvents.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'issues' && (
        <div className="space-y-6">
          {/* Deployment Issues */}
          {deploymentIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Deployment Issues</h3>
              <div className="space-y-2">
                {deploymentIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToDeployment(cluster, namespace, issue.name, { ...issue })}
                    className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">{issue.name}</span>
                          <StatusBadge color="orange" size="xs">
                            {issue.readyReplicas}/{issue.replicas} ready
                          </StatusBadge>
                        </div>
                        {issue.reason && (
                          <div className="text-sm text-muted-foreground">Reason: {issue.reason}</div>
                        )}
                        {issue.message && (
                          <div className="text-xs text-orange-400 mt-1">{issue.message}</div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pod Issues */}
          {podIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">Pod Issues</h3>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <div
                    key={i}
                    onClick={() => drillToPod(cluster, namespace, issue.name, { ...issue })}
                    className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-foreground">{issue.name}</span>
                          <StatusBadge color="red" size="xs">
                            {issue.status}
                          </StatusBadge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{issue.restarts} restarts</span>
                          {issue.reason && <span>• {issue.reason}</span>}
                        </div>
                        {issue.issues.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {issue.issues.map((iss, j) => (
                              <StatusBadge key={j} color="red" size="xs">
                                {iss}
                              </StatusBadge>
                            ))}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {deploymentIssues.length === 0 && podIssues.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">✨</div>
              <p className="text-lg text-foreground">All clear!</p>
              <p className="text-sm text-muted-foreground">No issues found in this namespace</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-4">
          {/* Quick action to view full events drilldown */}
          <div className="flex justify-end">
            <button
              onClick={() => drillToEvents(cluster, namespace)}
              className="px-4 py-2 rounded-lg bg-card/50 border border-border text-sm text-foreground hover:bg-card transition-colors"
            >
              View All Events
            </button>
          </div>

          {nsEvents.length > 0 ? (
            <div className="space-y-2">
              {nsEvents.map((event, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-lg border-l-4 ${
                    event.type === 'Warning'
                      ? 'bg-yellow-500/10 border-l-yellow-500'
                      : 'bg-card/50 border-l-green-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <StatusIndicator status={event.type === 'Warning' ? 'warning' : 'healthy'} size="sm" />
                    <span className="font-medium text-foreground text-sm">{event.reason}</span>
                    <span className="text-xs text-muted-foreground">on {event.object}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{event.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No recent events in this namespace</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'resources' && (
        <div className="space-y-4">
          {/* Search and Filter Controls */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
                placeholder="Search resources..."
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'all' as ResourceFilter, label: 'All', icon: Layers },
                { id: 'pods' as ResourceFilter, label: 'Pods', icon: Box },
                { id: 'deployments' as ResourceFilter, label: 'Deployments', icon: Box },
                { id: 'services' as ResourceFilter, label: 'Services', icon: Network },
                { id: 'pvcs' as ResourceFilter, label: 'PVCs', icon: HardDrive },
              ]).map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setResourceFilter(filter.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors',
                    resourceFilter === filter.id
                      ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                      : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  <filter.icon className="w-3.5 h-3.5" />
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pods */}
          {filteredPods.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Pods ({filteredPods.length})</h4>
              <div className="space-y-1">
                {filteredPods.slice(0, 20).map((pod, i) => (
                  <div
                    key={i}
                    onClick={() => drillToPod(cluster, namespace, pod.name, { ...pod })}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                  >
                    <div className={`w-2 h-2 rounded-full ${pod.status === 'Running' ? 'bg-green-400' : pod.status === 'Pending' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                    <Box className="w-3 h-3 text-green-400" />
                    <span className="text-sm text-foreground">{pod.name}</span>
                    <StatusBadge
                      color={pod.status === 'Running' ? 'green' : pod.status === 'Pending' ? 'yellow' : 'red'}
                      size="xs"
                    >
                      {pod.status}
                    </StatusBadge>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                  </div>
                ))}
                {filteredPods.length > 20 && (
                  <div className="text-xs text-muted-foreground p-2">+{filteredPods.length - 20} more pods...</div>
                )}
              </div>
            </div>
          )}

          {/* Deployments */}
          {filteredDeployments.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Deployments ({filteredDeployments.length})</h4>
              <div className="space-y-1">
                {filteredDeployments.slice(0, 20).map((dep, i) => (
                  <div
                    key={i}
                    onClick={() => drillToDeployment(cluster, namespace, dep.name, { ...dep })}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                  >
                    <Box className="w-3 h-3 text-blue-400" />
                    <span className="text-sm text-foreground">{dep.name}</span>
                    <span className={`text-xs ${dep.readyReplicas === dep.replicas ? 'text-green-400' : 'text-yellow-400'}`}>
                      {dep.readyReplicas}/{dep.replicas}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                  </div>
                ))}
                {filteredDeployments.length > 20 && (
                  <div className="text-xs text-muted-foreground p-2">+{filteredDeployments.length - 20} more deployments...</div>
                )}
              </div>
            </div>
          )}

          {/* Services */}
          {filteredServices.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Services ({filteredServices.length})</h4>
              <div className="space-y-1">
                {filteredServices.slice(0, 20).map((svc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                  >
                    <Network className="w-3 h-3 text-blue-400" />
                    <span className="text-sm text-foreground">{svc.name}</span>
                    <StatusBadge color="blue" size="xs">{svc.type}</StatusBadge>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                  </div>
                ))}
                {filteredServices.length > 20 && (
                  <div className="text-xs text-muted-foreground p-2">+{filteredServices.length - 20} more services...</div>
                )}
              </div>
            </div>
          )}

          {/* PVCs */}
          {filteredPVCs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">PVCs ({filteredPVCs.length})</h4>
              <div className="space-y-1">
                {filteredPVCs.slice(0, 20).map((pvc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/50 cursor-pointer group"
                  >
                    <HardDrive className="w-3 h-3 text-green-400" />
                    <span className="text-sm text-foreground">{pvc.name}</span>
                    <StatusBadge
                      color={pvc.status === 'Bound' ? 'green' : 'yellow'}
                      size="xs"
                    >
                      {pvc.status}
                    </StatusBadge>
                    {pvc.capacity && <span className="text-xs text-muted-foreground">{pvc.capacity}</span>}
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto" />
                  </div>
                ))}
                {filteredPVCs.length > 20 && (
                  <div className="text-xs text-muted-foreground p-2">+{filteredPVCs.length - 20} more PVCs...</div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredPods.length === 0 && filteredDeployments.length === 0 && filteredServices.length === 0 && filteredPVCs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                {resourceSearch ? 'No resources match the current search' : 'No resources found in this namespace'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
