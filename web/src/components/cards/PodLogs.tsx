/**
 * PodLogs card — live fetch of pod logs for the Logs dashboard.
 *
 * Fixes https://github.com/kubestellar/console/issues/6045 — before this
 * card existed, the Logs dashboard was wired exclusively to
 * `useCachedEvents()` (Kubernetes Events) and exposed no way to retrieve
 * actual container logs even though the backend already served them at
 * `/api/mcp/pods/logs`.
 *
 * The card lets the user pick a cluster, namespace, pod, and optionally a
 * container, then fetches a tail of the logs through the existing
 * `usePodLogs` hook.  The viewer is a simple scrollable `<pre>` — we
 * deliberately do not pull in a heavyweight syntax highlighter for raw
 * log output.
 *
 * Implementation notes:
 *   * Selection state is stored as "user override" values.  The *effective*
 *     cluster/namespace/pod/container are derived via `useMemo`, falling
 *     back to the first available option when the user has not picked one.
 *     This keeps setState out of effects (React 19 / eslint
 *     `react-hooks/immutability` friendly).
 */
import { useMemo, useState } from 'react'
import { RefreshCw, ScrollText, AlertCircle } from 'lucide-react'
import { useClusters } from '../../hooks/useMCP'
import { useCachedPods, useCachedNamespaces } from '../../hooks/useCachedData'
import { usePodLogs } from '../../hooks/mcp/workloads'
import { useCardLoadingState } from './CardDataContext'
import { useGlobalFilters } from '../../hooks/useGlobalFilters'
import { Select } from '../ui/Select'
import { Input } from '../ui/Input'

// ── Tunables (no magic numbers) ────────────────────────────────────────────
/** Default number of tail lines requested from the backend. */
export const DEFAULT_LOG_TAIL_LINES = 100
/** Absolute maximum tail lines the card will let the user request. The
 *  backend caps this even harder (see `mcpMaxTailLines` in Go), so this is
 *  just a UX guard to avoid obviously-bad inputs. */
export const MAX_LOG_TAIL_LINES = 5000
/** Minimum tail lines — fetching 0 lines is pointless. */
const MIN_LOG_TAIL_LINES = 1
/** How many pods the card is willing to render in its pod-select dropdown.
 *  Keeps the cached-pods fetch bounded (the backend list-pods endpoint can
 *  otherwise stream thousands of entries for busy clusters). */
const POD_FETCH_LIMIT = 500

interface PodLogsProps {
  config?: {
    cluster?: string
    namespace?: string
    pod?: string
    container?: string
    tailLines?: number
  }
}

