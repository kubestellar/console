import { useState, useEffect, useRef, useMemo } from 'react'
import { Rocket, XCircle, AlertTriangle, Loader2, Orbit } from 'lucide-react'
import { useDeployMissions } from '../../hooks/useDeployMissions'
import { useClusters } from '../../hooks/useMCP'
import type { DeployMission, DeployMissionStatus, DeployClusterStatus } from '../../hooks/useDeployMissions'
import { useCardData, commonComparators } from '../../lib/cards/cardHooks'
import { useCardLoadingState } from './CardDataContext'
import { useDemoMode } from '../../hooks/useDemoMode'
import { useTranslation } from 'react-i18next'
import { useMissions } from '../../hooks/useMissions'
import { useApiKeyCheck } from './console-missions/shared'
import { DEMO_MISSIONS, STATUS_ORDER, CLUSTER_FILTER_STORAGE_KEY, type SortByOption } from './Missions.constants'

export interface StatusConfig {
  icon: typeof Rocket
  color: string
  bg: string
  label: string
  animateClass?: string
}

export interface ClusterStatusConfig {
  color: string
  barColor: string
  label: string
}

export interface OrbitStatus {
  cadence: string
  lastResult?: string
  overdue: boolean
}

export function useMissionsData() {
  const { t } = useTranslation(['common', 'cards'])

  const STATUS_CONFIG = useMemo<Record<DeployMissionStatus, StatusConfig>>(() => ({
    launching: { icon: Rocket, color: 'text-blue-400', bg: 'bg-blue-500/20', label: t('cards:missionStatus.launching', 'Launching'), animateClass: 'animate-rocket-launch' },
    deploying: { icon: Loader2, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: t('cards:missionStatus.deploying', 'Deploying'), animateClass: 'animate-spin' },
    orbit: { icon: Orbit, color: 'text-green-400', bg: 'bg-green-500/20', label: t('cards:missionStatus.inOrbit', 'In Orbit') },
    abort: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: t('cards:missionStatus.aborted', 'Aborted') },
    partial: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/20', label: t('cards:missionStatus.partial', 'Partial') },
  }), [t])

  const CLUSTER_STATUS_CONFIG = useMemo<Record<DeployClusterStatus['status'], ClusterStatusConfig>>(() => ({
    pending: { color: 'text-muted-foreground', barColor: 'bg-muted-foreground', label: t('cards:clusterStatus.pending', 'Pending') },
    applying: { color: 'text-yellow-400', barColor: 'bg-yellow-500', label: t('cards:clusterStatus.applying', 'Applying') },
    running: { color: 'text-green-400', barColor: 'bg-green-500', label: t('cards:clusterStatus.running', 'Running') },
    failed: { color: 'text-red-400', barColor: 'bg-red-500', label: t('cards:clusterStatus.failed', 'Failed') },
  }), [t])

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
    failed: { color: 'text-red-400', label: t('cards:dependencyAction.failed', 'Failed') },
  }), [t])

  const { missions: liveMissions, activeMissions: liveActive, completedMissions: liveCompleted } = useDeployMissions()
  const { deduplicatedClusters, isLoading, isRefreshing, isFailed, consecutiveFailures } = useClusters()
  const { isDemoMode: demoMode } = useDemoMode()

  const missions = demoMode ? DEMO_MISSIONS : liveMissions
  const activeMissions = demoMode ? [] : liveActive
  const completedMissions = demoMode ? DEMO_MISSIONS : liveCompleted

  const [expandedMissions, setExpandedMissions] = useState<Set<string>>(new Set())
  const [hideCompleted, setHideCompleted] = useState(false)

  const { startMission, missions: aiMissions } = useMissions()

  const orbitMissionsByProject = useMemo(() => {
    const map = new Map<string, OrbitStatus>()
    for (const m of aiMissions || []) {
      if (m.importedFrom?.missionClass !== 'orbit') continue
      const config = m.context?.orbitConfig as { cadence?: string; lastRunAt?: string; lastRunResult?: string } | undefined
      if (!config) continue
      const cadenceHours = config.cadence === 'daily' ? 24 : config.cadence === 'monthly' ? 720 : 168
      const lastRun = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0
      const overdue = lastRun ? (Date.now() - lastRun) > cadenceHours * 3_600_000 : false
      for (const proj of (m.context?.orbitConfig as { projects?: string[] })?.projects || []) {
        map.set(proj.toLowerCase(), { cadence: config.cadence || 'weekly', lastResult: config.lastRunResult, overdue })
      }
    }
    return map
  }, [aiMissions])

  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  const hasData = missions.length > 0 || deduplicatedClusters.length > 0
  useCardLoadingState({
    isLoading: isLoading && !hasData,
    isRefreshing,
    hasAnyData: hasData,
    isDemoData: demoMode,
    isFailed,
    consecutiveFailures,
  })

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
    } catch { /* ignore storage errors */ }
  }

  const toggleClusterFilter = (name: string) => {
    persistClusterFilter(
      clusterFilter.includes(name) ? clusterFilter.filter(c => c !== name) : [...clusterFilter, name],
    )
  }

  const clearClusterFilter = () => persistClusterFilter([])

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
        initialPrompt: `Diagnose why deployment mission for "${mission.workload}" in namespace "${mission.namespace}" failed.\n\nSource cluster: ${mission.sourceCluster}\nTarget clusters: ${targetClustersStr}\nFailed clusters: ${failedClusterNames || 'None'}\nStatus: ${mission.status}\n\nPlease:\n1. Analyze the deployment events and logs\n2. Identify the root cause of the failure\n3. Provide specific remediation steps`,
        context: { kind: 'Deployment', name: mission.workload, namespace: mission.namespace, cluster: mission.sourceCluster, status: mission.status, targetClusters: mission.targetClusters, clusterStatuses: mission.clusterStatuses },
      })
    })
  }

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
        initialPrompt: `Repair failed deployment mission for "${mission.workload}" in namespace "${mission.namespace}".\n\nSource cluster: ${mission.sourceCluster}\nTarget clusters: ${targetClustersStr}\n\nIssues:\n${issues}\n\nPlease:\n1. Diagnose the root cause\n2. Suggest fixes with exact kubectl commands\n3. Explain potential side effects\n4. Apply fixes step by step with my confirmation`,
        context: { kind: 'Deployment', name: mission.workload, namespace: mission.namespace, cluster: mission.sourceCluster, status: mission.status, targetClusters: mission.targetClusters, clusterStatuses: mission.clusterStatuses },
      })
    })
  }

  const rawMissions = (() => {
    let list = hideCompleted ? activeMissions : missions
    if (clusterFilter.length > 0) {
      list = list.filter(m => m.targetClusters.some(c => clusterFilter.includes(c)))
    }
    return list
  })()

  const cardData = useCardData<DeployMission, SortByOption>(rawMissions, {
    filter: {
      searchFields: ['workload', 'namespace', 'sourceCluster', 'groupName'],
      customPredicate: (mission, query) => mission.targetClusters.some(c => c.toLowerCase().includes(query)),
      storageKey: 'deployment-missions',
    },
    sort: {
      defaultField: 'status',
      defaultDirection: 'asc',
      comparators: {
        status: commonComparators.statusOrder<DeployMission>('status', STATUS_ORDER),
        workload: commonComparators.string<DeployMission>('workload'),
        time: (a, b) => a.startedAt - b.startedAt,
        clusters: (a, b) => (a.targetClusters || []).join(',').localeCompare((b.targetClusters || []).join(',')),
      },
    },
    defaultLimit: 5,
  })

  return {
    t,
    STATUS_CONFIG,
    CLUSTER_STATUS_CONFIG,
    SORT_OPTIONS,
    DEP_ACTION_STYLES,
    activeMissions,
    completedMissions,
    expandedMissions,
    toggleMission,
    hideCompleted,
    setHideCompleted,
    clusterFilter,
    showClusterFilter,
    setShowClusterFilter,
    clusterFilterRef,
    toggleClusterFilter,
    clearClusterFilter,
    availableClusters,
    orbitMissionsByProject,
    showKeyPrompt,
    dismissPrompt,
    goToSettings,
    handleDiagnose,
    handleRepair,
    ...cardData,
  }
}
