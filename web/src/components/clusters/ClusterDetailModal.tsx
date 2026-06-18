import { useState, useRef, useEffect } from 'react'
import { BaseModal } from '../../lib/modals'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaceStats, useDeployments, useClusters, type ClusterInfo } from '../../hooks/useMCP'
import { isClusterUnreachable, isClusterHealthy } from './utils'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { emitClusterAction } from '../../lib/analytics'
import { CPUDetailModal, MemoryDetailModal, StorageDetailModal, GPUDetailModal } from './ResourceDetailModals'
import { useTranslation } from 'react-i18next'
import { formatMemoryPromptStat } from '../../lib/formatStats'
import { buildDiagnosePrompt, buildRepairPrompt } from './diagnosePrompt'
import { ClusterDetailHeader } from './ClusterDetailModal.header'
import { ClusterDetailStats } from './ClusterDetailModal.stats'
import { ClusterDetailSections } from './ClusterDetailModal.sections'

// Maximum time to wait for initial data before forcing modal to show content (10 seconds)
// Prevents indefinite loading when cluster is slow or unreachable
const MAX_INITIAL_LOADING_MS = 10_000
const MAX_HEADER_ALIASES = 2

interface ClusterDetailModalProps {
  clusterName: string
  clusterUser?: string  // Optional kubeconfig user for provider detection
  onClose: () => void
  onRename?: (clusterName: string) => void
  /**
   * Invoked when the user clicks "Remove cluster" on an unreachable cluster (#5901).
   * Only rendered when the cluster is unreachable and backed by a kubeconfig context.
   */
  onRemove?: (clusterName: string) => void
}