export function PodLogs({ config }: PodLogsProps) {
  const {
    deduplicatedClusters: allClusters,
    isLoading: clustersLoading,
    isRefreshing: clustersRefreshing,
    isFailed: clustersFailed,
    consecutiveFailures: clustersConsecutiveFailures,
  } = useClusters()
  const { selectedClusters: globalSelectedClusters, isAllClustersSelected } = useGlobalFilters()

  // Respect the global cluster filter — if the header has narrowed the
  // visible clusters, the dropdown should only expose that subset.
  const visibleClusters = useMemo(
    () => allClusters
      .filter(c => c.reachable !== false)
      .filter(c => isAllClustersSelected || globalSelectedClusters.includes(c.name)),
    [allClusters, isAllClustersSelected, globalSelectedClusters]
  )

  // User-picked overrides. `''` means "no explicit pick — use the first
  // available item once it loads". The *effective* selection below resolves
  // this to a concrete value, avoiding setState-in-effect patterns.
  const [pickedCluster, setPickedCluster] = useState<string>(config?.cluster || '')
  const [pickedNamespace, setPickedNamespace] = useState<string>(config?.namespace || '')
  const [pickedPod, setPickedPod] = useState<string>(config?.pod || '')
  const [pickedContainer, setPickedContainer] = useState<string>(config?.container || '')
  const [tailLines, setTailLines] = useState<number>(config?.tailLines ?? DEFAULT_LOG_TAIL_LINES)

  // Effective cluster: user pick if still visible, otherwise first visible.
  const effectiveCluster = useMemo(() => {
    if (pickedCluster && visibleClusters.some(c => c.name === pickedCluster)) {
      return pickedCluster
    }
    return visibleClusters[0]?.name || ''
  }, [pickedCluster, visibleClusters])

  const { namespaces, isLoading: nsLoading, isRefreshing: nsRefreshing } = useCachedNamespaces(
    effectiveCluster || undefined
  )
  const namespaceNames = useMemo(() => [...namespaces].sort(), [namespaces])

  const effectiveNamespace = useMemo(() => {
    if (pickedNamespace && namespaceNames.includes(pickedNamespace)) {
      return pickedNamespace
    }
    return namespaceNames[0] || ''
  }, [pickedNamespace, namespaceNames])

  const { pods, isLoading: podsLoading, isRefreshing: podsRefreshing } = useCachedPods(
    effectiveCluster || undefined,
    effectiveNamespace || undefined,
    { limit: POD_FETCH_LIMIT }
  )
  const filteredPods = useMemo(
    () => pods.filter(p => p.namespace === effectiveNamespace),
    [pods, effectiveNamespace]
  )

  const effectivePod = useMemo(() => {
    if (pickedPod && filteredPods.some(p => p.name === pickedPod)) {
      return pickedPod
    }
    return filteredPods[0]?.name || ''
  }, [pickedPod, filteredPods])

  // Container list comes from the PodInfo payload (no extra fetch required).
  const selectedPodObj = useMemo(
    () => filteredPods.find(p => p.name === effectivePod),
    [filteredPods, effectivePod]
  )
  const containerNames = useMemo(
    () => (selectedPodObj?.containers || []).map(c => c.name),
    [selectedPodObj]
  )

  const effectiveContainer = useMemo(() => {
    if (pickedContainer && containerNames.includes(pickedContainer)) {
      return pickedContainer
    }
    // Empty string means "let the backend pick the default container".
    return ''
  }, [pickedContainer, containerNames])

  const { logs, isLoading: logsLoading, error: logsError, refetch } = usePodLogs(
    effectiveCluster,
    effectiveNamespace,
    effectivePod,
    effectiveContainer || undefined,
    tailLines
  )

  // Surface loading state to CardWrapper (demo badge, refresh spinner, etc.).
  const hasAnyData = visibleClusters.length > 0
  useCardLoadingState({
    isLoading: clustersLoading && !hasAnyData,
    isRefreshing: clustersRefreshing || nsRefreshing || podsRefreshing || logsLoading,
    hasAnyData,
    isDemoData: false,
    isFailed: clustersFailed,
    consecutiveFailures: clustersConsecutiveFailures,
  })

  const handleTailChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(Math.max(parsed, MIN_LOG_TAIL_LINES), MAX_LOG_TAIL_LINES)
    setTailLines(clamped)
  }

  const selectorDisabled = clustersLoading || !hasAnyData
  const isBusy = logsLoading || nsLoading || podsLoading

  return (
    <div className="h-full flex flex-col min-h-card content-loaded overflow-hidden">
      {/* Selector row */}
      <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
        <Select
          selectSize="sm"
          aria-label="Cluster"
          value={effectiveCluster}
          disabled={selectorDisabled || visibleClusters.length === 0}
          onChange={(e) => {
            setPickedCluster(e.target.value)
            setPickedNamespace('')
            setPickedPod('')
            setPickedContainer('')
          }}
        >
          {visibleClusters.length === 0 && <option value="">No clusters</option>}
          {visibleClusters.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </Select>

        <Select
          selectSize="sm"
          aria-label="Namespace"
          value={effectiveNamespace}
          disabled={!effectiveCluster || namespaceNames.length === 0}
          onChange={(e) => {
            setPickedNamespace(e.target.value)
            setPickedPod('')
            setPickedContainer('')
          }}
        >
          {namespaceNames.length === 0 && <option value="">No namespaces</option>}
          {namespaceNames.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </Select>

        <Select
          selectSize="sm"
          aria-label="Pod"
          className="max-w-[220px]"
          value={effectivePod}
          disabled={!effectiveNamespace || filteredPods.length === 0}
          onChange={(e) => {
            setPickedPod(e.target.value)
            setPickedContainer('')
          }}
        >
          {filteredPods.length === 0 && <option value="">No pods</option>}
          {filteredPods.map(p => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </Select>

        {containerNames.length > 1 && (
          <Select
            selectSize="sm"
            aria-label="Container"
            value={effectiveContainer}
            onChange={(e) => setPickedContainer(e.target.value)}
          >
            <option value="">(default container)</option>
            {containerNames.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        )}

        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          Tail
          <Input
            inputSize="sm"
            type="number"
            min={MIN_LOG_TAIL_LINES}
            max={MAX_LOG_TAIL_LINES}
            value={tailLines}
            onChange={(e) => handleTailChange(e.target.value)}
            className="w-20"
            aria-label="Tail lines"
          />
        </label>

        <button
          type="button"
          onClick={() => refetch()}
          disabled={!effectivePod || isBusy}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
          title="Refresh logs"
        >
          <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Log viewer */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-slate-950 overflow-hidden">
        {logsError ? (
          <div className="h-full flex items-center justify-center gap-2 p-4 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="break-all">{logsError}</span>
          </div>
        ) : !effectivePod ? (
          <div className="h-full flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground">
            <ScrollText className="w-4 h-4" />
            Select a cluster, namespace, and pod to view logs.
          </div>
        ) : logsLoading && !logs ? (
          <div className="h-full flex items-center justify-center p-4 text-xs text-muted-foreground">
            Loading logs…
          </div>
        ) : !logs ? (
          <div className="h-full flex items-center justify-center p-4 text-xs text-muted-foreground">
            No log output.
          </div>
        ) : (
          <pre className="h-full w-full overflow-auto p-3 text-xs leading-snug font-mono text-foreground whitespace-pre">
            {logs}
          </pre>
        )}
      </div>
    </div>
  )
}

export default PodLogs
