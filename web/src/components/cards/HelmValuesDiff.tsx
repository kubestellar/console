import { useState, useMemo, useEffect, useRef } from 'react'
import { FileJson, ChevronRight, Plus, Edit, Search, RotateCcw } from 'lucide-react'
import { useClusters, useHelmReleases, useHelmValues } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Skeleton } from '../ui/Skeleton'
import { ClusterBadge } from '../ui/ClusterBadge'
import { RefreshButton } from '../ui/RefreshIndicator'

interface HelmValuesDiffProps {
  config?: {
    cluster?: string
    release?: string
    namespace?: string
  }
}

interface ValueEntry {
  path: string
  value: string
}

// Flatten nested object to dot-notation paths
function flattenValues(obj: Record<string, unknown>, prefix = ''): ValueEntry[] {
  const entries: ValueEntry[] = []

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      entries.push(...flattenValues(value as Record<string, unknown>, path))
    } else {
      entries.push({
        path,
        value: JSON.stringify(value)
      })
    }
  }

  return entries
}

export function HelmValuesDiff({ config }: HelmValuesDiffProps) {
  const { clusters: allClusters, isLoading: clustersLoading } = useClusters()
  const [selectedCluster, setSelectedCluster] = useState<string>(config?.cluster || '')
  const [selectedRelease, setSelectedRelease] = useState<string>(config?.release || '')
  const [localSearch, setLocalSearch] = useState('')
  const { drillToHelm } = useDrillDownActions()

  // Track local selection state for global filter sync
  const savedLocalCluster = useRef<string>('')
  const savedLocalRelease = useRef<string>('')
  const wasGlobalFilterActive = useRef(false)

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Sync local selection with global filter changes
  useEffect(() => {
    const isGlobalFilterActive = !isAllClustersSelected && globalSelectedClusters.length > 0

    if (isGlobalFilterActive && !wasGlobalFilterActive.current) {
      // Global filter just became active - save current local selection
      savedLocalCluster.current = selectedCluster
      savedLocalRelease.current = selectedRelease
      // Auto-select first cluster from global filter if current selection is not in filter
      if (selectedCluster && !globalSelectedClusters.includes(selectedCluster)) {
        setSelectedCluster(globalSelectedClusters[0] || '')
        setSelectedRelease('')
      }
    } else if (!isGlobalFilterActive && wasGlobalFilterActive.current) {
      // Global filter just cleared - restore previous local selection
      if (savedLocalCluster.current) {
        setSelectedCluster(savedLocalCluster.current)
        setSelectedRelease(savedLocalRelease.current)
        savedLocalCluster.current = ''
        savedLocalRelease.current = ''
      }
    }

    wasGlobalFilterActive.current = isGlobalFilterActive
    // Note: selectedCluster/selectedRelease deliberately excluded to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSelectedClusters, isAllClustersSelected])

  // Fetch ALL Helm releases from all clusters once (not per-cluster)
  const { releases: allHelmReleases, isLoading: releasesLoading } = useHelmReleases()

  // Look up namespace from the selected release (required for helm commands)
  const selectedReleaseNamespace = useMemo(() => {
    if (!selectedCluster || !selectedRelease) return undefined
    const release = allHelmReleases.find(
      r => r.cluster === selectedCluster && r.name === selectedRelease
    )
    return release?.namespace
  }, [allHelmReleases, selectedCluster, selectedRelease])

  // Fetch values for selected release (hook handles caching)
  const {
    values,
    format,
    isLoading: valuesLoading,
    isRefreshing: valuesRefreshing,
    refetch: refetchValues,
    isFailed,
    consecutiveFailures,
    lastRefresh
  } = useHelmValues(
    selectedCluster || undefined,
    selectedRelease || undefined,
    selectedReleaseNamespace
  )

  // Only show skeleton when no cached data exists
  const isLoading = (clustersLoading || releasesLoading) && allHelmReleases.length === 0

  // Apply global filters to clusters
  const clusters = useMemo(() => {
    let result = allClusters

    if (!isAllClustersSelected) {
      result = result.filter(c => globalSelectedClusters.includes(c.name))
    }

    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter])

  // Filter releases locally by selected cluster (no API call)
  const filteredReleases = useMemo(() => {
    if (!selectedCluster) return allHelmReleases
    return allHelmReleases.filter(r => r.cluster === selectedCluster)
  }, [allHelmReleases, selectedCluster])

  // Get unique release names for dropdown
  const releases = useMemo(() => {
    const releaseSet = new Set(filteredReleases.map(r => r.name))
    return Array.from(releaseSet).sort()
  }, [filteredReleases])

  // Process values into entries
  const valueEntries = useMemo(() => {
    if (!values) return []

    let entries: ValueEntry[] = []

    if (format === 'yaml' && typeof values === 'string') {
      // For YAML, just show the raw string
      entries = [{ path: 'values.yaml', value: values }]
    } else if (typeof values === 'object') {
      entries = flattenValues(values as Record<string, unknown>)
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      entries = entries.filter(e =>
        e.path.toLowerCase().includes(query) ||
        e.value.toLowerCase().includes(query)
      )
    }

    return entries
  }, [values, format, localSearch])

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-card">
        <div className="flex items-center justify-between mb-4">
          <Skeleton variant="text" width={130} height={20} />
          <Skeleton variant="rounded" width={80} height={28} />
        </div>
        <Skeleton variant="rounded" height={32} className="mb-4" />
        <div className="space-y-2">
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-muted-foreground">Helm Values Diff</span>
          {valueEntries.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {valueEntries.length} values
            </span>
          )}
        </div>
        <RefreshButton
          isRefreshing={valuesRefreshing || valuesLoading}
          isFailed={isFailed}
          consecutiveFailures={consecutiveFailures}
          lastRefresh={lastRefresh}
          onRefresh={refetchValues}
          size="sm"
        />
      </div>

      {/* Selectors */}
      <div className="flex gap-2 mb-4">
        <select
          value={selectedCluster}
          onChange={(e) => {
            setSelectedCluster(e.target.value)
            setSelectedRelease('')
          }}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground"
        >
          <option value="">Select cluster...</option>
          {clusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select
          value={selectedRelease}
          onChange={(e) => setSelectedRelease(e.target.value)}
          disabled={!selectedCluster || releasesLoading}
          className="flex-1 px-3 py-1.5 rounded-lg bg-secondary border border-border text-sm text-foreground disabled:opacity-50"
        >
          <option value="">Select release...</option>
          {releases.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {!selectedCluster || !selectedRelease ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Select a cluster and release to compare values
        </div>
      ) : (valuesLoading || valuesRefreshing) && values === null ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <RotateCcw className="w-4 h-4 animate-spin" />
            <span>Loading values for {selectedRelease}...</span>
          </div>
          <Skeleton variant="rounded" height={50} className="w-full" />
          <Skeleton variant="rounded" height={50} className="w-full" />
        </div>
      ) : (
        <>
          {/* Scope badge - clickable to drill into Helm release */}
          <div
            onClick={() => {
              if (selectedCluster && selectedRelease && selectedReleaseNamespace) {
                drillToHelm(selectedCluster, selectedReleaseNamespace, selectedRelease, {
                  valuesCount: valueEntries.length,
                })
              }
            }}
            className="flex items-center gap-2 mb-4 p-2 -mx-2 rounded-lg hover:bg-secondary/50 transition-colors cursor-pointer group"
          >
            <ClusterBadge cluster={selectedCluster} />
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground group-hover:text-amber-400">{selectedRelease}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Local Search */}
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search values..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
            />
          </div>

          {/* Summary */}
          <div className="flex gap-2 mb-4 text-xs">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400">
              <Edit className="w-3 h-3" />
              <span>{valueEntries.length} custom values</span>
            </div>
          </div>

          {/* Values list */}
          <div className="flex-1 space-y-1 overflow-y-auto font-mono text-xs">
            {valueEntries.length === 0 ? (
              <div className="flex items-center justify-center text-muted-foreground text-sm py-4">
                No custom values set (using chart defaults)
              </div>
            ) : format === 'yaml' && typeof values === 'string' ? (
              <pre className="p-3 rounded bg-secondary/30 text-foreground whitespace-pre-wrap overflow-x-auto">
                {values}
              </pre>
            ) : (
              valueEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-blue-500/10 border-l-2 border-blue-500"
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    <span className="text-foreground truncate">{entry.path}</span>
                  </div>
                  <div className="ml-5 mt-1">
                    <div className="text-green-400 truncate">{entry.value}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
            Showing custom values overriding chart defaults
          </div>
        </>
      )}
    </div>
  )
}
