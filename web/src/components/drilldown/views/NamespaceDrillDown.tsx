import { useState } from 'react'
import { Search, Box, Network, HardDrive, Layers, Server } from 'lucide-react'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { ClusterBadge } from '../../ui/ClusterBadge'
import { useTranslation } from 'react-i18next'
import { useTabKeyboardNav } from '../../../hooks/useKeyboardNav'
import { cn } from '../../../lib/cn'
import { useNamespaceDrillDown } from './useNamespaceDrillDown'
import {
  DeploymentIssueRow,
  PodIssueRow,
  EventRow,
  PodRow,
  DeploymentRow,
  ServiceRow,
  PVCRow,
  OverviewStats,
} from './NamespaceDrillDown.parts'

type TabType = 'issues' | 'events' | 'resources'
type ResourceFilter = 'all' | 'pods' | 'deployments' | 'services' | 'pvcs'

interface Props {
  data: Record<string, unknown>
}

export function NamespaceDrillDown({ data }: Props) {
  const { t } = useTranslation()
  const cluster = data.cluster as string
  const namespace = data.namespace as string
  const clusterShort = cluster.split('/').pop() || cluster
  const { drillToDeployment, drillToPod, drillToEvents, drillToCluster } = useDrillDownActions()

  const [activeTab, setActiveTab] = useState<TabType>('issues')
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('all')
  const [resourceSearch, setResourceSearch] = useState('')
  const { tabListProps, getTabProps, getTabPanelProps } = useTabKeyboardNav<TabType>({ tabs: ['issues', 'events', 'resources'], activeTab, onChange: setActiveTab })

  const {
    podIssues,
    deploymentIssues,
    nsEvents,
    allDeployments,
    allServices,
    allPVCs,
    allPods,
  } = useNamespaceDrillDown(cluster, namespace)

  // Filtered resources for the Resources tab
  const filteredDeployments = (() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'deployments') return []
    let deps = allDeployments || []
    if (resourceSearch) {
      deps = deps.filter(d => d.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return deps
  })()

  const filteredServices = (() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'services') return []
    let svcs = allServices || []
    if (resourceSearch) {
      svcs = svcs.filter(s => s.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return svcs
  })()

  const filteredPVCs = (() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'pvcs') return []
    let pvcs = allPVCs || []
    if (resourceSearch) {
      pvcs = pvcs.filter(p => p.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return pvcs
  })()

  const filteredPods = (() => {
    if (resourceFilter !== 'all' && resourceFilter !== 'pods') return []
    let pods = allPods || []
    if (resourceSearch) {
      pods = pods.filter(p => p.name.toLowerCase().includes(resourceSearch.toLowerCase()))
    }
    return pods
  })()

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'issues', label: t('drilldown.tabs.issues', 'Issues'), count: podIssues.length + deploymentIssues.length },
    { id: 'events', label: t('drilldown.fields.recentEvents'), count: nsEvents.length },
    { id: 'resources', label: t('drilldown.tabs.resources', 'Resources'), count: (allDeployments?.length || 0) + (allServices?.length || 0) + (allPVCs?.length || 0) + (allPods?.length || 0) },
  ]

  return (
    <div className="space-y-6">
      {/* Contextual Navigation */}
      <div className="flex items-center gap-6 text-sm">
        <button
          onClick={() => drillToCluster(cluster)}
          className="flex items-center gap-2 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/30 px-3 py-1.5 rounded-lg transition-all group cursor-pointer"
        >
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-muted-foreground">{t('drilldown.fields.cluster')}</span>
          <ClusterBadge cluster={clusterShort} size="sm" />
          <svg className="w-3 h-3 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Overview Stats */}
      <OverviewStats
        deploymentIssuesCount={deploymentIssues.length}
        podIssuesCount={podIssues.length}
        eventsCount={nsEvents.length}
      />

      {/* Tabs */}
      <div className="border-b border-border">
        <div {...tabListProps} className="flex gap-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              {...getTabProps(tab.id)}
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
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'issues' && (
        <div {...getTabPanelProps('issues')} className="space-y-6">
          {/* Deployment Issues */}
          {deploymentIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('drilldown.namespace.deploymentIssues', 'Deployment Issues')}</h3>
              <div className="space-y-2">
                {deploymentIssues.map((issue, i) => (
                  <DeploymentIssueRow
                    key={i}
                    issue={issue}
                    onClick={() => drillToDeployment(cluster, namespace, issue.name, { ...issue })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pod Issues */}
          {podIssues.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('drilldown.namespace.podIssues', 'Pod Issues')}</h3>
              <div className="space-y-2">
                {podIssues.map((issue, i) => (
                  <PodIssueRow
                    key={i}
                    issue={issue}
                    onClick={() => drillToPod(cluster, namespace, issue.name, { ...issue })}
                  />
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
        <div {...getTabPanelProps('events')} className="space-y-4">
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
                <EventRow key={i} event={event} />
              ))}
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
        <div {...getTabPanelProps('resources')} className="space-y-4">
          {/* Search and Filter Controls */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={resourceSearch}
                onChange={(e) => setResourceSearch(e.target.value)}
                placeholder="Search resources..."
                className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-purple-500/50"
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
                  <PodRow key={i} pod={pod} onClick={() => drillToPod(cluster, namespace, pod.name, { ...pod })} />
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
                  <DeploymentRow key={i} deployment={dep} onClick={() => drillToDeployment(cluster, namespace, dep.name, { ...dep })} />
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
                  <ServiceRow key={i} service={svc} />
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
                  <PVCRow key={i} pvc={pvc} />
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
