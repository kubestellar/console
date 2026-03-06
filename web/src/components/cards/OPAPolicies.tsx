import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AlertTriangle, CheckCircle, ExternalLink, XCircle, Info, ChevronRight, RefreshCw, Plus, WifiOff, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { CardSearchInput, CardControlsRow, CardPaginationFooter, CardSkeleton } from '../../lib/cards/CardComponents'
import { useClusters } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { kubectlProxy } from '../../lib/kubectlProxy'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_OPA_CACHE, STORAGE_KEY_OPA_CACHE_TIME } from '../../lib/constants'
import { PolicyDetailModal, ClusterOPAModal, CreatePolicyModal } from './opa'
import type { Policy, GatekeeperStatus, OPAClusterItem } from './opa'

/** Cache TTL: 60 minutes — OPA installation status rarely changes */
const CACHE_TTL_MS = 60 * 60 * 1000

// Sort options for clusters
type SortByOption = 'name' | 'violations' | 'policies'

const SORT_OPTIONS = [
  { value: 'name' as const, label: 'Name' },
  { value: 'violations' as const, label: 'Violations' },
  { value: 'policies' as const, label: 'Policies' },
]

interface OPAPoliciesProps {
  config?: {
    cluster?: string
  }
}

/** Generate demo OPA statuses for instant display (no waiting for effects/API) */
function generateDemoStatuses(): Record<string, GatekeeperStatus> {
  const demoClusterNames = ['kind-hub', 'kind-worker1', 'kind-worker2']
  const result: Record<string, GatekeeperStatus> = {}
  for (const name of demoClusterNames) {
    result[name] = {
      cluster: name, installed: true, loading: false, policyCount: 3,
      violationCount: Math.floor(Math.random() * 5), mode: 'warn',
      modes: ['warn', 'enforce'],
      policies: [
        { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 1, mode: 'warn' },
        { name: 'allowed-repos', kind: 'K8sAllowedRepos', violations: 0, mode: 'enforce' },
        { name: 'require-limits', kind: 'K8sRequireResourceLimits', violations: 2, mode: 'warn' },
      ],
      violations: [],
    }
  }
  return result
}

// Module-level flag to prevent StrictMode double-checks
// This persists across component mounts within the same page load
let globalCheckInProgress = false
const globalCheckedClusters = new Set<string>()

/**
 * Phase 1 — Fast check: single kubectl call to determine if Gatekeeper is installed.
 * Returns immediately with installed/not-installed status so the card can render.
 */
async function checkGatekeeperInstalled(clusterName: string): Promise<GatekeeperStatus> {
  try {
    const nsResult = await kubectlProxy.exec(
      ['get', 'namespace', 'gatekeeper-system', '--ignore-not-found', '-o', 'name'],
      { context: clusterName, timeout: 25000, priority: true }
    )
    const installed = !!(nsResult.output && nsResult.output.includes('gatekeeper-system'))
    return { cluster: clusterName, installed, loading: installed } // loading=true means details pending
  } catch {
    return { cluster: clusterName, installed: false, loading: false, error: 'Connection failed' }
  }
}

/**
 * Phase 2 — Detail fetch: get constraints, policies, and violations.
 * Only called for clusters where Phase 1 returned installed=true.
 */
