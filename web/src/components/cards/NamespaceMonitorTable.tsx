import { memo } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Layers, RefreshCw, Server } from 'lucide-react'
import type { ClusterInfo } from '../../hooks/useMCP'
import type {
  ChangeType,
  ModalResource,
  NamespaceData,
  ResourceType,
} from './NamespaceMonitor.types'
import { MAX_NAMESPACES_RENDERED_PER_CLUSTER } from './NamespaceMonitor.utils'
import { ResourceSection } from './namespacemonitor/NamespaceMonitorResourceSection'
import { cn } from '@/lib/cn'

// Pure UI component — renders namespace/resource table based on props; no data fetching.
// useCardLoadingState is handled by the parent NamespaceMonitor card.
// Demo data support provided by parent NamespaceMonitor card via useCached* hooks.
// Intentionally does not call useCardData/useCardDemoState (lib/cards/cardHooks):
// this component owns no data source or demo-mode decision of its own — those
// concerns live in the parent NamespaceMonitor card, which is the standardized
// card hook integration point for this feature.

interface NamespaceMonitorTableProps {
  filteredClusters: ClusterInfo[]
  selectedCluster: string | null
  expandedClusters: Set<string>
  expandedNamespaces: Set<string>
  activeResourceTypes: Set<ResourceType>
  getNamespaceData: (clusterName: string) => Map<string, NamespaceData>
  getResourceChange: (cluster: string, namespace: string, type: ResourceType, name: string) => ChangeType
  clearChangeAfterTimeout: (key: string) => void
  onToggleCluster: (clusterName: string) => void
  onToggleNamespace: (namespaceKey: string) => void
  onDrillToNamespace: (clusterName: string, namespace: string) => void
  onDrillToResource: (resource: ModalResource) => void
  onOpenResource: (resource: ModalResource) => void
}

