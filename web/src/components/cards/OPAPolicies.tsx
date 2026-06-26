import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { ProgressRing } from '../ui/ProgressRing'
import { useCardData } from '../../lib/cards/cardHooks'
import { useClusters } from '../../hooks/useMCP'
import { useMissions } from '../../hooks/useMissions'
import { useCardLoadingState, useCardDemoState } from './CardDataContext'
import { isDemoMode as checkIsDemoMode } from '../../lib/demoMode'
import { DynamicCardErrorBoundary } from './DynamicCardErrorBoundary'
import { LOCAL_AGENT_HTTP_URL, STORAGE_KEY_OPA_CACHE, STORAGE_KEY_OPA_CACHE_TIME } from '../../lib/constants'
import { agentFetch } from '../../hooks/mcp/shared'
import { FETCH_DEFAULT_TIMEOUT_MS } from '../../lib/constants/network'
import { safeGetItem, safeGetJSON, safeSetItem, safeSetJSON } from '../../lib/utils/localStorage'
import type { Policy, GatekeeperStatus, OPAClusterItem } from './opa'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useModalState } from '../../lib/modals'
import { OPAPoliciesModal } from './OPAPoliciesModal'
import { OPAPoliciesTable } from './OPAPoliciesTable'
import type { OPAPoliciesProps, SortByOption } from './OPAPolicies.types'
import { createSortComparators, generateDemoStatuses, runClusterChecks } from './OPAPolicies.utils'

function OPAPoliciesInternal({ config: _config }: OPAPoliciesProps) {
  const { isDemoMode } = useDemoMode()
  const { deduplicatedClusters: clusters, isLoading, isFailed, consecutiveFailures } = useClusters()
  const { startMission } = useMissions()
  const { shouldUseDemoData } = useCardDemoState({ requires: 'agent' })

  // NOTE: useCardLoadingState is called below after statuses and reachableClusters are defined

  // Fetch clusters directly from agent as fallback (skip in demo mode)
  const [agentClusters, setAgentClusters] = useState<{ name: string; healthy?: boolean }[]>([])
  useEffect(() => {
    if (shouldUseDemoData) return
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_DEFAULT_TIMEOUT_MS)
    agentFetch(`${LOCAL_AGENT_HTTP_URL}/clusters`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (controller.signal.aborted) return
        if (data.clusters) {
          setAgentClusters((data.clusters || []).map((c: { name: string }) => ({ name: c.name, healthy: true })))
        }
      })
      .catch(() => { /* agent not available or request aborted */ })
      .finally(() => clearTimeout(timeoutId))
    return () => { clearTimeout(timeoutId); controller.abort() }
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
    const cached = safeGetJSON<Record<string, GatekeeperStatus>>(STORAGE_KEY_OPA_CACHE)
    if (cached && safeGetItem(STORAGE_KEY_OPA_CACHE_TIME)) {
      // Stale-while-revalidate: always return cached data.
      // Auto-refresh handles freshness — showing stale data is better than
      // showing loading spinners for 30+ seconds.
      return cached
    }
    return {}
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)
  const [opaClustersChecked, setOpaClustersChecked] = useState(0)
  const [opaTotalClusters, setOpaTotalClusters] = useState(0)

  // Persist statuses to localStorage when they change (only successful results, not loading/error)
  useEffect(() => {
    // Filter out loading statuses and error statuses — errors should be re-checked next load
    const completedStatuses = Object.fromEntries(
      Object.entries(statuses).filter(([_, s]) => !s.loading && !s.error)
    )
    if (Object.keys(completedStatuses).length > 0) {
      safeSetJSON(STORAGE_KEY_OPA_CACHE, completedStatuses)
      safeSetItem(STORAGE_KEY_OPA_CACHE_TIME, Date.now().toString())
    }
  }, [statuses])
  const { isOpen: showViolationsModal, open: openViolationsModal, close: closeViolationsModal } = useModalState()
  const [selectedClusterForViolations, setSelectedClusterForViolations] = useState<string>('')
  const { isOpen: showPolicyModal, open: openPolicyModal, close: closePolicyModal } = useModalState()
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
  const { isOpen: showCreatePolicyModal, open: openCreatePolicyModal, close: closeCreatePolicyModal } = useModalState()

  // Enrich cluster data with 'cluster' field for useCardData compatibility
  // Include reachable status so we can skip OPA checks for offline clusters
  const clusterItems = effectiveClusters.map(c => ({
      name: c.name,
      cluster: c.name, // useCardData needs this for global + local cluster filtering
      healthy: c.healthy,
      reachable: (c as { reachable?: boolean }).reachable }))

  // Build sort comparators using current statuses
  const sortComparators = createSortComparators(statuses)

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
      clusterFilterRef },
    sorting,
    containerRef,
    containerStyle } = useCardData<OPAClusterItem, SortByOption>(clusterItems, {
    filter: {
      searchFields: ['name'] as (keyof OPAClusterItem)[],
      clusterField: 'cluster' as keyof OPAClusterItem,
      storageKey: 'opa-policies' },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: sortComparators },
    defaultLimit: 5 })

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

  const checkClusters = useCallback(async (clustersToCheck: { name: string }[], forceCheck = false) => {
    await runClusterChecks(
      clustersToCheck,
      forceCheck,
      shouldUseDemoData,
      isCheckingRef,
      setStatuses,
      setIsRefreshing,
      setOpaClustersChecked,
      setOpaTotalClusters,
      setLastRefresh,
    )
  }, [shouldUseDemoData])

  // Filter clusters to only include reachable ones for OPA checks
  const reachableClusters = useMemo(() => {
    return effectiveClusters.filter(c => (c as { reachable?: boolean }).reachable !== false)
  }, [effectiveClusters])

  // Ref for reachable clusters for manual refresh
  const reachableClustersRef = useRef(reachableClusters)
  reachableClustersRef.current = reachableClusters

  // Wrapper for manual refresh - uses current reachable clusters, force check to override guards
  const handleRefresh = () => {
    checkClusters(reachableClustersRef.current, true)
  }

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
    isRefreshing,
    hasAnyData: shouldUseDemoData ? true : (clusters.length > 0 && hasOPAData),
    isDemoData: isDemoMode,
    isFailed,
    consecutiveFailures })

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
        violations: [] }
    }
    setStatuses(demoStatuses)
  }, [shouldUseDemoData, effectiveClusters, statuses])

  // Clear demo statuses when transitioning from demo → live mode.
  // Without this, fake violations from demo mode persist for clusters
  // where Gatekeeper is not installed (e.g., konflux-ci, ks-docs-oci).
  const prevDemoRef = useRef(shouldUseDemoData)
  useEffect(() => {
    if (prevDemoRef.current && !shouldUseDemoData) {
      // Was demo, now live — clear all statuses so only real detection shows
      setStatuses({})
      setHasTriggeredInitialCheck(false)
    }
    prevDemoRef.current = shouldUseDemoData
  }, [shouldUseDemoData])

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