async function checkGatekeeperDetails(clusterName: string): Promise<GatekeeperStatus> {
  try {
    const constraintsResult = await kubectlProxy.exec(
      ['get', 'constraints', '-A',
       '-o', 'custom-columns=NAME:.metadata.name,KIND:.kind,ENFORCEMENT:.spec.enforcementAction,VIOLATIONS:.status.totalViolations',
       '--no-headers'],
      { context: clusterName, timeout: 10000 }
    ).catch(() => ({ output: '', error: '' }))

    const policies: Policy[] = []
    let totalViolations = 0
    const modes = new Set<string>()

    if (constraintsResult.output) {
      const lines = constraintsResult.output.trim().split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          const name = parts[0]
          const kind = parts[1]
          const enforcement = (parts[2] || 'warn').toLowerCase() as Policy['mode']
          const violations = parseInt(parts[3], 10) || 0

          // Normalize deny to enforce for display
          const normalizedMode = enforcement === 'deny' ? 'enforce' : enforcement as Policy['mode']
          policies.push({ name, kind, violations, mode: normalizedMode })
          totalViolations += violations
          modes.add(normalizedMode)
        }
      }
    }

    // Collect all modes for display (will show multiple badges if mixed)
    const activeModes = Array.from(modes) as ('warn' | 'enforce' | 'dryrun')[]
    // For backward compatibility, pick the most restrictive as primary
    let primaryMode: 'warn' | 'enforce' | 'dryrun' | 'deny' = 'warn'
    if (modes.has('enforce')) {
      primaryMode = 'enforce'
    } else if (modes.has('dryrun')) {
      primaryMode = 'dryrun'
    }

    // Fetch sample violations (only if there are violations to show)
    const violations: GatekeeperStatus['violations'] = []
    if (totalViolations > 0 && policies.length > 0) {
      const policyWithViolations = policies.find(p => p.violations > 0)
      if (policyWithViolations) {
        const violationsResult = await kubectlProxy.exec(
          ['get', policyWithViolations.kind.toLowerCase(), policyWithViolations.name,
           '-o', 'jsonpath={.status.violations[*]}'],
          { context: clusterName, timeout: 10000 }
        )

        if (violationsResult.output) {
          try {
            // Parse JSON violations array - the output is space-separated JSON objects
            const violationData = JSON.parse(`[${violationsResult.output.replace(/}\s*{/g, '},{')}]`)
            for (const v of violationData.slice(0, 20)) { // Limit to 20 violations
              violations.push({
                name: v.name || 'Unknown',
                namespace: v.namespace || 'default',
                kind: v.kind || 'Resource',
                policy: policyWithViolations.name,
                message: v.message || 'Policy violation',
                severity: policyWithViolations.mode === 'enforce' || policyWithViolations.mode === 'deny' ? 'critical' : 'warning'
              })
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    return {
      cluster: clusterName,
      installed: true,
      loading: false,
      policyCount: policies.length,
      violationCount: totalViolations,
      mode: primaryMode,
      modes: activeModes,
      policies,
      violations
    }
  } catch {
    // Details failed but Gatekeeper is installed — show installed with no details
    return { cluster: clusterName, installed: true, loading: false, policyCount: 0, violationCount: 0 }
  }
}

// Sort comparators that use statuses lookup via closure
function createSortComparators(statuses: Record<string, GatekeeperStatus>) {
  return {
    name: commonComparators.string<OPAClusterItem>('name'),
    violations: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.violationCount || 0) - (statuses[b.name]?.violationCount || 0),
    policies: (a: OPAClusterItem, b: OPAClusterItem) =>
      (statuses[a.name]?.policyCount || 0) - (statuses[b.name]?.policyCount || 0),
  }
}

function OPAPoliciesInternal({ config: _config }: OPAPoliciesProps) {
  const { t } = useTranslation(['cards', 'common'])
  const { deduplicatedClusters: clusters, isLoading } = useClusters()
  const { startMission } = useMissions()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  // NOTE: useCardLoadingState is called below after statuses and reachableClusters are defined

  // Fetch clusters directly from agent as fallback (skip in demo mode)
  const [agentClusters, setAgentClusters] = useState<{ name: string; healthy?: boolean }[]>([])
  useEffect(() => {
    if (shouldUseDemoData) return
    fetch(`${LOCAL_AGENT_HTTP_URL}/clusters`)
      .then(res => res.json())
      .then(data => {
        if (data.clusters) {
          setAgentClusters(data.clusters.map((c: { name: string }) => ({ name: c.name, healthy: true })))
        }
      })
      .catch(() => { /* agent not available */ })
  }, [shouldUseDemoData])

  // Use agent clusters if shared state is empty - memoize for stability
  const effectiveClusters = useMemo(() => {
    return clusters.length > 0 ? clusters : agentClusters
  }, [clusters, agentClusters])

  // Initialize statuses from demo data or localStorage cache for instant display.
  // In demo mode, provide synthetic statuses immediately so the card never enters
  // skeleton state (the chunk load time + useEffect timing can cause 25s+ delays).
  const [statuses, setStatuses] = useState<Record<string, GatekeeperStatus>>(() => {
    if (checkIsDemoMode()) return generateDemoStatuses()
    try {
      const cached = localStorage.getItem(STORAGE_KEY_OPA_CACHE)
      if (cached) {
        const parsed = JSON.parse(cached)
        const cacheTime = localStorage.getItem(STORAGE_KEY_OPA_CACHE_TIME)
        const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime, 10) : Infinity
        if (cacheAge < CACHE_TTL_MS) {
          return parsed
        }
      }
    } catch (e) {
      console.error('[OPA] Failed to load cached statuses:', e)
    }
    return {}
  })
  const [, setIsRefreshing] = useState(false)

  // Persist statuses to localStorage when they change (only successful results, not loading/error)
  useEffect(() => {
    // Filter out loading statuses and error statuses — errors should be re-checked next load
    const completedStatuses = Object.fromEntries(
      Object.entries(statuses).filter(([_, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completedStatuses).length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY_OPA_CACHE, JSON.stringify(completedStatuses))
        localStorage.setItem(STORAGE_KEY_OPA_CACHE_TIME, Date.now().toString())
      } catch (e) {
        console.error('[OPA] Failed to cache statuses:', e)
      }
    }
  }, [statuses])
  const [showViolationsModal, setShowViolationsModal] = useState(false)
  const [selectedClusterForViolations, setSelectedClusterForViolations] = useState<string>('')
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const [showCreatePolicyModal, setShowCreatePolicyModal] = useState(false)

  // Enrich cluster data with 'cluster' field for useCardData compatibility
  // Include reachable status so we can skip OPA checks for offline clusters
  const clusterItems = useMemo<OPAClusterItem[]>(() => {
    return effectiveClusters.map(c => ({
      name: c.name,
      cluster: c.name, // useCardData needs this for global + local cluster filtering
      healthy: c.healthy,
      reachable: (c as { reachable?: boolean }).reachable,
    }))
  }, [effectiveClusters])

  // Build sort comparators using current statuses
  const sortComparators = useMemo(
    () => createSortComparators(statuses),
    [statuses]
  )

  // Use shared card data hook for filtering, sorting, and pagination
  const {
    items: paginatedClusters,
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
      clusterFilterRef,
    },
    sorting,
  } = useCardData<OPAClusterItem, SortByOption>(clusterItems, {
    filter: {
      searchFields: ['name'] as (keyof OPAClusterItem)[],
      clusterField: 'cluster' as keyof OPAClusterItem,
      storageKey: 'opa-policies',
    },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: sortComparators,
    },
    defaultLimit: 5,
  })

  // Use ref to avoid recreating checkAllClusters on every status change
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  // Track if we're currently checking to prevent duplicate runs
  const isCheckingRef = useRef(false)

  // Track if initial check has been triggered (using state for reliable persistence)
  const [hasTriggeredInitialCheck, setHasTriggeredInitialCheck] = useState(false)

  // Ref for effectiveClusters to avoid recreating checkAllClusters
  const effectiveClustersRef = useRef(effectiveClusters)
  effectiveClustersRef.current = effectiveClusters

  // Check Gatekeeper on specified clusters using two-phase loading:
  // Phase 1 (fast): Single kubectl call per cluster to check installed/not-installed (~1-2s)
  // Phase 2 (lazy): Fetch policies, violations in background for installed clusters
  const checkClusters = useCallback(async (clusters: { name: string }[], forceCheck = false) => {
    if (clusters.length === 0) return

    // In demo mode, kubectlProxy is unavailable — skip real checks
    if (shouldUseDemoData) {
      setIsRefreshing(false)
      return
    }

    if (isCheckingRef.current && !forceCheck) return // Prevent duplicate runs
    if (globalCheckInProgress && !forceCheck) return

    // Filter out clusters already being checked globally (for StrictMode double-mount)
    const clustersToCheck = forceCheck
      ? clusters
      : clusters.filter(c => !globalCheckedClusters.has(c.name))

    if (clustersToCheck.length === 0) return

    isCheckingRef.current = true
    globalCheckInProgress = true
    setIsRefreshing(true)

    // Mark clusters as being checked globally
    for (const cluster of clustersToCheck) {
      globalCheckedClusters.add(cluster.name)
    }

    // Immediately mark all clusters as "loading" to prevent duplicate checks on remount
    setStatuses(prev => {
      const updated = { ...prev }
      for (const cluster of clustersToCheck) {
        // Only set loading if not already checked
        if (!updated[cluster.name] || updated[cluster.name].loading) {
          updated[cluster.name] = { cluster: cluster.name, installed: false, loading: true }
        }
      }
      return updated
    })

    // ── Phase 1: Fast install check (priority bypass) ──
    // Single lightweight namespace lookup per cluster, bypasses kubectl queue
    // so the card renders in ~1-2s instead of waiting behind other cards' requests.
    const PHASE1_CONCURRENCY = 3
    const phase1Queue = [...clustersToCheck]
    const installedClusters: string[] = []

    const processPhase1 = async (): Promise<void> => {
      const cluster = phase1Queue.shift()
      if (!cluster) return

      try {
        const status = await checkGatekeeperInstalled(cluster.name)
        setStatuses(prev => {
          // Don't downgrade a known-installed cluster to not-installed due to timeout/error.
          // Slow clusters (vllm-d, platform-eval) may timeout on the namespace check even though
          // Gatekeeper is installed — preserve the cached installed status and queue for Phase 2.
          if (status.error && prev[cluster.name]?.installed) {
            installedClusters.push(cluster.name)
            return prev
          }
          return { ...prev, [cluster.name]: status }
        })
        if (status.installed) installedClusters.push(cluster.name)
      } catch {
        setStatuses(prev => {
          if (prev[cluster.name]?.installed) {
            installedClusters.push(cluster.name)
            return prev
          }
          return {
            ...prev,
            [cluster.name]: { cluster: cluster.name, installed: false, loading: false, error: 'Connection failed' }
          }
        })
      }

      if (phase1Queue.length > 0) await processPhase1()
    }

    try {
      // Phase 1: Run fast install checks — priority bypasses kubectl queue
      const batch1 = Math.min(PHASE1_CONCURRENCY, phase1Queue.length)
      await Promise.all(Array.from({ length: batch1 }, () => processPhase1()))

      // ── Phase 2: Detail fetch (only installed clusters, via normal queue) ──
      // Fetches policies + violations progressively
      if (installedClusters.length > 0) {
        const PHASE2_CONCURRENCY = 3
        const phase2Queue = [...installedClusters]

        const processPhase2 = async (): Promise<void> => {
          const name = phase2Queue.shift()
          if (!name) return

          try {
            const status = await checkGatekeeperDetails(name)
            setStatuses(prev => ({ ...prev, [name]: status }))
          } catch {
            // Details failed — mark as loaded with no details
            setStatuses(prev => ({
              ...prev,
              [name]: { ...prev[name], loading: false }
            }))
          }

          if (phase2Queue.length > 0) await processPhase2()
        }

        const batch2 = Math.min(PHASE2_CONCURRENCY, phase2Queue.length)
        await Promise.all(Array.from({ length: batch2 }, () => processPhase2()))
      }
    } finally {
      // Cleanup: ensure flags are always reset even on unexpected errors
      for (const cluster of clustersToCheck) {
        globalCheckedClusters.delete(cluster.name)
      }
      setIsRefreshing(false)
      isCheckingRef.current = false
      globalCheckInProgress = false
    }
  }, [shouldUseDemoData])

  // Filter clusters to only include reachable ones for OPA checks
  const reachableClusters = useMemo(() => {
    return effectiveClusters.filter(c => (c as { reachable?: boolean }).reachable !== false)
  }, [effectiveClusters])

  // Ref for reachable clusters for manual refresh
  const reachableClustersRef = useRef(reachableClusters)
  reachableClustersRef.current = reachableClusters

  // Wrapper for manual refresh - uses current reachable clusters, force check to override guards
  const handleRefresh = useCallback(() => {
    checkClusters(reachableClustersRef.current, true)
  }, [checkClusters])

  // Track whether OPA checks have returned at least Phase 1 data (installed/not-installed).
  // With two-phase loading, installed clusters have loading=true during Phase 2 (details pending),
  // but we already know their installed status — so count them as "has data".
  const hasOPAData = Object.values(statuses).some(s =>
    !s.loading || s.installed // Phase 1 returned installed=true (details loading in Phase 2)
  )
  const isOPAChecking = Object.values(statuses).some(s => s.loading) ||
    (reachableClusters.length > 0 && Object.keys(statuses).length === 0)

  // Report state to CardWrapper for refresh animation and skeleton
  // In demo mode, report immediately ready to avoid skeleton deadlock
  // (useClusters may not have populated yet, but demo statuses are provided via useEffect)
  useCardLoadingState({
    isLoading: shouldUseDemoData ? false : (isLoading || (isOPAChecking && !hasOPAData)),
    hasAnyData: shouldUseDemoData ? true : (clusters.length > 0 && hasOPAData),
  })

  // In demo mode, update statuses with real cluster names when they become available.
  // Initial demo statuses are already provided by useState initializer (via checkIsDemoMode).
  useEffect(() => {
    if (!shouldUseDemoData) return
    if (effectiveClusters.length === 0) return
    // Only update if using the hardcoded demo cluster names
    const currentNames = Object.keys(statuses)
    const realNames = effectiveClusters.map(c => c.name)
    const needsUpdate = currentNames.length === 0 || !realNames.every(n => currentNames.includes(n))
    if (!needsUpdate) return
    const demoStatuses: Record<string, GatekeeperStatus> = {}
    for (const name of realNames) {
      demoStatuses[name] = {
        cluster: name, installed: true, loading: false, policyCount: 3,
        violationCount: Math.floor(Math.random() * 5), mode: 'warn',
        modes: ['warn', 'enforce'],
        policies: [
          { name: 'require-labels', kind: 'K8sRequiredLabels', violations: 1, mode: 'warn' },
          { name: 'allowed-repos', kind: 'K8sAllowedRepos', violations: 0, mode: 'enforce' },
          { name: 'require-limits', kind: 'K8sRequireResourceLimits', violations: 2, mode: 'warn' },
        ],
        violations: [],
      }
    }
    setStatuses(demoStatuses)
  }, [shouldUseDemoData, effectiveClusters])

  // Initial check - only check reachable clusters without cached data
  // Skip if we've already triggered a check this session
  useEffect(() => {
    if (hasTriggeredInitialCheck) return
    if (reachableClusters.length === 0) return

    // Check sessionStorage to see if we've already done initial check this session
    const sessionKey = 'opa-initial-check-done'
    const alreadyCheckedThisSession = sessionStorage.getItem(sessionKey) === 'true'

    setHasTriggeredInitialCheck(true)

    // Find clusters without valid cached status — re-check those with errors
    // (stale errors from timeouts or connectivity issues should not prevent rechecking)
    const needsCheck = reachableClusters.filter(c => {
      const s = statuses[c.name]
      return !s || s.error // No cached data or cached error → needs fresh check
    })

    if (needsCheck.length === 0) {
      return
    }

    if (alreadyCheckedThisSession && needsCheck.length < reachableClusters.length) {
      checkClusters(needsCheck)
    } else {
      sessionStorage.setItem(sessionKey, 'true')
      checkClusters(reachableClusters)
    }
  }, [hasTriggeredInitialCheck, reachableClusters, statuses, checkClusters])

  // Check newly reachable clusters that weren't available during the initial check.
  // Clusters like platform-eval and vllm-d may be slow to respond to warmup but become
  // reachable after a few minutes — this ensures they get checked when they come online.
  useEffect(() => {
    if (!hasTriggeredInitialCheck) return // Wait for initial check to complete first
    if (shouldUseDemoData) return

    const newlyReachable = reachableClusters.filter(c => !statusesRef.current[c.name])
    if (newlyReachable.length === 0) return

    checkClusters(newlyReachable)
  }, [hasTriggeredInitialCheck, reachableClusters, shouldUseDemoData, checkClusters])

  const handleInstallOPA = (clusterName: string) => {
    startMission({
      title: `Install OPA Gatekeeper on ${clusterName}`,
      description: 'Set up OPA Gatekeeper for policy enforcement',
      type: 'deploy',
      cluster: clusterName,
      initialPrompt: `I want to install OPA Gatekeeper on the cluster "${clusterName}".

Please help me:
1. Check if Gatekeeper is already installed
2. If not, install it using the official Helm chart or manifests
3. Verify the installation is working
4. Set up a basic policy (like requiring labels)

Please proceed step by step.`,
      context: { clusterName },
    })
  }

  const installedCount = Object.values(statuses).filter(s => s.installed).length
  const totalViolations = Object.values(statuses)
    .filter(s => s.installed)
    .reduce((sum, s) => sum + (s.violationCount || 0), 0)

  const handleShowViolations = (clusterName: string) => {
    setSelectedClusterForViolations(clusterName)
    setShowViolationsModal(true)
  }

  const handleAddPolicy = (basedOnPolicy?: string) => {
    // Get the first installed cluster, or use a default
    const installedCluster = Object.entries(statuses).find(([_, s]) => s.installed)?.[0] || 'default'

    startMission({
      title: 'Create OPA Gatekeeper Policy',
      description: basedOnPolicy
        ? `Create a policy similar to ${basedOnPolicy}`
        : 'Create a new OPA Gatekeeper policy',
      type: 'deploy',
      cluster: installedCluster,
      initialPrompt: basedOnPolicy
        ? `I want to create a new OPA Gatekeeper policy similar to "${basedOnPolicy}".

Please help me:
1. Explain what the ${basedOnPolicy} policy does
2. Ask me what modifications I want to make
3. Generate a ConstraintTemplate and Constraint for my requirements
4. Help me apply it to the cluster
5. Test that the policy is working

Let's start by discussing what kind of policy I need.`
        : `I want to create a new OPA Gatekeeper policy for my Kubernetes cluster.

Please help me:
1. Ask me what kind of policy I want to enforce (e.g., require labels, restrict images, enforce resource limits)
2. Generate the appropriate ConstraintTemplate and Constraint
3. Help me apply it to the cluster
4. Test that the policy is working

Let's start by discussing what kind of policy I need.`,
      context: { basedOnPolicy },
    })
  }

  // Show skeleton until OPA checks have populated (skip in demo mode — demo statuses are provided)
  if (!shouldUseDemoData && ((isLoading && clusters.length === 0) || (isOPAChecking && !hasOPAData))) {
    return <CardSkeleton rows={4} type="list" showHeader showSearch />
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        {installedCount > 0 ? (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">
            {installedCount} cluster{installedCount !== 1 ? 's' : ''}
          </span>
        ) : <div />}
        <CardControlsRow
          clusterFilter={{
            availableClusters,
            selectedClusters: localClusterFilter,
            onToggle: toggleClusterFilter,
            onClear: clearClusterFilter,
            isOpen: showClusterFilter,
            setIsOpen: setShowClusterFilter,
            containerRef: clusterFilterRef,
          }}
          cardControls={{
            limit: itemsPerPage,
            onLimitChange: setItemsPerPage,
            sortBy: sorting.sortBy,
            sortOptions: SORT_OPTIONS,
            onSortChange: (v) => sorting.setSortBy(v as SortByOption),
            sortDirection: sorting.sortDirection,
            onSortDirectionChange: sorting.setSortDirection,
          }}
          extra={
            <>
              <button
                onClick={() => setShowCreatePolicyModal(true)}
                className="p-1 hover:bg-purple-500/10 rounded transition-colors text-muted-foreground hover:text-purple-400"
                title="Create OPA Policy"
              >
                <Plus className="w-4 h-4" />
              </button>
              <a
                href="https://open-policy-agent.github.io/gatekeeper/website/docs/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-secondary rounded transition-colors text-muted-foreground hover:text-purple-400"
                title="OPA Gatekeeper Documentation"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </>
          }
        />
      </div>

      {/* Local Search */}
      <CardSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('common:common.searchClusters')}
        className="mb-3"
      />

      {/* Summary stats */}
      {installedCount > 0 && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-[10px] text-orange-400">Policies Active</p>
            <p className="text-lg font-bold text-foreground">
              {Object.values(statuses).filter(s => s.installed).reduce((sum, s) => sum + (s.policyCount || 0), 0)}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-[10px] text-red-400">Violations</p>
            <p className="text-lg font-bold text-foreground">{totalViolations}</p>
          </div>
        </div>
      )}

      {/* Cluster list - p-1 -m-1 gives room for focus rings without clipping */}
      <div className="flex-1 overflow-y-auto space-y-2 p-1 -m-1">
        {paginatedClusters.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No clusters available
          </div>
        ) : (
          paginatedClusters.map(cluster => {
            const isOffline = cluster.reachable === false
            const status = statuses[cluster.name]
            // Only show loading spinner for initial check (no cached data or loading state)
            // During refresh, show cached data - the refresh button spinner indicates activity
            // Phase 1 sets installed=true, loading=true (details pending in Phase 2).
            // Show installed status immediately — only show full spinner when no status at all.
            const isInitialLoading = !isOffline && !status
            const isLoadingDetails = !isOffline && status?.installed && status?.loading

            return (
              <button
                key={cluster.name}
                onClick={() => status?.installed && !isOffline && handleShowViolations(cluster.name)}
                disabled={isOffline || !status?.installed || isInitialLoading}
                className={`w-full text-left p-2.5 rounded-lg bg-secondary/30 transition-colors ${
                  !isOffline && status?.installed && !isInitialLoading
                    ? 'hover:bg-secondary/50 cursor-pointer group'
                    : ''
                } ${isOffline ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-medium text-foreground ${!isOffline && status?.installed ? 'group-hover:text-purple-400' : ''}`}>
                    {cluster.name}
                  </span>
                  <div className="flex items-center gap-1">
                    {isOffline ? (
                      <WifiOff className="w-3.5 h-3.5 text-muted-foreground/40" />
                    ) : isInitialLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    ) : status?.installed ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </>
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {isOffline ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground/50">
                    <WifiOff className="w-3 h-3" />
                    <span>{t('messages.offline')}</span>
                  </div>
                ) : isInitialLoading ? (
                  <p className="text-xs text-muted-foreground">{t('messages.checking')}</p>
                ) : status?.installed ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-3 text-xs">
                      {isLoadingDetails ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Loading policies...
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">
                            {status.policyCount ?? 0} {status.policyCount === 1 ? 'policy' : 'policies'}
                          </span>
                          {(status.violationCount ?? 0) > 0 && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {status.violationCount} {status.violationCount === 1 ? 'violation' : 'violations'}
                            </span>
                          )}
                          {(status.modes && status.modes.length > 1 ? status.modes : [status.mode]).map((mode, idx) => (
                            <span key={idx} className={`px-1.5 py-0.5 rounded text-[10px] ${
                              mode === 'enforce' ? 'bg-red-500/20 text-red-400' :
                              mode === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-blue-500/20 text-blue-400'
                            }`}>
                              {mode}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Not installed</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleInstallOPA(cluster.name)
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 cursor-pointer"
                    >
                      Install with AI →
                    </span>
                  </div>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage === 'unlimited' ? totalItems : itemsPerPage}
        onPageChange={goToPage}
        needsPagination={needsPagination}
      />

      {/* Active policies preview - show real policies from first cluster with policies */}
      {installedCount > 0 && (() => {
        const clusterWithPolicies = Object.values(statuses).find(s => s.installed && s.policies && s.policies.length > 0)
        const policies = clusterWithPolicies?.policies || []
        if (policies.length === 0) return null

        return (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-[10px] text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Active Policies
            </p>
            <div className="space-y-1">
              {policies.slice(0, 4).map(policy => (
                <button
                  key={policy.name}
                  onClick={() => {
                    setSelectedPolicy(policy)
                    setShowPolicyModal(true)
                  }}
                  className="w-full flex items-center justify-between text-xs p-1.5 -mx-1.5 rounded hover:bg-secondary/50 transition-colors group"
                >
                  <span className="text-foreground truncate group-hover:text-purple-400">{policy.name}</span>
                  <div className="flex items-center gap-2">
                    {policy.violations > 0 && (
                      <span className="text-amber-400">{policy.violations.toLocaleString()}</span>
                    )}
                    <span className={`px-1 py-0.5 rounded text-[9px] ${
                      policy.mode === 'enforce' || policy.mode === 'deny' ? 'bg-red-500/20 text-red-400' :
                      policy.mode === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {policy.mode}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Footer links */}
      <div className="flex items-center justify-center gap-3 pt-2 mt-2 border-t border-border/50 text-[10px]">
        <button
          onClick={() => setShowCreatePolicyModal(true)}
          className="text-purple-400 hover:text-purple-300 transition-colors"
        >
          Create Policy
        </button>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://open-policy-agent.github.io/gatekeeper/website/docs/install"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Install Guide
        </a>
        <span className="text-muted-foreground/30">•</span>
        <a
          href="https://open-policy-agent.github.io/gatekeeper-library/website/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-purple-400 transition-colors"
        >
          Policy Library
        </a>
      </div>

      {/* Cluster OPA Modal - Full CRUD */}
      <ClusterOPAModal
        isOpen={showViolationsModal}
        onClose={() => setShowViolationsModal(false)}
        clusterName={selectedClusterForViolations}
        policies={statuses[selectedClusterForViolations]?.policies || []}
        violations={statuses[selectedClusterForViolations]?.violations || []}
        onRefresh={handleRefresh}
        startMission={startMission}
      />

      {/* Policy Detail Modal */}
      {selectedPolicy && (
        <PolicyDetailModal
          isOpen={showPolicyModal}
          onClose={() => {
            setShowPolicyModal(false)
            setSelectedPolicy(null)
          }}
          policy={selectedPolicy}
          violations={Object.values(statuses).flatMap(s => s.violations || [])}
          onAddPolicy={() => handleAddPolicy(selectedPolicy.name)}
        />
      )}

      {/* Create Policy Modal — AI-driven policy creation */}
      <CreatePolicyModal
        isOpen={showCreatePolicyModal}
        onClose={() => setShowCreatePolicyModal(false)}
        statuses={statuses}
        startMission={startMission}
      />
    </div>
  )
}

export function OPAPolicies(props: OPAPoliciesProps) {
  return (
    <DynamicCardErrorBoundary cardId="OPAPolicies">
      <OPAPoliciesInternal {...props} />
    </DynamicCardErrorBoundary>
  )
}