function NamespaceMonitorTableComponent({
  filteredClusters,
  selectedCluster,
  expandedClusters,
  expandedNamespaces,
  activeResourceTypes,
  getNamespaceData,
  getResourceChange,
  clearChangeAfterTimeout,
  onToggleCluster,
  onToggleNamespace,
  onDrillToNamespace,
  onDrillToResource,
  onOpenResource,
}: NamespaceMonitorTableProps) {
  return (
    <div className="flex-1 bg-card/30 rounded-lg border border-border overflow-y-auto min-h-card-content">
      <div className="p-2">
        {(filteredClusters || []).map(cluster => {
          const isExpanded = expandedClusters.has(cluster.name)
          const namespaceData = isExpanded ? getNamespaceData(cluster.name) : new Map<string, NamespaceData>()
          const allNamespaces = Array.from(namespaceData.keys())
            .filter(namespace => !namespace.startsWith('kube-') && namespace !== 'openshift' && !namespace.startsWith('openshift-'))
            .sort()
          const namespaceList = allNamespaces.slice(0, MAX_NAMESPACES_RENDERED_PER_CLUSTER)
          const truncatedCount = allNamespaces.length - namespaceList.length

          const isClusterLoading = selectedCluster !== cluster.name

          return (
            <div key={cluster.name} className="mb-1">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer group"
                onClick={() => onToggleCluster(cluster.name)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                <Server className={`w-4 h-4 ${cluster.healthy ? 'text-green-400' : 'text-red-400'}`} />
                <span className="text-sm text-foreground flex-1">{cluster.context || cluster.name}</span>
                <span className="text-xs text-muted-foreground">{cluster.nodeCount} nodes</span>
              </div>

              {isExpanded && (
                <div className="ml-6 border-l border-border/50">
                  {isClusterLoading ? (
                    <div className="flex items-center gap-2 py-2 px-4 text-xs text-muted-foreground">
                      <RefreshCw className={cn('w-3 h-3', isClusterLoading && 'animate-spin')} />
                      Loading...
                    </div>
                  ) : namespaceList.length === 0 ? (
                    <div className="py-2 px-4 text-xs text-muted-foreground">No namespaces found</div>
                  ) : (
                    (namespaceList || []).map(namespace => {
                      const namespaceKey = `${cluster.name}:${namespace}`
                      const isNamespaceExpanded = expandedNamespaces.has(namespaceKey)
                      const data = namespaceData.get(namespace)

                      if (!data) {
                        return null
                      }

                      return (
                        <div key={namespace} className="mb-0.5">
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                            className={`flex items-center gap-2 py-1.5 px-4 rounded-md hover:bg-secondary/50 transition-colors cursor-pointer ${
                              data.hasIssues ? 'bg-red-500/5' : ''
                            }`}
                            onClick={() => onToggleNamespace(namespaceKey)}
                          >
                            {isNamespaceExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                            <Layers className={`w-3.5 h-3.5 ${data.hasIssues ? 'text-yellow-400' : 'text-blue-400'}`} />
                            <span
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
                              className="text-sm text-foreground flex-1 hover:text-purple-400"
                              onClick={event => {
                                event.stopPropagation()
                                onDrillToNamespace(cluster.name, namespace)
                              }}
                            >
                              {namespace}
                            </span>
                            {data.hasIssues && <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />}
                          </div>

                          {isNamespaceExpanded && (
                            <div className="ml-4 border-l border-border/30">
                              {activeResourceTypes.has('pods') && data.pods.length > 0 && (
                                <ResourceSection
                                  type="pods"
                                  items={(data.pods || []).map(pod => ({
                                    name: pod.name,
                                    status: pod.status,
                                    healthy: pod.status === 'Running' || pod.status === 'Succeeded',
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={name =>
                                    onDrillToResource({ type: 'pods', name, namespace, cluster: cluster.name })
                                  }
                                  onItemAction={name =>
                                    onOpenResource({ type: 'pods', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('deployments') && data.deployments.length > 0 && (
                                <ResourceSection
                                  type="deployments"
                                  items={(data.deployments || []).map(deployment => ({
                                    name: deployment.name,
                                    status: `${deployment.readyReplicas}/${deployment.replicas}`,
                                    healthy: deployment.readyReplicas === deployment.replicas,
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={name =>
                                    onDrillToResource({ type: 'deployments', name, namespace, cluster: cluster.name })
                                  }
                                  onItemAction={name =>
                                    onOpenResource({ type: 'deployments', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('services') && data.services.length > 0 && (
                                <ResourceSection
                                  type="services"
                                  items={(data.services || []).map(service => ({
                                    name: service.name,
                                    status: service.type,
                                    healthy: true,
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={name =>
                                    onDrillToResource({ type: 'services', name, namespace, cluster: cluster.name })
                                  }
                                  onItemAction={name =>
                                    onOpenResource({ type: 'services', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('configmaps') && data.configmaps.length > 0 && (
                                <ResourceSection
                                  type="configmaps"
                                  items={(data.configmaps || []).map(configMap => ({
                                    name: configMap.name,
                                    status: `${configMap.dataCount || 0} keys`,
                                    healthy: true,
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={() => {}}
                                  onItemAction={name =>
                                    onOpenResource({ type: 'configmaps', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('secrets') && data.secrets.length > 0 && (
                                <ResourceSection
                                  type="secrets"
                                  items={(data.secrets || []).map(secret => ({
                                    name: secret.name,
                                    status: secret.type || 'Opaque',
                                    healthy: true,
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={() => {}}
                                  onItemAction={name =>
                                    onOpenResource({ type: 'secrets', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('pvcs') && data.pvcs.length > 0 && (
                                <ResourceSection
                                  type="pvcs"
                                  items={(data.pvcs || []).map(pvc => ({
                                    name: pvc.name,
                                    status: pvc.status,
                                    healthy: pvc.status === 'Bound',
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={name =>
                                    onDrillToResource({ type: 'pvcs', name, namespace, cluster: cluster.name })
                                  }
                                  onItemAction={name =>
                                    onOpenResource({ type: 'pvcs', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}

                              {activeResourceTypes.has('jobs') && data.jobs.length > 0 && (
                                <ResourceSection
                                  type="jobs"
                                  items={(data.jobs || []).map(job => ({
                                    name: job.name,
                                    status: job.status,
                                    healthy: job.status === 'Complete',
                                  }))}
                                  cluster={cluster.name}
                                  namespace={namespace}
                                  getResourceChange={getResourceChange}
                                  clearChangeAfterTimeout={clearChangeAfterTimeout}
                                  onItemClick={() => {}}
                                  onItemAction={name =>
                                    onOpenResource({ type: 'jobs', name, namespace, cluster: cluster.name })
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                  {truncatedCount > 0 && (
                    <div className="py-2 px-4 text-xs text-muted-foreground italic">
                      +{truncatedCount} more namespace{truncatedCount === 1 ? '' : 's'} not shown — use the
                      search box to narrow down.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filteredClusters.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">No clusters match the current filter</div>
        )}
      </div>
    </div>
  )
}

export const NamespaceMonitorTable = memo(NamespaceMonitorTableComponent)
