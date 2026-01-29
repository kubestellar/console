import { useMemo, useState, useEffect, useRef } from 'react'
import { ArrowUp, CheckCircle, AlertTriangle, Rocket, WifiOff, Search, Loader2, Filter, ChevronDown, Server } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { CardControls, SortDirection } from '../ui/CardControls'
import { Pagination, usePagination } from '../ui/Pagination'
import { RefreshButton } from '../ui/RefreshIndicator'
import { useChartFilters } from '../../lib/cards'

interface UpgradeStatusProps {
  config?: Record<string, unknown>
}

type SortByOption = 'status' | 'version' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'version' as const, label: 'Version' },
  { value: 'cluster' as const, label: 'Cluster' },
]

// Module-level cache for cluster versions (persists across component remounts)
const versionCache: Record<string, { version: string; timestamp: number }> = {}
const VERSION_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Get cached version if still valid
function getCachedVersion(clusterName: string): string | null {
  const cached = versionCache[clusterName]
  if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
    return cached.version
  }
  return null
}

// Set cached version
function setCachedVersion(clusterName: string, version: string) {
  versionCache[clusterName] = { version, timestamp: Date.now() }
}

// Shared WebSocket for version fetching
let versionWs: WebSocket | null = null
let versionPendingRequests: Map<string, (version: string | null) => void> = new Map()
let wsConnecting = false

function ensureVersionWs(): Promise<WebSocket> {
  // If WebSocket is already open, return it
  if (versionWs?.readyState === WebSocket.OPEN) {
    return Promise.resolve(versionWs)
  }

  // If already connecting, wait a bit and check again
  if (wsConnecting) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (versionWs?.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval)
          resolve(versionWs)
        }
      }, 100)
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval)
        reject(new Error('WebSocket connection timeout'))
      }, 5000)
    })
  }

  wsConnecting = true

  return new Promise((resolve, reject) => {
    try {
      versionWs = new WebSocket('ws://127.0.0.1:8585/ws')
    } catch (err) {
      wsConnecting = false
      reject(new Error('Failed to create WebSocket'))
      return
    }

    const connectionTimeout = setTimeout(() => {
      wsConnecting = false
      if (versionWs?.readyState !== WebSocket.OPEN) {
        versionWs?.close()
        reject(new Error('WebSocket connection timeout'))
      }
    }, 10000)

    versionWs.onopen = () => {
      clearTimeout(connectionTimeout)
      wsConnecting = false
      resolve(versionWs!)
    }

    versionWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const resolver = versionPendingRequests.get(msg.id)
        if (resolver) {
          versionPendingRequests.delete(msg.id)
          if (msg.payload?.output) {
            try {
              const versionInfo = JSON.parse(msg.payload.output)
              resolver(versionInfo.serverVersion?.gitVersion || null)
            } catch {
              resolver(null)
            }
          } else {
            resolver(null)
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    versionWs.onerror = () => {
      clearTimeout(connectionTimeout)
      wsConnecting = false
      reject(new Error('WebSocket error'))
    }

    versionWs.onclose = () => {
      clearTimeout(connectionTimeout)
      wsConnecting = false
      versionWs = null
      // Reject all pending requests
      versionPendingRequests.forEach((resolver) => resolver(null))
      versionPendingRequests.clear()
    }
  })
}

// Fetch version from local agent for a cluster (with caching)
async function fetchClusterVersion(clusterName: string, forceRefresh = false): Promise<string | null> {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedVersion(clusterName)
    if (cached) {
      return cached
    }
  }

  try {
    const ws = await ensureVersionWs()
    const requestId = `version-${clusterName}-${Date.now()}`

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        versionPendingRequests.delete(requestId)
        // Return cached version on timeout instead of null
        resolve(getCachedVersion(clusterName))
      }, 10000)

      versionPendingRequests.set(requestId, (version) => {
        clearTimeout(timeout)
        if (version) {
          setCachedVersion(clusterName, version)
        }
        resolve(version || getCachedVersion(clusterName))
      })

      // Check WebSocket state before sending - it may have closed between await and send
      if (ws.readyState !== WebSocket.OPEN) {
        versionPendingRequests.delete(requestId)
        clearTimeout(timeout)
        resolve(getCachedVersion(clusterName))
        return
      }

      ws.send(JSON.stringify({
        id: requestId,
        type: 'kubectl',
        payload: { context: clusterName, args: ['version', '-o', 'json'] }
      }))
    })
  } catch {
    // Return cached version on error
    return getCachedVersion(clusterName)
  }
}