export function ClusterDetailModal({ clusterName, clusterUser, onClose, onRename, onRemove }: ClusterDetailModalProps) {
  const { t } = useTranslation()
  
  // Get cluster info early to check if unreachable
  const { deduplicatedClusters, clusters: rawClusters } = useClusters()
  const clusterInfo = (() => {
    let found = deduplicatedClusters.find((c: ClusterInfo) => c.name === clusterName)
    if (found) return found
    found = deduplicatedClusters.find((c: ClusterInfo) => c.aliases?.includes(clusterName))
    if (found) return found
    return rawClusters.find((c: ClusterInfo) => c.name === clusterName)
  })()
  
  // Early bailout: if cluster is known unreachable, skip expensive data fetching
  const isKnownUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false
  
  // Conditionally call hooks - only fetch data for reachable clusters
  const { health, isLoading, error: healthError } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(isKnownUnreachable ? undefined : clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(isKnownUnreachable ? undefined : clusterName)
  const { nodes: gpuNodes, isLoading: gpuLoading, isRefreshing: gpuRefreshing } = useGPUNodes(isKnownUnreachable ? undefined : clusterName)
  const { nodes: clusterNodes, isLoading: nodesLoading } = useNodes(isKnownUnreachable ? undefined : clusterName)
  const { stats: namespaceStats, isLoading: nsLoading } = useNamespaceStats(isKnownUnreachable ? undefined : clusterName)
  const { deployments: clusterDeployments } = useDeployments(isKnownUnreachable ? undefined : clusterName)
  const { drillToPod, drillToDeployment } = useDrillDownActions()
  const { startMission } = useMissions()
  
  // Force exit from loading state after MAX_INITIAL_LOADING_MS
  const [forceShowContent, setForceShowContent] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setForceShowContent(true)
    }, MAX_INITIAL_LOADING_MS)
    return () => clearTimeout(timeout)
  }, [clusterName])

  // Build a map of raw cluster names to deduplicated primary names for GPU deduplication
  const clusterNameMap = (() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach((c: ClusterInfo) => {
      map[c.name] = c.name
      c.aliases?.forEach(alias => { map[alias] = c.name })
    })
    return map
  })()

  // Deduplicate GPU nodes by name to avoid counting same physical node twice
  const deduplicatedGpuNodes = (() => {
    const seenNodes = new Map<string, typeof gpuNodes[0]>()
    gpuNodes.forEach(node => {
      const nodeKey = node.name
      if (!seenNodes.has(nodeKey)) {
        const mappedCluster = clusterNameMap[node.cluster] || node.cluster
        seenNodes.set(nodeKey, { ...node, cluster: mappedCluster })
      }
    })
    return Array.from(seenNodes.values())
  })()

  const [showAllNamespaces, setShowAllNamespaces] = useState(false)
  const [showPodsByNamespace, setShowPodsByNamespace] = useState(false)
  const [showNodeDetails, setShowNodeDetails] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null)
  // Resource detail modals
  const [showCPUDetail, setShowCPUDetail] = useState(false)
  const [showMemoryDetail, setShowMemoryDetail] = useState(false)
  const [showStorageDetail, setShowStorageDetail] = useState(false)
  const [showGPUDetail, setShowGPUDetail] = useState(false)

  // Filter GPU nodes to only those belonging to this cluster (using deduplicated nodes)
  const clusterGPUs = deduplicatedGpuNodes.filter(n => {
    const primaryClusterName = clusterInfo?.name || clusterName
    return n.cluster === primaryClusterName ||
           n.cluster === clusterName ||
           n.cluster.includes(primaryClusterName.split('/')[0])
  })
  const clusterDeploymentIssues = deploymentIssues.filter(d => d.cluster === clusterName || d.cluster?.includes(clusterName.split('/')[0]))
  const promptMemorySummary = formatMemoryPromptStat(health?.memoryGB)
  const totalClusterGpus = clusterGPUs.reduce((sum, node) => sum + node.gpuCount, 0)

  // AI diagnose/repair/ask handlers
  const handleDiagnose = () => {
    emitClusterAction('diagnose', clusterName)
    onClose()
    startMission({
      title: t('cluster.diagnoseMissionTitle', { cluster: clusterName.split('/').pop() }),
      description: t('cluster.diagnoseMissionDescription'),
      type: 'troubleshoot',
      cluster: clusterName,
      initialPrompt: buildDiagnosePrompt({
        clusterName, health, promptMemorySummary,
        totalGpuCount: totalClusterGpus, podIssues,
        deploymentIssues: clusterDeploymentIssues,
      }),
      context: {
        clusterName, health,
        podIssuesCount: podIssues.length,
        deploymentIssuesCount: clusterDeploymentIssues.length }
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
        clusterName, podIssues,
        deploymentIssues: clusterDeploymentIssues,
      }),
      context: {
        clusterName,
        podIssues: podIssues.slice(0, 10),
        deploymentIssues: clusterDeploymentIssues.slice(0, 10) }
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
      context: { clusterName, health }
    })
  }

  // Determine cluster status
  const isUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false
  const isHealthy = clusterInfo ? isClusterHealthy(clusterInfo) : (!isLoading && health?.healthy !== false)
  
  // Effective loading state: override to false after timeout
  const effectiveLoading = forceShowContent ? false : isLoading
  const aliasList = clusterInfo?.aliases || []
  const serverAddress = clusterInfo?.server || health?.apiServer
  const headerAliasSummary = aliasList.length <= MAX_HEADER_ALIASES
    ? aliasList.map(alias => alias.split('/').pop() || alias).join(', ')
    : `${aliasList.slice(0, MAX_HEADER_ALIASES).map(alias => alias.split('/').pop() || alias).join(', ')} ${t('cluster.andMoreClusters', { count: aliasList.length - MAX_HEADER_ALIASES })}`

  // Group GPUs by type for summary
  const gpuByType = (() => {
    const map: Record<string, { total: number; allocated: number; nodes: typeof clusterGPUs }> = {}
    clusterGPUs.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) { map[type] = { total: 0, allocated: 0, nodes: [] } }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes.push(node)
    })
    return map
  })()

  // Retain last non-empty GPU data so the section doesn't vanish during refetch (#8597).
  const isGpuTransient = gpuLoading || gpuRefreshing
  const lastGpuDataRef = useRef<{ clusterGPUs: typeof clusterGPUs; gpuByType: typeof gpuByType }>({ clusterGPUs: [], gpuByType: {} })
  if (clusterGPUs.length > 0) {
    lastGpuDataRef.current = { clusterGPUs, gpuByType }
  } else if (!isGpuTransient) {
    lastGpuDataRef.current = { clusterGPUs: [], gpuByType: {} }
  }
  const stableClusterGPUs = clusterGPUs.length > 0 ? clusterGPUs : lastGpuDataRef.current.clusterGPUs
  const stableGpuByType = clusterGPUs.length > 0 ? gpuByType : lastGpuDataRef.current.gpuByType

  return (
    <BaseModal isOpen={true} onClose={onClose} size="xl" closeOnBackdrop={false}>
      <div className="p-6 h-[90vh] overflow-y-auto">
        <ClusterDetailHeader
          clusterName={clusterName}
          clusterUser={clusterUser}
          clusterInfo={clusterInfo}
          health={health}
          healthError={healthError}
          isUnreachable={isUnreachable}
          isHealthy={isHealthy}
          aliasList={aliasList}
          serverAddress={serverAddress}
          headerAliasSummary={headerAliasSummary}
          onClose={onClose}
          onRename={onRename}
          onRemove={onRemove}
          handleDiagnose={handleDiagnose}
          handleRepair={handleRepair}
          handleAsk={handleAsk}
          podIssues={podIssues}
          clusterDeploymentIssues={clusterDeploymentIssues}
        />
        <ClusterDetailStats
          isUnreachable={isUnreachable}
          effectiveLoading={effectiveLoading}
          health={health}
          showNodeDetails={showNodeDetails}
          setShowNodeDetails={setShowNodeDetails}
          showPodsByNamespace={showPodsByNamespace}
          setShowPodsByNamespace={setShowPodsByNamespace}
          stableClusterGPUs={stableClusterGPUs}
          setShowGPUDetail={setShowGPUDetail}
          setShowCPUDetail={setShowCPUDetail}
          setShowMemoryDetail={setShowMemoryDetail}
          setShowStorageDetail={setShowStorageDetail}
          namespaceStats={namespaceStats}
          clusterDeployments={clusterDeployments}
        />
        <ClusterDetailSections
          isUnreachable={isUnreachable}
          showPodsByNamespace={showPodsByNamespace}
          showAllNamespaces={showAllNamespaces}
          setShowAllNamespaces={setShowAllNamespaces}
          expandedNamespace={expandedNamespace}
          setExpandedNamespace={setExpandedNamespace}
          namespaceStats={namespaceStats}
          nsLoading={nsLoading}
          podIssues={podIssues}
          clusterDeploymentIssues={clusterDeploymentIssues}
          stableClusterGPUs={stableClusterGPUs}
          stableGpuByType={stableGpuByType}
          showNodeDetails={showNodeDetails}
          clusterNodes={clusterNodes}
          expandedNodes={expandedNodes}
          setExpandedNodes={setExpandedNodes}
          nodesLoading={nodesLoading}
          clusterName={clusterName}
          drillToPod={drillToPod}
          drillToDeployment={drillToDeployment}
          onClose={onClose}
        />
      </div>

      {/* Resource Detail Modals */}
      {showCPUDetail && (
        <CPUDetailModal
          clusterName={clusterName}
          totalCores={health?.cpuCores || 0}
          allocatableCores={health?.cpuCores || 0}
          requestedCores={health?.cpuRequestsCores || health?.cpuUsageCores || 0}
          nodes={clusterNodes.map(n => ({
            name: n.name,
            cpuCapacity: parseInt(n.cpuCapacity) || 0,
            cpuAllocatable: parseInt(n.cpuCapacity) || 0 }))}
          isLoading={nodesLoading}
          onClose={() => setShowCPUDetail(false)}
        />
      )}

      {showMemoryDetail && (
        <MemoryDetailModal
          clusterName={clusterName}
          totalMemoryGB={health?.memoryGB || 0}
          allocatableMemoryGB={health?.memoryGB || 0}
          requestedMemoryGB={health?.memoryRequestsGB || health?.memoryUsageGB || 0}
          nodes={clusterNodes.map(n => {
            const memStr = n.memoryCapacity || '0'
            let memGB = 0
            if (memStr.endsWith('Gi')) {
              memGB = parseFloat(memStr.replace('Gi', ''))
            } else if (memStr.endsWith('Mi')) {
              memGB = parseFloat(memStr.replace('Mi', '')) / 1024
            } else if (memStr.endsWith('Ki')) {
              memGB = parseFloat(memStr.replace('Ki', '')) / (1024 * 1024)
            }
            return { name: n.name, memoryCapacityGB: memGB, memoryAllocatableGB: memGB }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowMemoryDetail(false)}
        />
      )}

      {showStorageDetail && (
        <StorageDetailModal
          clusterName={clusterName}
          totalStorageGB={health?.storageGB || 0}
          allocatableStorageGB={health?.storageGB || 0}
          nodes={clusterNodes.map(n => {
            const storageStr = n.storageCapacity || '0'
            let storageGB = 0
            if (storageStr.endsWith('Gi')) {
              storageGB = parseFloat(storageStr.replace('Gi', ''))
            } else if (storageStr.endsWith('Mi')) {
              storageGB = parseFloat(storageStr.replace('Mi', '')) / 1024
            } else if (storageStr.endsWith('Ti')) {
              storageGB = parseFloat(storageStr.replace('Ti', '')) * 1024
            }
            return { name: n.name, ephemeralStorageGB: storageGB }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowStorageDetail(false)}
        />
      )}

      {showGPUDetail && (
        <GPUDetailModal
          clusterName={clusterName}
          gpuNodes={stableClusterGPUs.map(n => ({
            name: n.name,
            gpuType: n.gpuType || 'Unknown',
            gpuCount: n.gpuCount,
            gpuAllocated: n.gpuAllocated }))}
          isLoading={effectiveLoading}
          onClose={() => setShowGPUDetail(false)}
        />
      )}
    </BaseModal>
  )
}