Please:
1. Check if Gatekeeper is already installed. If not, install it.
2. After installation, ask:
   - "Gatekeeper is installed — should I set up a basic policy?"
   - "Something went wrong — want to see details?"
3. If I say set up a policy, create one and verify. Then ask:
   - "Should I create another policy?"
   - "All done"`,
      context: { clusterName } })
  }

  const { installedCount, totalViolations, activePolicies } = useMemo(() => {
    const installed = Object.values(statuses).filter(s => s.installed)
    return {
      installedCount: installed.length,
      totalViolations: installed.reduce((sum, s) => sum + (s.violationCount || 0), 0),
      activePolicies: installed.reduce((sum, s) => sum + (s.policyCount || 0), 0),
    }
  }, [statuses])

  const handleShowViolations = (clusterName: string) => {
    setSelectedClusterForViolations(clusterName)
    openViolationsModal()
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

Please:
1. Explain what the ${basedOnPolicy} policy does and ask what modifications I want.
2. Generate the ConstraintTemplate and Constraint, then ask:
   - "Ready to apply this to the cluster?"
   - "Want to adjust the rules first?"
3. If I say apply, deploy and test. Then ask:
   - "Should I create another policy?"
   - "All done"`
        : `I want to create a new OPA Gatekeeper policy for my Kubernetes cluster.

Please:
1. Ask me what kind of policy I want (e.g., require labels, restrict images, enforce resource limits).
2. Generate the ConstraintTemplate and Constraint, then ask:
   - "Ready to apply this to the cluster?"
   - "Want to adjust the rules first?"
3. If I say apply, deploy and test. Then ask:
   - "Should I create another policy?"
   - "All done"`,
      context: { basedOnPolicy } })
  }

  if (!shouldUseDemoData && ((isLoading && clusters.length === 0) || (isOPAChecking && !hasOPAData))) {
    return (
      <div className="h-full flex flex-col min-h-card items-center justify-center gap-3">
        {opaTotalClusters > 0 ? (
          <ProgressRing progress={opaClustersChecked / opaTotalClusters} size={28} strokeWidth={2.5} />
        ) : (
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50" />
        )}
        <p className="text-sm text-muted-foreground">Scanning clusters...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-card">
      <OPAPoliciesTable
        installedCount={installedCount}
        activePolicies={activePolicies}
        totalViolations={totalViolations}
        isRefreshing={isRefreshing}
        lastRefresh={lastRefresh}
        containerRef={containerRef}
        containerStyle={containerStyle}
        paginatedClusters={paginatedClusters}
        totalItems={totalItems}
        currentPage={currentPage}
        totalPages={totalPages}
        itemsPerPage={itemsPerPage}
        goToPage={goToPage}
        needsPagination={needsPagination}
        setItemsPerPage={setItemsPerPage}
        statuses={statuses}
        search={search}
        setSearch={setSearch}
        availableClusters={availableClusters}
        localClusterFilter={localClusterFilter}
        toggleClusterFilter={toggleClusterFilter}
        clearClusterFilter={clearClusterFilter}
        showClusterFilter={showClusterFilter}
        setShowClusterFilter={setShowClusterFilter}
        clusterFilterRef={clusterFilterRef}
        sorting={{
          sortBy: sorting.sortBy,
          setSortBy: value => sorting.setSortBy(value as SortByOption),
          sortDirection: sorting.sortDirection,
          setSortDirection: sorting.setSortDirection,
        }}
        onShowViolations={handleShowViolations}
        onInstallOPA={handleInstallOPA}
        onPolicyClick={policy => {
          setSelectedPolicy(policy)
          openPolicyModal()
        }}
        onCreatePolicy={openCreatePolicyModal}
      />

      <OPAPoliciesModal
        showViolationsModal={showViolationsModal}
        closeViolationsModal={closeViolationsModal}
        selectedClusterForViolations={selectedClusterForViolations}
        statuses={statuses}
        onRefresh={handleRefresh}
        startMission={startMission}
        showPolicyModal={showPolicyModal}
        closePolicyModal={closePolicyModal}
        selectedPolicy={selectedPolicy}
        setSelectedPolicy={setSelectedPolicy}
        onAddPolicy={handleAddPolicy}
        showCreatePolicyModal={showCreatePolicyModal}
        closeCreatePolicyModal={closeCreatePolicyModal}
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