// Check if a newer stable version is available
// In a real implementation, this would check against kubernetes release info
function getRecommendedUpgrade(currentVersion: string): string | null {
  if (!currentVersion || currentVersion === '-' || currentVersion === 'loading...') return null

  // Parse version (e.g., "v1.28.5" -> { major: 1, minor: 28, patch: 5 })
  const match = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  const minor = parseInt(match[2], 10)
  const patch = parseInt(match[3], 10)

  // Suggest upgrade if not on latest minor or patch
  // This is simplified - real implementation would check actual Kubernetes releases
  const latestMinor = 33 // Current latest minor version

  if (minor < latestMinor - 2) {
    // More than 2 minor versions behind - suggest next minor
    return `v1.${minor + 1}.0`
  } else if (minor < latestMinor && patch < 10) {
    // Behind on minor, suggest latest patch of current minor
    return `v1.${minor}.${patch + 1}`
  }

  return null // Up to date
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'current':
      return <CheckCircle className="w-4 h-4 text-green-400" />
    case 'available':
      return <ArrowUp className="w-4 h-4 text-yellow-400" />
    case 'failed':
      return <AlertTriangle className="w-4 h-4 text-red-400" />
    case 'unreachable':
      return <WifiOff className="w-4 h-4 text-yellow-400" />
    case 'loading':
      return <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
    default:
      return null
  }
}

