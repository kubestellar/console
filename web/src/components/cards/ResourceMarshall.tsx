import { useState, useCallback, useMemo } from 'react'
import {
  Package,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  FileText,
  Search,
} from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useNamespaces } from '../../hooks/useMCP'
import { useWorkloads } from '../../hooks/useWorkloads'
import { useResolveDependencies, type ResolvedDependency } from '../../hooks/useDependencies'
import { cn } from '../../lib/cn'
import { DEP_CATEGORIES, KIND_ICONS, KNOWN_DEPENDENCY_KINDS } from '../../lib/resourceCategories'
import { useCardLoadingState } from './CardDataContext'
import { ClusterSelect } from '../ui/ClusterSelect'

function groupDependencies(deps: ResolvedDependency[]) {
  const groups: { label: string; icon: typeof FileText; deps: ResolvedDependency[] }[] = []

  for (const cat of DEP_CATEGORIES) {
    const matching = deps.filter(d => cat.kinds.includes(d.kind))
    if (matching.length > 0) {
      groups.push({ label: cat.label, icon: cat.icon, deps: matching })
    }
  }

  // Catch-all for any kinds not in categories
  const uncategorized = deps.filter(d => !KNOWN_DEPENDENCY_KINDS.has(d.kind))
  if (uncategorized.length > 0) {
    groups.push({ label: 'Other', icon: FileText, deps: uncategorized })
  }

  return groups
}

export function ResourceMarshall() {
  const { deduplicatedClusters: clusters, isLoading } = useClusters()

  const [selectedCluster, setSelectedCluster] = useState<string>('')
  const [selectedNamespace, setSelectedNamespace] = useState<string>('')
  const [selectedWorkload, setSelectedWorkload] = useState<string>('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Report loading state to CardWrapper for skeleton/refresh behavior
  useCardLoadingState({
    isLoading,
    hasAnyData: clusters.length > 0,
  })

  // Fetch namespaces for selected cluster
  const { namespaces, isLoading: nsLoading } = useNamespaces(selectedCluster || undefined)

  // Fetch workloads only when both cluster and namespace are selected.
  // Passing enabled=false prevents fetching all workloads across clusters.
  const hasSelection = !!selectedCluster && !!selectedNamespace
  const workloadOpts = useMemo(() => {
    if (!selectedCluster || !selectedNamespace) return undefined
    return { cluster: selectedCluster, namespace: selectedNamespace }
  }, [selectedCluster, selectedNamespace])
  const { data: workloads, isLoading: wlLoading } = useWorkloads(workloadOpts, hasSelection)

  // Dependency resolution
  const { data: depData, isLoading: depLoading, error: depError, resolve, reset } = useResolveDependencies()

  // Handle cluster change
  const handleClusterChange = useCallback((cluster: string) => {
    setSelectedCluster(cluster)
    setSelectedNamespace('')
    setSelectedWorkload('')
    setExpandedGroups(new Set())
    reset()
  }, [reset])

  // Handle namespace change
  const handleNamespaceChange = useCallback((ns: string) => {
    setSelectedNamespace(ns)
    setSelectedWorkload('')
    setExpandedGroups(new Set())
    reset()
  }, [reset])

  // Handle workload selection
  const handleWorkloadChange = useCallback((name: string) => {
    setSelectedWorkload(name)
    setExpandedGroups(new Set())
    if (name && selectedCluster && selectedNamespace) {
      resolve(selectedCluster, selectedNamespace, name)
    } else {
      reset()
    }
  }, [selectedCluster, selectedNamespace, resolve, reset])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const groups = depData ? groupDependencies(depData.dependencies) : []
  const totalDeps = depData?.dependencies.length ?? 0
  const hasWarnings = depData?.warnings && depData.warnings.length > 0

  return (
    <div className="space-y-3">
      {/* Cascading dropdowns */}
      <div className="space-y-2">
        {/* Cluster selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">Cluster</label>
          <ClusterSelect
            clusters={clusters}
            value={selectedCluster}
            onChange={handleClusterChange}
            placeholder="Select cluster..."
            className="flex-1"
          />
        </div>

        {/* Namespace selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">Namespace</label>
          <select
            value={selectedNamespace}
            onChange={(e) => handleNamespaceChange(e.target.value)}
            disabled={!selectedCluster || nsLoading}
            className={cn(
              'flex-1 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50',
              (!selectedCluster || nsLoading) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <option value="">
              {nsLoading ? 'Loading...' : 'Select namespace...'}
            </option>
            {namespaces.map(ns => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>
        </div>

        {/* Workload selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground w-20 shrink-0">Workload</label>
          <select
            value={selectedWorkload}
            onChange={(e) => handleWorkloadChange(e.target.value)}
            disabled={!selectedNamespace || wlLoading}
            className={cn(
              'flex-1 text-sm rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500/50',
              (!selectedNamespace || wlLoading) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <option value="">
              {wlLoading ? 'Loading...' : 'Select workload...'}
            </option>
            {workloads?.map(w => (
              <option key={`${w.type}-${w.name}`} value={w.name}>
                {w.name} ({w.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Empty state */}
      {!selectedWorkload && !depLoading && (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            Select a cluster, namespace, and workload to explore its dependency tree.
          </p>
        </div>
      )}

      {/* Loading state */}
      {depLoading && (
        <div className="flex items-center justify-center py-6 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <span className="text-sm text-muted-foreground">Resolving dependencies...</span>
        </div>
      )}

      {/* Error state */}
      {depError && !depLoading && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-yellow-400 font-medium">Could not resolve dependencies</p>
            <p className="text-xs text-yellow-400/70 mt-0.5">{depError.message}</p>
          </div>
        </div>
      )}

      {/* Dependency tree */}
      {depData && !depLoading && (
        <div>
          {/* Workload header */}
          <div className="rounded-lg bg-card/50 border border-border p-2.5 mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="text-sm font-medium text-foreground">{depData.workload}</span>
            {depData.kind && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {depData.kind}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {totalDeps} dep{totalDeps !== 1 ? 's' : ''}
            </span>
          </div>

          {/* No deps */}
          {totalDeps === 0 && (
            <p className="text-sm text-muted-foreground text-center py-3">
              No additional dependencies detected.
            </p>
          )}

          {/* Grouped dependency list */}
          {groups.map(group => {
            const GroupIcon = group.icon
            const isExpanded = expandedGroups.has(group.label)

            return (
              <div key={group.label} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 py-2 px-1 text-left hover:bg-card/30 rounded transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                  <GroupIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span className="text-sm text-foreground flex-1">{group.label}</span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-secondary">
                    {group.deps.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-8 mb-2 space-y-0.5">
                    {group.deps.map(dep => {
                      const DepIcon = KIND_ICONS[dep.kind] ?? FileText
                      return (
                        <div
                          key={`${dep.kind}-${dep.name}`}
                          className="flex items-center gap-2 py-0.5 text-xs"
                        >
                          <DepIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground w-24 truncate shrink-0">{dep.kind}</span>
                          <span className="text-foreground truncate flex-1">{dep.name}</span>
                          {dep.optional && (
                            <span className="text-[10px] text-yellow-500 shrink-0">optional</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Warnings */}
          {hasWarnings && (
            <div className="mt-2 space-y-1">
              {depData.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                  <span className="text-yellow-400/80">{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
