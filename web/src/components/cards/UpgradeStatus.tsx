import { useMemo, useState, useEffect, useRef } from 'react'
import { ArrowUp, CheckCircle, AlertTriangle, Rocket, WifiOff, Loader2 } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { ConfirmMissionPromptDialog } from '../missions/ConfirmMissionPromptDialog'
import { useLocalAgent } from '../../hooks/useLocalAgent'
import { useDemoMode } from '../../hooks/useDemoMode'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardAIActions } from '../../lib/cards/CardComponents'
import { StatusBadge } from '../ui/StatusBadge'
import { useCardLoadingState } from './CardDataContext'
import { LOCAL_AGENT_WS_URL } from '../../lib/constants'
import { appendWsAuthToken } from '../../lib/utils/wsAuth'
import { safeGetJSON, safeSetJSON } from '../../lib/safeLocalStorage'
import { useTranslation } from 'react-i18next'

const WS_CONNECTION_TIMEOUT_MS = 5000
const WS_READY_CHECK_INTERVAL_MS = 100
const VERSION_REQUEST_TIMEOUT_MS = 10_000

interface UpgradeStatusProps {
  config?: Record<string, unknown>
}

type SortByOption = 'status' | 'version' | 'cluster'

const SORT_OPTIONS = [
  { value: 'status' as const, label: 'Status' },
  { value: 'version' as const, label: 'Version' },
  { value: 'cluster' as const, label: 'Cluster' },
]

// Module-level cache for cluster versions (persists across component remounts + page refreshes)
const STORAGE_KEY = 'kc-cluster-versions'
const VERSION_CACHE_TTL = 5 * MS_PER_MINUTE // 5 minutes

// Load persisted cache from localStorage on module init
const versionCache: Record<string, { version: string; timestamp: number }> =
  typeof window === 'undefined'
    ? {}
    : safeGetJSON<Record<string, { version: string; timestamp: number }>>(STORAGE_KEY, {})

/** Debounce interval for persisting the version cache to localStorage */
const PERSIST_DEBOUNCE_MS = 500

// Persist cache to localStorage (debounced to avoid excessive writes)
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persistCache() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    safeSetJSON(STORAGE_KEY, versionCache)
  }, PERSIST_DEBOUNCE_MS)
}

// Get cached version if still valid
function getCachedVersion(clusterName: string): string | null {
  const cached = versionCache[clusterName]
  if (cached && Date.now() - cached.timestamp < VERSION_CACHE_TTL) {
    return cached.version
  }
  return null
}

// Get cached version regardless of TTL (for stale-while-revalidate on page refresh)
function getStaleCachedVersion(clusterName: string): string | null {
  return versionCache[clusterName]?.version ?? null
}

// Set cached version
function setCachedVersion(clusterName: string, version: string) {
  versionCache[clusterName] = { version, timestamp: Date.now() }
  persistCache()
}

// Managed WebSocket handle — created per component mount, torn down on unmount
interface VersionWsHandle {
  ensureWs: () => Promise<WebSocket>
  fetchClusterVersion: (clusterName: string, forceRefresh?: boolean) => Promise<string | null>
  destroy: () => void
}

