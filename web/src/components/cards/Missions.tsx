import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Rocket,
  XCircle,
  AlertTriangle,
  Loader2,
  Orbit,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useDeployMissions } from '../../hooks/useDeployMissions'
import { useClusters } from '../../hooks/useMCP'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../hooks/useDeployMissions'
import { CardControlsRow, CardSearchInput, CardPaginationFooter, CardEmptyState } from '../../lib/cards/CardComponents'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck, ApiKeyPromptModal } from './console-missions/shared'
import { MS_PER_MINUTE } from '../../lib/constants/time'
import { MissionRow, type OrbitStatus } from './missions/MissionRow'
import { MissionStatusBadge } from './missions/MissionStatusBadge'

// Named time-offset constants for demo fixture data (CLAUDE.md: No Magic Numbers)
const TWO_MINUTES_MS = 2 * MS_PER_MINUTE
const THREE_MINUTES_MS = 3 * MS_PER_MINUTE
const FOUR_MINUTES_MS = 4 * MS_PER_MINUTE
const FIVE_MINUTES_MS = 5 * MS_PER_MINUTE

interface MissionsProps {
  config?: Record<string, unknown>
}

const DEMO_MISSIONS: DeployMission[] = [
  {
    id: 'demo-1',
    workload: 'nginx-frontend',
    namespace: 'production',
    sourceCluster: 'eks-prod-us-east-1',
    targetClusters: ['openshift-prod', 'do-nyc1-prod'],
    groupName: 'production',
    status: 'orbit',
    clusterStatuses: [
      { cluster: 'openshift-prod', status: 'running', replicas: 3, readyReplicas: 3 },
      { cluster: 'do-nyc1-prod', status: 'running', replicas: 3, readyReplicas: 3 },
    ],
    startedAt: Date.now() - FIVE_MINUTES_MS,
    completedAt: Date.now() - FOUR_MINUTES_MS },
  {
    id: 'demo-2',
    workload: 'api-gateway',
    namespace: 'staging',
    sourceCluster: 'gke-staging',
    targetClusters: ['aks-dev-westeu', 'rancher-mgmt'],
    groupName: 'staging',
    status: 'orbit',
    clusterStatuses: [
      { cluster: 'aks-dev-westeu', status: 'running', replicas: 2, readyReplicas: 2 },
      { cluster: 'rancher-mgmt', status: 'running', replicas: 2, readyReplicas: 2 },
    ],
    startedAt: Date.now() - THREE_MINUTES_MS,
    completedAt: Date.now() - TWO_MINUTES_MS },
]

// Status priority for sorting (active first)
const STATUS_ORDER: Record<string, number> = {
  launching: 1,
  deploying: 2,
  partial: 3,
  orbit: 4,
  abort: 5 }

type SortByOption = 'status' | 'workload' | 'time' | 'clusters'

// Created at module level but will be recreated in Missions component with t()

/** Storage key for persisted cluster filter selection */
const CLUSTER_FILTER_STORAGE_KEY = 'kubestellar-card-filter:deployment-missions-clusters'

