import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useClusterHealth,
  usePodIssues,
  useDeploymentIssues,
  useGPUNodes,
  useNodes,
  useNamespaceStats,
  useDeployments,
  useClusters,
  type GPUNode,
  type DeploymentIssue,
} from '../../hooks/useMCP'
import { isClusterUnreachable, isClusterHealthy } from './utils'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { emitClusterAction } from '../../lib/analytics'
import { formatMemoryPromptStat } from '../../lib/formatStats'
import { buildDiagnosePrompt, buildRepairPrompt } from './diagnosePrompt'

const MAX_INITIAL_LOADING_MS = 10_000
const MAX_HEADER_ALIASES = 2

/**
 * Bundles all UI expand/modal open state for ClusterDetailModal so the
 * main component only needs a single hook call for UI state.
 */
export function useClusterDetailUIState() {
  const [showAllNamespaces, setShowAllNamespaces] = useState(false)
  const [showPodsByNamespace, setShowPodsByNamespace] = useState(false)
  const [showNodeDetails, setShowNodeDetails] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null)
  const [showCPUDetail, setShowCPUDetail] = useState(false)
  const [showMemoryDetail, setShowMemoryDetail] = useState(false)
  const [showStorageDetail, setShowStorageDetail] = useState(false)
  const [showGPUDetail, setShowGPUDetail] = useState(false)

  return {
    showAllNamespaces,
    setShowAllNamespaces,
    showPodsByNamespace,
    setShowPodsByNamespace,
    showNodeDetails,
    setShowNodeDetails,
    expandedNodes,
    setExpandedNodes,
    expandedNamespace,
    setExpandedNamespace,
    showCPUDetail,
    setShowCPUDetail,
    showMemoryDetail,
    setShowMemoryDetail,
    showStorageDetail,
    setShowStorageDetail,
    showGPUDetail,
    setShowGPUDetail,
  }
}

type GpuByType = Record<string, { total: number; allocated: number; nodes: GPUNode[] }>

/**
 * Aggregates all data-fetching, derived state and action handlers for
 * ClusterDetailModal. Keeps the modal component under the 10-hook limit
 * while preserving every behaviour (isDemoData wiring, isRefreshing cache,
 * GPU deduplication, force-show timeout, etc.).
 */