function createVersionWsHandle(): VersionWsHandle {
  let ws: WebSocket | null = null
  let connecting = false
  let destroyed = false
  const pendingRequests = new Map<string, (version: string | null) => void>()
  /** Outstanding `setTimeout` handles created inside `ensureWs()` so
   * `destroy()` can cancel them. Previously these were discarded, so the
   * 10s connection timeout fired AFTER unmount and held stale closure
   * references calling `clearInterval` and `reject` on already-settled
   * promises (#6206). */
  const pendingEnsureTimers = new Set<ReturnType<typeof setTimeout>>()

  function rejectAllPending() {
    pendingRequests.forEach((resolver) => resolver(null))
    pendingRequests.clear()
  }

  function closeWs() {
    if (ws) {
      // Remove handlers before closing to avoid triggering reconnection logic
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      ws = null
    }
    connecting = false
    rejectAllPending()
  }

  function ensureWs(): Promise<WebSocket> {
    if (destroyed) return Promise.reject(new Error('Handle destroyed'))

    if (ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(ws)
    }

    if (connecting) {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (destroyed) { clearInterval(checkInterval); reject(new Error('Handle destroyed')); return }
          if (ws?.readyState === WebSocket.OPEN) { clearInterval(checkInterval); resolve(ws) }
        }, WS_READY_CHECK_INTERVAL_MS)
        // #6206: store the timeout handle so destroy() can cancel it.
        // Without this, the timeout would fire after unmount, call
        // clearInterval on a dead handle, and reject an already-settled
        // promise — holding stale closure references for up to 10s.
        const timeoutHandle = setTimeout(() => {
          pendingEnsureTimers.delete(timeoutHandle)
          clearInterval(checkInterval)
          reject(new Error('WebSocket connection timeout'))
        }, WS_CONNECTION_TIMEOUT_MS)
        pendingEnsureTimers.add(timeoutHandle)
      })
    }

    connecting = true

    return new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(appendWsAuthToken(LOCAL_AGENT_WS_URL))
      } catch {
        connecting = false
        reject(new Error('Failed to create WebSocket'))
        return
      }

      const connectionTimeout = setTimeout(() => {
        connecting = false
        if (ws?.readyState !== WebSocket.OPEN) {
          closeWs()
          reject(new Error('WebSocket connection timeout'))
        }
      }, VERSION_REQUEST_TIMEOUT_MS)

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        connecting = false
        if (destroyed) { closeWs(); reject(new Error('Handle destroyed')); return }
        resolve(ws!)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const resolver = pendingRequests.get(msg.id)
          if (resolver) {
            pendingRequests.delete(msg.id)
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

      ws.onerror = () => {
        clearTimeout(connectionTimeout)
        connecting = false
        rejectAllPending()
        reject(new Error('WebSocket error'))
      }

      ws.onclose = () => {
        clearTimeout(connectionTimeout)
        connecting = false
        ws = null
        rejectAllPending()
      }
    })
  }

  async function fetchClusterVersion(clusterName: string, forceRefresh = false): Promise<string | null> {
    if (destroyed) return getCachedVersion(clusterName)

    if (!forceRefresh) {
      const cached = getCachedVersion(clusterName)
      if (cached) return cached
    }

    try {
      const socket = await ensureWs()
      const requestId = `version-${clusterName}-${Date.now()}`

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId)
          resolve(getCachedVersion(clusterName))
        }, VERSION_REQUEST_TIMEOUT_MS)

        pendingRequests.set(requestId, (version) => {
          clearTimeout(timeout)
          if (version) setCachedVersion(clusterName, version)
          resolve(version || getCachedVersion(clusterName))
        })

        if (socket.readyState !== WebSocket.OPEN) {
          pendingRequests.delete(requestId)
          clearTimeout(timeout)
          resolve(getCachedVersion(clusterName))
          return
        }

        socket.send(JSON.stringify({
          id: requestId,
          type: 'kubectl',
          payload: { context: clusterName, args: ['version', '-o', 'json'] } }))
      })
    } catch {
      return getCachedVersion(clusterName)
    }
  }

  function destroy() {
    destroyed = true
    // Cancel any in-flight ensureWs() timeouts before closing the socket
    // so their stale closures don't fire after unmount (#6206).
    pendingEnsureTimers.forEach(t => clearTimeout(t))
    pendingEnsureTimers.clear()
    closeWs()
  }

  return { ensureWs, fetchClusterVersion, destroy }
}

// Derive the latest known Kubernetes minor version from cluster data.
// Falls back to a hardcoded value when no cluster versions are available.
const FALLBACK_LATEST_MINOR = 33