export function Missions(_props: MissionsProps) {
  const { t } = useTranslation(['common', 'cards'])

  // Translated config objects created here so they have access to t()
  const STATUS_CONFIG = useMemo<Record<DeployMissionStatus, {
    icon: typeof Rocket
    color: string
    bg: string
    label: string
    animateClass?: string
  }>>(() => ({
    launching: {
      icon: Rocket,
      color: 'text-blue-400',
      bg: 'bg-blue-500/20',
      label: t('cards:missionStatus.launching', 'Launching'),
      animateClass: 'animate-rocket-launch' },
    deploying: {
      icon: Loader2,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/20',
      label: t('cards:missionStatus.deploying', 'Deploying'),
      animateClass: 'animate-spin' },
    orbit: {
      icon: Orbit,
      color: 'text-green-400',
      bg: 'bg-green-500/20',
      label: t('cards:missionStatus.inOrbit', 'In Orbit') },
    abort: {
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      label: t('cards:missionStatus.aborted', 'Aborted') },
    partial: {
      icon: AlertTriangle,
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
      label: t('cards:missionStatus.partial', 'Partial') } }), [t])

  // ClusterStatusRow renders a row's text (`color`), a progress bar
  // (`barColor`), and a status label. The `bg` field used to be declared here
  // but was never read by ClusterStatusRow — dropped so the config matches
  // the renderer. `pending`'s barColor is also never visually shown (the bar
  // is forced to 0% width for the pending state at the call site), so its
  // value is cosmetic; semantic-token choice there still matters for the
  // text color which IS rendered. Tinted accent colors
  // (yellow/green/red at /20 + /500) already read on both light and dark
  // themes, so no dark: variants needed.
  const CLUSTER_STATUS_CONFIG = useMemo<Record<DeployClusterStatus['status'], {
    color: string
    barColor: string
    label: string
  }>>(() => ({
    pending: { color: 'text-muted-foreground', barColor: 'bg-muted-foreground', label: t('cards:clusterStatus.pending', 'Pending') },
    applying: { color: 'text-yellow-400', barColor: 'bg-yellow-500', label: t('cards:clusterStatus.applying', 'Applying') },
    running: { color: 'text-green-400', barColor: 'bg-green-500', label: t('cards:clusterStatus.running', 'Running') },
    failed: { color: 'text-red-400', barColor: 'bg-red-500', label: t('cards:clusterStatus.failed', 'Failed') } }), [t])

  const SORT_OPTIONS = useMemo<{ value: SortByOption; label: string }[]>(() => [
    { value: 'status', label: t('common:sortBy.status', 'Status') },
    { value: 'workload', label: t('common:sortBy.workload', 'Workload') },
    { value: 'time', label: t('common:sortBy.time', 'Time') },
    { value: 'clusters', label: t('common:sortBy.clusters', 'Clusters') },
  ], [t])

  const DEP_ACTION_STYLES = useMemo<Record<string, { color: string; label: string }>>(() => ({
    created: { color: 'text-green-400', label: t('cards:dependencyAction.created', 'Created') },
    updated: { color: 'text-blue-400', label: t('cards:dependencyAction.updated', 'Updated') },
    skipped: { color: 'text-muted-foreground', label: t('cards:dependencyAction.skipped', 'Skipped') },
    failed: { color: 'text-red-400', label: t('cards:dependencyAction.failed', 'Failed') } }), [t])

  const { missions: liveMissions, activeMissions: liveActive, completedMissions: liveCompleted } = useDeployMissions()
  const { deduplicatedClusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { isDemoMode: demoMode } = useDemoMode()
  const missions = demoMode ? DEMO_MISSIONS : liveMissions
  const activeMissions = demoMode ? [] : liveActive
  const completedMissions = demoMode ? DEMO_MISSIONS : liveCompleted
  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(new Set())
  const [hideCompleted, setHideCompleted] = useState(false)

  // AI mission hooks at card level
  const { startMission, missions: aiMissions } = useMissions()

  // Find orbit missions for "In Orbit" status display
  const orbitMissionsByProject = useMemo(() => {
    const map = new Map<string, { cadence: string; lastResult?: string; overdue: boolean }>()
    for (const m of aiMissions || []) {
      if (m.importedFrom?.missionClass !== 'orbit') continue
      const config = m.context?.orbitConfig as { cadence?: string; lastRunAt?: string; lastRunResult?: string } | undefined
      if (!config) continue
      const cadenceHours = config.cadence === 'daily' ? 24 : config.cadence === 'monthly' ? 720 : 168
      const lastRun = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0
      const overdue = lastRun ? (Date.now() - lastRun) > cadenceHours * 3_600_000 : false
      for (const proj of (m.context?.orbitConfig as { projects?: string[] })?.projects || []) {
        map.set(proj.toLowerCase(), {
          cadence: config.cadence || 'weekly',
          lastResult: config.lastRunResult,
          overdue,
        })
      }
    }
    return map
  }, [aiMissions])
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  // Report state to CardWrapper for refresh animation
  const hasData = missions.length > 0 || deduplicatedClusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: demoMode,
    isFailed,
    consecutiveFailures })

  // Manual cluster filter — filters by target clusters (not source).
  // Can't use useCardData's built-in cluster filter because the global
  // filterByCluster hardcodes item.cluster which DeployMission doesn't have.
  const [clusterFilter, setClusterFilter] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(CLUSTER_FILTER_STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  })
  const [showClusterFilter, setShowClusterFilter] = useState(false)
  const clusterFilterRef = useRef<HTMLDivElement>(null)

  const persistClusterFilter = (clusters: string[]) => {
    setClusterFilter(clusters)
    try {
      if (clusters.length === 0) {
        localStorage.removeItem(CLUSTER_FILTER_STORAGE_KEY)
      } else {
        localStorage.setItem(CLUSTER_FILTER_STORAGE_KEY, JSON.stringify(clusters))
      }
    } catch {
      // Ignore storage errors (e.g. private browsing, quota exceeded)
    }
  }

  const toggleClusterFilter = (name: string) => {
    persistClusterFilter(
      clusterFilter.includes(name)
        ? clusterFilter.filter(c => c !== name)
        : [...clusterFilter, name],
    )
  }

  const clearClusterFilter = () => persistClusterFilter([])

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (clusterFilterRef.current && !clusterFilterRef.current.contains(e.target as Node)) {
        setShowClusterFilter(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const availableClusters = deduplicatedClusters.filter(c => c.reachable !== false)

  const toggleMission = (id: string) => {
    setExpandedMissions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // AI Diagnose handler
  const handleDiagnose = (mission: DeployMission) => {
    checkKeyAndRun(() => {
      if (!mission.targetClusters?.length) return
      const targetClustersStr = (mission.targetClusters || []).join(', ')
      const failedClusterNames = (mission.clusterStatuses || [])
        .filter(cs => cs.status === 'failed')
        .map(cs => cs.cluster)
        .join(', ')

      startMission({
        title: `Diagnose ${mission.workload}`,
        description: `Analyze failed deployment to ${mission.targetClusters.length} cluster(s)`,
        type: 'troubleshoot',
        cluster: mission.targetClusters[0],
        initialPrompt: `Diagnose why deployment mission for "${mission.workload}" in namespace "${mission.namespace}" failed.

Source cluster: ${mission.sourceCluster}
Target clusters: ${targetClustersStr}
Failed clusters: ${failedClusterNames || 'None'}
Status: ${mission.status}

Please:
1. Analyze the deployment events and logs
2. Identify the root cause of the failure
3. Provide specific remediation steps`,
        context: {
          kind: 'Deployment',
          name: mission.workload,
          namespace: mission.namespace,
          cluster: mission.sourceCluster,
          status: mission.status,
          targetClusters: mission.targetClusters,
          clusterStatuses: mission.clusterStatuses } })
    })
  }

  // AI Repair handler
  const handleRepair = (mission: DeployMission) => {
    checkKeyAndRun(() => {
      if (!mission.targetClusters?.length) return
      const targetClustersStr = (mission.targetClusters || []).join(', ')
      const failedClusterNames = (mission.clusterStatuses || [])
        .filter(cs => cs.status === 'failed')
        .map(cs => cs.cluster)
      const issues = failedClusterNames.length > 0
        ? failedClusterNames.map(cluster => `- ${cluster}: Deployment failed`).join('\n')
        : 'Deployment partially completed or aborted'

      startMission({
        title: `Repair ${mission.workload}`,
        description: `Fix failed deployment to ${mission.targetClusters.length} cluster(s)`,
        type: 'repair',
        cluster: mission.targetClusters[0],
        initialPrompt: `Repair failed deployment mission for "${mission.workload}" in namespace "${mission.namespace}".

Source cluster: ${mission.sourceCluster}
Target clusters: ${targetClustersStr}

Issues:
${issues}

Please:
1. Diagnose the root cause
2. Suggest fixes with exact kubectl commands
3. Explain potential side effects
4. Apply fixes step by step with my confirmation`,
        context: {
          kind: 'Deployment',
          name: mission.workload,
          namespace: mission.namespace,
          cluster: mission.sourceCluster,
          status: mission.status,
          targetClusters: mission.targetClusters,
          clusterStatuses: mission.clusterStatuses } })
    })
  }

  // Pre-filter: hide completed + cluster filter (by target clusters)
  const rawMissions = (() => {
    let list = hideCompleted ? activeMissions : missions
    if (clusterFilter.length > 0) {
      list = list.filter(m =>
        m.targetClusters.some(c => clusterFilter.includes(c)),
      )
    }
    return list
  })()

  // useCardData handles search, sort, and pagination
  const {
    items: visibleMissions,
    totalItems,
    currentPage,
    totalPages,
    itemsPerPage,
    goToPage,
    needsPagination,
    setItemsPerPage,
    filters: {
      search: localSearch,
      setSearch: setLocalSearch },
    sorting: {
      sortBy,
      setSortBy,
      sortDirection,
      setSortDirection },
    containerRef,
    containerStyle } = useCardData<DeployMission, SortByOption>(rawMissions, {
    filter: {
      searchFields: ['workload', 'namespace', 'sourceCluster', 'groupName'],
      customPredicate: (mission, query) =>
        mission.targetClusters.some(c => c.toLowerCase().includes(query)),
      storageKey: 'deployment-missions' },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.statusOrder<DeployMission>('status', STATUS_ORDER),
        workload: commonComparators.string<DeployMission>('workload'),
        time: (a, b) => a.startedAt - b.startedAt,
        clusters: (a, b) =>
          (a.targetClusters || []).join(',').localeCompare((b.targetClusters || []).join(',')) } },
    defaultLimit: 5 })

  return (
    <div className="h-full flex flex-col">
      {/* Controls row: cluster filter + sort + limit */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <MissionStatusBadge activeCount={activeMissions.length} />
        </div>
        <CardControlsRow
          clusterIndicator={{
            selectedCount: clusterFilter.length,
            totalCount: availableClusters.length }}
          clusterFilter={{
            availableClusters,
            selectedClusters: clusterFilter,
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
          extra={
            completedMissions.length > 0 ? (
              <button
                onClick={() => setHideCompleted(!hideCompleted)}
                className="text-2xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {hideCompleted ? `Show done (${completedMissions.length})` : 'Hide done'}
              </button>
            ) : undefined
          }
          className="mb-0!"
        />
      </div>

      {/* Search */}
      <CardSearchInput
        value={localSearch}
        onChange={setLocalSearch}
        placeholder={t('common:searchMissions', 'Search missions...')}
        className="mb-2 shrink-0"
      />

      {/* Mission list — scrollable */}
      {visibleMissions.length === 0 ? (
        <CardEmptyState
          icon={Rocket}
          title={t('cards:missionsCard.noMissionsFound')}
          message={localSearch || clusterFilter.length > 0
            ? 'Try adjusting your filters'
            : 'Deploy a workload to start a mission'}
        />
      ) : (
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto scroll-enhanced space-y-2" style={containerStyle}>
          {visibleMissions.map(mission => {
            const isActive = mission.status === 'launching' || mission.status === 'deploying'
            return (
              <MissionRow
                key={mission.id}
                mission={mission}
                isExpanded={expandedMissions.has(mission.id)}
                onToggle={() => toggleMission(mission.id)}
                isActive={isActive}
                onDiagnose={handleDiagnose}
                onRepair={handleRepair}
                orbitStatus={mission.status === 'orbit' ? orbitMissionsByProject.get(mission.workload.toLowerCase()) as OrbitStatus | undefined : undefined}
                statusConfig={STATUS_CONFIG}
                clusterStatusConfig={CLUSTER_STATUS_CONFIG}
                depActionStyles={DEP_ACTION_STYLES}
              />
            )
          })}
        </div>
      )}

      {/* Pagination */}
      <CardPaginationFooter
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={typeof itemsPerPage === 'number' ? itemsPerPage : 5}
        onPageChange={goToPage}
        needsPagination={needsPagination && itemsPerPage !== 'unlimited'}
      />

      {/* Status legend — pinned to bottom */}
      <div className="pt-2 border-t border-border shrink-0">
        <div className="flex items-center justify-center gap-3 text-2xs text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Rocket className="w-2.5 h-2.5 text-blue-400" /> Launch
          </span>
          <span className="flex items-center gap-1">
            <Loader2 className="w-2.5 h-2.5 text-yellow-400" /> Deploy
          </span>
          <span className="flex items-center gap-1">
            <Orbit className="w-2.5 h-2.5 text-green-400" /> Orbit
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5 text-red-400" /> Abort
          </span>
        </div>
      </div>

      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />
    </div>
  )
}