export function UpgradeStatus({ config: _config }: UpgradeStatusProps) {
  const { deduplicatedClusters: allClusters, isLoading: isLoadingHook, isRefreshing, refetch, isFailed, consecutiveFailures, lastRefresh } = useClusters()
  const { drillToCluster } = useDrillDownActions()
  const { startMission } = useMissions()
  const { isConnected: agentConnected } = useLocalAgent()
  const [clusterVersions, setClusterVersions] = useState<Record<string, string>>({})
  const [fetchCompleted, setFetchCompleted] = useState(false)
  const [sortBy, setSortBy] = useState<SortByOption>('status')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [limit, setLimit] = useState<number | 'unlimited'>(5)
  const [localSearch, setLocalSearch] = useState('')

  // Local cluster filter
  const {
    localClusterFilter,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
  } = useChartFilters({
    storageKey: 'upgrade-status',
  })

  // Only show skeleton when no cached data exists - prevents flickering on refresh
  const isLoading = isLoadingHook && allClusters.length === 0
  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter,
  } = useGlobalFilters()

  // Track previous agent connection state to detect reconnections
  const prevAgentConnectedRef = useRef(agentConnected)

  // Use a ref to track which clusters we've already fetched successfully
  const fetchedClustersRef = useRef(new Set<string>())
  // Track clusters that failed to fetch for retry
  const failedClustersRef = useRef(new Set<string>())

  // Clear fetch cache when agent reconnects (was disconnected, now connected)
  useEffect(() => {
    if (agentConnected && !prevAgentConnectedRef.current) {
      // Agent just reconnected - clear the fetch cache to re-fetch all versions
      fetchedClustersRef.current.clear()
      failedClustersRef.current.clear()
    }
    prevAgentConnectedRef.current = agentConnected
  }, [agentConnected])

  // Fetch real versions from clusters via local agent
  useEffect(() => {
    if (!agentConnected || allClusters.length === 0) {
      // If not connected, mark fetch as completed so we show '-' instead of 'loading...'
      // But preserve any cached versions we already have
      setFetchCompleted(true)
      return
    }

    setFetchCompleted(false)

    const fetchVersions = async () => {
      // Only fetch for healthy/reachable clusters that we haven't cached yet
      const reachableClusters = allClusters.filter(c => c.healthy !== false && c.nodeCount && c.nodeCount > 0)

      // Determine which clusters need fetching (not cached, or previously failed)
      const clustersToFetch = reachableClusters.filter(c =>
        !fetchedClustersRef.current.has(c.name) || failedClustersRef.current.has(c.name)
      )

      if (clustersToFetch.length === 0) {
        setFetchCompleted(true)
        return
      }

      // Fetch all clusters in parallel for faster loading
      const fetchPromises = clustersToFetch.map(async (cluster) => {
        const version = await fetchClusterVersion(cluster.name)
        return { name: cluster.name, version }
      })

      const results = await Promise.all(fetchPromises)

      // Process results
      const newVersions: Record<string, string> = {}
      let hasNewData = false

      for (const { name, version } of results) {
        if (version) {
          newVersions[name] = version
          fetchedClustersRef.current.add(name)
          failedClustersRef.current.delete(name)
          hasNewData = true
        } else {
          // Track failed clusters for retry on next cycle
          failedClustersRef.current.add(name)
        }
      }

      // Merge new versions with existing, preserving cache
      if (hasNewData) {
        setClusterVersions(prev => ({ ...prev, ...newVersions }))
      }
      setFetchCompleted(true)
    }

    fetchVersions()

    // Retry failed clusters every 15 seconds
    const retryInterval = setInterval(() => {
      if (failedClustersRef.current.size > 0 && agentConnected) {
        fetchVersions()
      }
    }, 15000)

    return () => clearInterval(retryInterval)
  }, [agentConnected, allClusters])

  const handleStartUpgrade = (clusterName: string, currentVersion: string, targetVersion: string) => {
    startMission({
      title: `Upgrade ${clusterName}`,
      description: `Upgrade from ${currentVersion} to ${targetVersion}`,
      type: 'upgrade',
      cluster: clusterName,
      initialPrompt: `I want to upgrade the Kubernetes cluster "${clusterName}" from version ${currentVersion} to ${targetVersion}.

Please help me with this upgrade by:
1. First checking the cluster's current state and any prerequisites
2. Reviewing the upgrade path and potential breaking changes
3. Creating a backup/rollback plan
4. Performing the upgrade with proper monitoring
5. Validating the upgrade was successful

Please proceed step by step and ask for confirmation before making any changes.`,
      context: {
        clusterName,
        currentVersion,
        targetVersion,
      },
    })
  }

  // Apply global filters and local search
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

    // Apply local cluster filter
    if (localClusterFilter.length > 0) {
      result = result.filter(c => localClusterFilter.includes(c.name))
    }

    // Apply local search filter
    if (localSearch.trim()) {
      const query = localSearch.toLowerCase()
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.context?.toLowerCase().includes(query)
      )
    }

    return result
  }, [allClusters, globalSelectedClusters, isAllClustersSelected, customFilter, localSearch, localClusterFilter])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  // Build version data from real cluster versions
  const clusterVersionData = useMemo(() => {
    const data = clusters.map((c) => {
      // A cluster is reachable if it has nodes (same logic as other components)
      const hasNodes = c.nodeCount && c.nodeCount > 0
      const isUnreachable = c.reachable === false || (!hasNodes && c.healthy === false)
      const isStillLoading = !hasNodes && c.nodeCount === undefined && c.reachable === undefined

      // Try cached version first, then component state, then show appropriate fallback
      const cachedVersion = getCachedVersion(c.name)
      const stateVersion = clusterVersions[c.name]
      const currentVersion = stateVersion || cachedVersion ||
        (isUnreachable ? '-' : (isStillLoading || (!fetchCompleted && agentConnected) ? 'loading...' : '-'))

      const targetVersion = getRecommendedUpgrade(currentVersion)
      const hasUpgrade = targetVersion && targetVersion !== currentVersion && currentVersion !== '-' && currentVersion !== 'loading...'

      return {
        name: c.name,
        currentVersion,
        targetVersion: hasUpgrade ? targetVersion : currentVersion,
        status: isUnreachable ? 'unreachable' as const :
                isStillLoading ? 'loading' as const :
                hasUpgrade ? 'available' as const : 'current' as const,
        progress: 0,
        isUnreachable,
        isLoading: isStillLoading,
      }
    })

    // Sort
    const statusOrder: Record<string, number> = { available: 0, loading: 1, unreachable: 2, current: 3 }
    return data.sort((a, b) => {
      let compare = 0
      switch (sortBy) {
        case 'status':
          compare = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
          break
        case 'version':
          compare = a.currentVersion.localeCompare(b.currentVersion)
          break
        case 'cluster':
          compare = a.name.localeCompare(b.name)
          break
      }
      return sortDirection === 'asc' ? compare : -compare
    })
  }, [clusters, clusterVersions, agentConnected, fetchCompleted, sortBy, sortDirection])

  // Use pagination hook
  const effectivePerPage = limit === 'unlimited' ? 1000 : limit
  const {
    paginatedItems: displayClusters,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage: perPage,
    goToPage,
    needsPagination,
  } = usePagination(clusterVersionData, effectivePerPage)

  const pendingUpgrades = clusterVersionData.filter((c) => c.status === 'available').length

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {pendingUpgrades > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
              {pendingUpgrades} upgrades available
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Cluster count indicator */}
          {localClusterFilter.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
              <Server className="w-3 h-3" />
              {localClusterFilter.length}/{availableClusters.length}
            </span>
          )}

          {/* Cluster filter dropdown */}
          {availableClusters.length >= 1 && (
            <div ref={clusterFilterRef} className="relative">
              <button
                onClick={() => setShowClusterFilter(!showClusterFilter)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors ${
                  localClusterFilter.length > 0
                    ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                }`}
                title="Filter by cluster"
              >
                <Filter className="w-3 h-3" />
                <ChevronDown className="w-3 h-3" />
              </button>

              {showClusterFilter && (
                <div className="absolute top-full right-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-lg bg-card border border-border shadow-lg z-50">
                  <div className="p-1">
                    <button
                      onClick={clearClusterFilter}
                      className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                        localClusterFilter.length === 0 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                      }`}
                    >
                      All clusters
                    </button>
                    {availableClusters.map(cluster => (
                      <button
                        key={cluster.name}
                        onClick={() => toggleClusterFilter(cluster.name)}
                        className={`w-full px-2 py-1.5 text-xs text-left rounded transition-colors ${
                          localClusterFilter.includes(cluster.name) ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-secondary text-foreground'
                        }`}
                      >
                        {cluster.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <CardControls
            limit={limit}
            onLimitChange={setLimit}
            sortBy={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
            sortDirection={sortDirection}
            onSortDirectionChange={setSortDirection}
          />
          <RefreshButton
            isRefreshing={isRefreshing}
            isFailed={isFailed}
            consecutiveFailures={consecutiveFailures}
            lastRefresh={lastRefresh}
            onRefresh={refetch}
            size="sm"
          />
        </div>
      </div>

      {/* Local Search */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search clusters..."
          className="w-full pl-8 pr-3 py-1.5 text-xs bg-secondary rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
        />
      </div>

      {/* Clusters list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {displayClusters.map((cluster) => (
          <div
            key={cluster.name}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div
              className="cursor-pointer"
              onClick={() => drillToCluster(cluster.name, { tab: 'upgrade', version: cluster.currentVersion, targetVersion: cluster.targetVersion })}
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">{cluster.name}</span>
                <span className="shrink-0">{getStatusIcon(cluster.status)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{cluster.currentVersion}</span>
                {cluster.targetVersion && cluster.targetVersion !== cluster.currentVersion && (
                  <>
                    <ArrowUp className="w-3 h-3" />
                    <span className="font-mono text-green-400">{cluster.targetVersion}</span>
                  </>
                )}
              </div>
            </div>
            {cluster.status === 'available' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartUpgrade(cluster.name, cluster.currentVersion, cluster.targetVersion)
                }}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-medium transition-colors w-full justify-center"
              >
                <Rocket className="w-3 h-3" />
                Start Upgrade to {cluster.targetVersion}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {needsPagination && limit !== 'unlimited' && (
        <div className="pt-2 border-t border-border/50 mt-2">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={perPage}
            onPageChange={goToPage}
            showItemsPerPage={false}
          />
        </div>
      )}
    </div>
  )
}