function deriveLatestMinor(versions: Record<string, string>): number {
  let maxMinor = 0
  for (const version of Object.values(versions)) {
    const match = version.match(/v?(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const minor = parseInt(match[2], 10)
      if (minor > maxMinor) maxMinor = minor
    }
  }
  // The latest available minor is at least one ahead of the highest observed,
  // since clusters are rarely all on the very latest release.
  // If no versions were parsed, fall back to the hardcoded value.
  return maxMinor > 0 ? maxMinor + 1 : FALLBACK_LATEST_MINOR
}

// Check if a newer stable version is available
function getRecommendedUpgrade(currentVersion: string, latestMinor: number): string | null {
  if (!currentVersion || currentVersion === '-' || currentVersion === 'loading...') return null

  // Parse version (e.g., "v1.28.5" -> { major: 1, minor: 28, patch: 5 })
  const match = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  const minor = parseInt(match[2], 10)
  const patch = parseInt(match[3], 10)

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

interface UpgradeItem {
  name: string
  currentVersion: string
  targetVersion: string
  status: 'unreachable' | 'loading' | 'available' | 'current'
  progress: number
  isUnreachable: boolean
  isLoading: boolean
}

const STATUS_ORDER: Record<string, number> = { available: 0, loading: 1, unreachable: 2, current: 3 }

const UPGRADE_SORT_COMPARATORS: Record<SortByOption, (a: UpgradeItem, b: UpgradeItem) => number> = {
  status: commonComparators.statusOrder<UpgradeItem>('status', STATUS_ORDER),
  version: commonComparators.string<UpgradeItem>('currentVersion'),
  cluster: commonComparators.string<UpgradeItem>('name') }

// Demo versions keyed by cluster name keywords
const DEMO_VERSIONS: Record<string, string> = {
  eks: 'v1.31.2',
  aks: 'v1.30.4',
  gke: 'v1.31.0',
  openshift: 'v1.28.11',
  oci: 'v1.30.1',
  kind: 'v1.32.0',
  k3s: 'v1.31.1',
  minikube: 'v1.31.3',
  rancher: 'v1.29.6' }

function getDemoVersionForCluster(name: string): string {
  const lower = name.toLowerCase()
  for (const [keyword, version] of Object.entries(DEMO_VERSIONS)) {
    if (lower.includes(keyword)) return version
  }
  // Deterministic fallback based on name length
  const versions = ['v1.30.2', 'v1.31.1', 'v1.29.8', 'v1.32.0', 'v1.30.5']
  return versions[name.length % versions.length]
}

export function UpgradeStatus({ config: _config }: UpgradeStatusProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters: allClusters, isLoading: isLoadingHook, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { drillToCluster } = useDrillDownActions()
  const { startMission } = useMissions()
  const { isConnected: agentConnected } = useLocalAgent()
  const { isDemoMode } = useDemoMode()
  const [clusterVersions, setClusterVersions] = useState<Record<string, string>>({})
  const [fetchCompleted, setFetchCompleted] = useState(false)

  // Managed WebSocket handle — created once per mount, destroyed on unmount
  const wsHandleRef = useRef<VersionWsHandle | null>(null)
  if (!wsHandleRef.current) {
    wsHandleRef.current = createVersionWsHandle()
  }

  // Destroy WebSocket and pending requests on unmount
  useEffect(() => {
    const handle = wsHandleRef.current
    return () => {
      handle?.destroy()
      wsHandleRef.current = null
    }
  }, [])

  const {
    selectedClusters: globalSelectedClusters,
    isAllClustersSelected,
    customFilter } = useGlobalFilters()

  // Only show skeleton when no cached data exists - prevents flickering on refresh
  const isLoading = isLoadingHook && allClusters.length === 0

  // Report state to CardWrapper for refresh animation
  const hasData = allClusters.length > 0
  useCardLoadingState({
    isLoading: isLoadingHook && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })

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

  // Populate demo versions when in demo mode
  const demoVersionsSetRef = useRef(false)
  useEffect(() => {
    if (!isDemoMode || allClusters.length === 0) return
    if (demoVersionsSetRef.current) return
    demoVersionsSetRef.current = true
    const demoVersions: Record<string, string> = {}
    for (const c of allClusters) {
      demoVersions[c.name] = getDemoVersionForCluster(c.name)
    }
    setClusterVersions(demoVersions)
    setFetchCompleted(true)
  }, [isDemoMode, allClusters])

  // Fetch real versions from clusters via local agent
  useEffect(() => {
    if (isDemoMode) return // Demo versions handled above

    if (!agentConnected || allClusters.length === 0) {
      // If not connected, mark fetch as completed so we show '-' instead of 'loading...'
      // But preserve any cached versions we already have
      setFetchCompleted(true)
      return
    }

    let cancelled = false
    setFetchCompleted(false)

    const fetchVersions = async () => {
      // Only fetch for healthy/reachable clusters that we haven't cached yet
      const reachableClusters = allClusters.filter(c => c.healthy !== false && c.nodeCount && c.nodeCount > 0)

      // Determine which clusters need fetching (not cached, or previously failed)
      const clustersToFetch = reachableClusters.filter(c =>
        !fetchedClustersRef.current.has(c.name) || failedClustersRef.current.has(c.name)
      )

      if (clustersToFetch.length === 0) {
        if (!cancelled) setFetchCompleted(true)
        return
      }

      // Fetch all clusters in parallel for faster loading
      const handle = wsHandleRef.current
      if (!handle) return
      const fetchPromises = clustersToFetch.map(async (cluster) => {
        const version = await handle.fetchClusterVersion(cluster.name)
        return { name: cluster.name, version }
      })

      const results = await Promise.all(fetchPromises)
      if (cancelled) return

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
    const RETRY_INTERVAL_MS = 15000
    const retryInterval = setInterval(() => {
      if (failedClustersRef.current.size > 0 && agentConnected) {
        fetchVersions()
      }
    }, RETRY_INTERVAL_MS)

    // #6292: re-fetch ALL clusters on VERSION_CACHE_TTL so a successfully
    // upgraded cluster reflects its new version. Without this loop,
    // `fetchedClustersRef` kept the old cluster in the "already fetched,
    // skip" set forever and the card showed the pre-upgrade version
    // until the user navigated away and came back. Also clears the
    // per-cluster version cache so `getCachedVersion()` re-fetches.
    const refreshInterval = setInterval(() => {
      if (!agentConnected) return
      fetchedClustersRef.current.clear()
      for (const c of allClusters) {
        delete versionCache[c.name]
      }
      persistCache()
      fetchVersions()
    }, VERSION_CACHE_TTL)

    return () => {
      cancelled = true
      clearInterval(retryInterval)
      clearInterval(refreshInterval)
    }
  }, [isDemoMode, agentConnected, allClusters])

  // #6309: show the prompt-confirmation dialog before starting the
  // upgrade mission. Previously, clicking "Start Upgrade" launched
  // the AI agent immediately with no chance for the user to review
  // or edit the prompt — a critical-function click with no gate.
  // The ConfirmMissionPromptDialog was added in #5913 for exactly
  // this pattern (installer flows); here we reuse it for upgrades.
  interface PendingUpgrade {
    clusterName: string
    currentVersion: string
    targetVersion: string
    prompt: string
  }
  const [pendingUpgrade, setPendingUpgrade] = useState<PendingUpgrade | null>(null)
  // #6320: guards against double-clicking the Confirm button in the
  // dialog. `setPendingUpgrade(null)` is async, so a second click that
  // fires before React re-renders would still see `pendingUpgrade`
  // non-null, pass the !pendingUpgrade guard, and call startMission
  // again. A ref flipped synchronously at the top of the handler
  // closes that window.
  const startingMissionRef = useRef(false)

  const buildUpgradePrompt = (clusterName: string, currentVersion: string, targetVersion: string) =>
    `I want to upgrade the Kubernetes cluster "${clusterName}" from version ${currentVersion} to ${targetVersion}.

Please help me with this upgrade by:
1. First checking the cluster's current state and any prerequisites
2. Reviewing the upgrade path and potential breaking changes
3. Creating a backup/rollback plan
4. Performing the upgrade with proper monitoring
5. Validating the upgrade was successful

Please proceed step by step and ask for confirmation before making any changes.`

  const handleStartUpgrade = (clusterName: string, currentVersion: string, targetVersion: string) => {
    // Stage the upgrade in pending state — the dialog below will call
    // confirmStartUpgrade (with the possibly-edited prompt) or cancel.
    setPendingUpgrade({
      clusterName,
      currentVersion,
      targetVersion,
      prompt: buildUpgradePrompt(clusterName, currentVersion, targetVersion),
    })
  }

  const confirmStartUpgrade = (editedPrompt: string) => {
    // #6320: double-click guard. The two checks work together:
    //   - startingMissionRef: synchronous; catches back-to-back clicks
    //     inside a single React commit cycle.
    //   - !pendingUpgrade: catches stale-closure invocations after
    //     the dialog has been dismissed but a queued click is still
    //     pending.
    if (!pendingUpgrade || startingMissionRef.current) return
    startingMissionRef.current = true
    const { clusterName, currentVersion, targetVersion } = pendingUpgrade
    startMission({
      title: `Upgrade ${clusterName}`,
      description: `Upgrade from ${currentVersion} to ${targetVersion}`,
      type: 'upgrade',
      cluster: clusterName,
      initialPrompt: editedPrompt,
      context: {
        clusterName,
        currentVersion,
        targetVersion } })
    setPendingUpgrade(null)
    // Reset the ref on the next tick so a subsequent (new) upgrade
    // mission can run normally.
    setTimeout(() => { startingMissionRef.current = false }, 0)
  }

  // Apply global filters to get clusters, then build version data
  const globalFilteredClusters = (() => {
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
  })()

  // Derive the latest Kubernetes minor version dynamically from observed cluster versions
  const latestMinor = deriveLatestMinor(clusterVersions)

  // Build version data from real cluster versions
  const clusterVersionData = useMemo(() => {
    return globalFilteredClusters.map((c) => {
      // A cluster is reachable if it has nodes (same logic as other components)
      const hasNodes = c.nodeCount && c.nodeCount > 0
      const isUnreachable = c.reachable === false || (!hasNodes && c.healthy === false)
      const isStillLoading = !hasNodes && c.nodeCount === undefined && c.reachable === undefined

      // Try state first, then fresh cache, then stale cache (survives page refresh), then fallback
      const stateVersion = clusterVersions[c.name]
      const freshCached = getCachedVersion(c.name)
      const staleCached = getStaleCachedVersion(c.name)
      const currentVersion = stateVersion || freshCached || staleCached ||
        (isUnreachable ? '-' : (isStillLoading || (!fetchCompleted && agentConnected) ? 'loading...' : '-'))

      const targetVersion = getRecommendedUpgrade(currentVersion, latestMinor)
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
        isLoading: isStillLoading }
    })
  }, [globalFilteredClusters, clusterVersions, agentConnected, fetchCompleted, latestMinor])

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: displayClusters,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search,
      setSearch,
      localClusterFilter,
      toggleClusterFilter,
      clearClusterFilter,
      availableClusters,
      showClusterFilter,
      setShowClusterFilter,
      clusterFilterRef },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<UpgradeItem, SortByOption>(clusterVersionData, {
    filter: {
      searchFields: ['name', 'currentVersion'],
      clusterField: 'name',
      storageKey: 'upgrade-status' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: UPGRADE_SORT_COMPARATORS },
    defaultLimit: 5 })

  // Suppress unused variable warnings for values used indirectly
  void totalItems

  const pendingUpgrades = clusterVersionData.filter((c) => c.status === 'available').length

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
        <div className="flex items-center gap-2">
          {pendingUpgrades > 0 && (
            <StatusBadge color="yellow">
              {pendingUpgrades} upgrades available
            </StatusBadge>
          )}
        </div>
        <CardControlsRow
          clusterIndicator={
            localClusterFilter.length > 0
              ? { selectedCount: localClusterFilter.length, totalCount: availableClusters.length }
              : undefined
          }
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
            minClusters: 1 }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => setSortBy(v as SortByOption),
            sortDirection,
            onSortDirectionChange: setSortDirection }}
          className="mb-0"
        />
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common.searchClusters')}
        className="mb-3"
      />

      {/* Clusters list */}
      <div ref={containerRef} className="flex-1 space-y-2 overflow-y-auto" style={containerStyle}>
        {displayClusters.map((cluster) => (
          <div
            key={cluster.name}
            className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
          >
            <div
              className="cursor-pointer"
              onClick={() => drillToCluster(cluster.name, { tab: 'upgrade', version: cluster.currentVersion, targetVersion: cluster.targetVersion })}
            >
              <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 gap-2">
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
            {(cluster.status === 'unreachable' || cluster.status === 'available') && (
              <CardAIActions
                resource={{ kind: 'Cluster', name: cluster.name, status: cluster.status }}
                issues={[{
                  name: cluster.status === 'unreachable' ? 'Cluster unreachable' : 'Upgrade available',
                  message: cluster.status === 'unreachable'
                    ? `Cluster ${cluster.name} is unreachable and cannot be queried for version info`
                    : `Cluster ${cluster.name} can be upgraded from ${cluster.currentVersion} to ${cluster.targetVersion}` }]}
                className="mt-2"
              />
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 10}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* #6309: confirm prompt before running the upgrade mission. */}
      {pendingUpgrade && (
        <ConfirmMissionPromptDialog
          open={true}
          missionTitle={`Upgrade ${pendingUpgrade.clusterName}`}
          missionDescription={`Upgrade from ${pendingUpgrade.currentVersion} to ${pendingUpgrade.targetVersion}`}
          initialPrompt={pendingUpgrade.prompt}
          onCancel={() => setPendingUpgrade(null)}
          onConfirm={confirmStartUpgrade}
        />
      )}
    </div>
  )
}