export function useClusterDetail(clusterName: string, onClose: () => void) {
  const { t } = useTranslation()
  const { deduplicatedClusters, clusters: rawClusters } = useClusters()

  const clusterInfo = (() => {
    let found = deduplicatedClusters.find(c => c.name === clusterName)
    if (found) return found
    found = deduplicatedClusters.find(c => c.aliases?.includes(clusterName))
    if (found) return found
    return rawClusters.find(c => c.name === clusterName)
  })()

  const isKnownUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false

  const { health, isLoading, error: healthError } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(isKnownUnreachable ? undefined : clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(isKnownUnreachable ? undefined : clusterName)
  const { nodes: gpuNodes, isLoading: gpuLoading, isRefreshing: gpuRefreshing } = useGPUNodes(
    isKnownUnreachable ? undefined : clusterName,
  )
  const { nodes: clusterNodes, isLoading: nodesLoading } = useNodes(
    isKnownUnreachable ? undefined : clusterName,
  )
  const { stats: namespaceStats, isLoading: nsLoading } = useNamespaceStats(
    isKnownUnreachable ? undefined : clusterName,
  )
  const { deployments: clusterDeployments } = useDeployments(
    isKnownUnreachable ? undefined : clusterName,
  )
  const { drillToPod, drillToDeployment } = useDrillDownActions()
  const { startMission } = useMissions()

  // Force exit from loading state after MAX_INITIAL_LOADING_MS
  const [forceShowContent, setForceShowContent] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => setForceShowContent(true), MAX_INITIAL_LOADING_MS)
    return () => clearTimeout(timeout)
  }, [clusterName])

  // Build map of raw cluster names → deduplicated primary names for GPU deduplication
  const clusterNameMap: Record<string, string> = (() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach(c => {
      map[c.name] = c.name
      c.aliases?.forEach(alias => { map[alias] = c.name })
    })
    return map
  })()

  // Deduplicate GPU nodes by name to avoid counting the same physical node twice
  const deduplicatedGpuNodes: GPUNode[] = (() => {
    const seen = new Map<string, GPUNode>()
    gpuNodes.forEach(node => {
      if (!seen.has(node.name)) {
        const mappedCluster = clusterNameMap[node.cluster] || node.cluster
        seen.set(node.name, { ...node, cluster: mappedCluster })
      }
    })
    return Array.from(seen.values())
  })()

  const clusterGPUs = deduplicatedGpuNodes.filter(n => {
    const primaryClusterName = clusterInfo?.name || clusterName
    return (
      n.cluster === primaryClusterName ||
      n.cluster === clusterName ||
      n.cluster.includes(primaryClusterName.split('/')[0])
    )
  })

  const clusterDeploymentIssues: DeploymentIssue[] = deploymentIssues.filter(
    d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0]),
  )

  const promptMemorySummary = formatMemoryPromptStat(health?.memoryGB)
  const totalClusterGpus = clusterGPUs.reduce((sum, node) => sum + node.gpuCount, 0)

  const isUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false
  const isHealthy = clusterInfo
    ? isClusterHealthy(clusterInfo)
    : !isLoading && health?.healthy !== false
  const effectiveLoading = forceShowContent ? false : isLoading

  const aliasList = clusterInfo?.aliases || []
  const serverAddress = clusterInfo?.server || health?.apiServer
  const headerAliasSummary =
    aliasList.length <= MAX_HEADER_ALIASES
      ? aliasList.map(alias => alias.split('/').pop() || alias).join(', ')
      : `${aliasList
          .slice(0, MAX_HEADER_ALIASES)
          .map(alias => alias.split('/').pop() || alias)
          .join(', ')} ${t('cluster.andMoreClusters', { count: aliasList.length - MAX_HEADER_ALIASES })}`

  const gpuByType: GpuByType = (() => {
    const map: GpuByType = {}
    clusterGPUs.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) map[type] = { total: 0, allocated: 0, nodes: [] }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes.push(node)
    })
    return map
  })()

  // Retain last non-empty GPU data so the section doesn't vanish during refetch (#8597).
  // Only fall back to cached data while a refresh/load is in progress (transient empty).
  // When a settled (non-loading, non-refreshing) fetch returns empty, clear cache (#8601).
  const isGpuTransient = gpuLoading || gpuRefreshing
  const lastGpuDataRef = useRef<{ clusterGPUs: GPUNode[]; gpuByType: GpuByType }>({
    clusterGPUs: [],
    gpuByType: {},
  })
  if (clusterGPUs.length > 0) {
    lastGpuDataRef.current = { clusterGPUs, gpuByType }
  } else if (!isGpuTransient) {
    lastGpuDataRef.current = { clusterGPUs: [], gpuByType: {} }
  }
  const stableClusterGPUs = clusterGPUs.length > 0 ? clusterGPUs : lastGpuDataRef.current.clusterGPUs
  const stableGpuByType = clusterGPUs.length > 0 ? gpuByType : lastGpuDataRef.current.gpuByType

  const handleDiagnose = () => {
    emitClusterAction('diagnose', clusterName)
    onClose()
    startMission({
      title: t('cluster.diagnoseMissionTitle', { cluster: clusterName.split('/').pop() }),
      description: t('cluster.diagnoseMissionDescription'),
      type: 'troubleshoot',
      cluster: clusterName,
      initialPrompt: buildDiagnosePrompt({
        clusterName,
        health,
        promptMemorySummary,
        totalGpuCount: totalClusterGpus,
        podIssues,
        deploymentIssues: clusterDeploymentIssues,
      }),
      context: {
        clusterName,
        health,
        podIssuesCount: podIssues.length,
        deploymentIssuesCount: clusterDeploymentIssues.length,
      },
    })
  }

  const handleRepair = () => {
    emitClusterAction('repair', clusterName)
    onClose()
    startMission({
      title: t('cluster.repairMissionTitle', { cluster: clusterName.split('/').pop() }),
      description: t('cluster.repairMissionDescription'),
      type: 'repair',
      cluster: clusterName,
      initialPrompt: buildRepairPrompt({
        clusterName,
        podIssues,
        deploymentIssues: clusterDeploymentIssues,
      }),
      context: {
        clusterName,
        podIssues: podIssues.slice(0, 10),
        deploymentIssues: clusterDeploymentIssues.slice(0, 10),
      },
    })
  }

  const handleAsk = () => {
    emitClusterAction('ask', clusterName)
    onClose()
    startMission({
      title: `Ask about ${clusterName.split('/').pop()}`,
      description: 'Custom question about the cluster',
      type: 'custom',
      cluster: clusterName,
      initialPrompt: `I have a question about Kubernetes cluster "${clusterName}". The cluster currently has ${health?.nodeCount || 0} nodes, ${health?.podCount || 0} pods, ${health?.cpuCores || 0} CPU cores, and ${promptMemorySummary} memory. How can I help you?`,
      context: { clusterName, health },
    })
  }

  return {
    clusterInfo,
    health,
    healthError,
    isLoading: effectiveLoading,
    nodesLoading,
    nsLoading,
    podIssues,
    clusterDeploymentIssues,
    clusterNodes,
    namespaceStats,
    clusterDeployments,
    stableClusterGPUs,
    stableGpuByType,
    isUnreachable,
    isHealthy,
    aliasList,
    serverAddress,
    headerAliasSummary,
    drillToPod,
    drillToDeployment,
    handleDiagnose,
    handleRepair,
    handleAsk,
  }
}
