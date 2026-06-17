import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Cpu, Database, MemoryStick } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BaseModal } from '../../lib/modals'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaceStats, useDeployments, useClusters } from '../../hooks/useMCP'
import { isClusterUnreachable, isClusterHealthy } from './utils'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { emitClusterAction } from '../../lib/analytics'
import { formatMemoryPromptStat } from '../../lib/formatStats'
import { buildDiagnosePrompt, buildRepairPrompt } from './diagnosePrompt'
import { ClusterDetailModalHeader } from './ClusterDetailModalHeader'
import { ClusterDetailModalContent } from './ClusterDetailModalContent'

const MAX_INITIAL_LOADING_MS = 10_000

interface ClusterDetailModalProps {
  clusterName: string
  clusterUser?: string
  onClose: () => void
  onRename?: (clusterName: string) => void
  onRemove?: (clusterName: string) => void
}

export function ClusterDetailModal({ clusterName, clusterUser, onClose, onRename, onRemove }: ClusterDetailModalProps) {
  const { t } = useTranslation()
  const { deduplicatedClusters, clusters: rawClusters } = useClusters()
  const clusterInfo = useMemo(() => {
    const foundCluster = deduplicatedClusters.find(cluster => cluster.name === clusterName || cluster.aliases?.includes(clusterName))
    if (foundCluster) return foundCluster
    return rawClusters.find(cluster => cluster.name === clusterName)
  }, [clusterName, deduplicatedClusters, rawClusters])

  const isKnownUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false

  const { health, isLoading, error: healthError } = useClusterHealth(clusterName)
  const { issues: podIssues } = usePodIssues(isKnownUnreachable ? undefined : clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(isKnownUnreachable ? undefined : clusterName)
  const { nodes: gpuNodes, isLoading: gpuLoading, isRefreshing: gpuRefreshing } = useGPUNodes(isKnownUnreachable ? undefined : clusterName)
  const { nodes: clusterNodes, isLoading: nodesLoading } = useNodes(isKnownUnreachable ? undefined : clusterName)
  const { stats: namespaceStats, isLoading: nsLoading } = useNamespaceStats(isKnownUnreachable ? undefined : clusterName)
  const { deployments: clusterDeployments } = useDeployments(isKnownUnreachable ? undefined : clusterName)
  const { drillToPod, drillToDeployment } = useDrillDownActions()
  const { startMission } = useMissions()

  const [forceShowContent, setForceShowContent] = useState(false)
  useEffect(() => {
    const timeout = setTimeout(() => {
      setForceShowContent(true)
    }, MAX_INITIAL_LOADING_MS)
    return () => clearTimeout(timeout)
  }, [clusterName])

  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach(cluster => {
      map[cluster.name] = cluster.name
      cluster.aliases?.forEach(alias => {
        map[alias] = cluster.name
      })
    })
    return map
  }, [deduplicatedClusters])

  const deduplicatedGpuNodes = useMemo(() => {
    const seenNodes = new Map<string, typeof gpuNodes[0]>()
    gpuNodes.forEach(node => {
      if (!seenNodes.has(node.name)) {
        const mappedCluster = clusterNameMap[node.cluster] || node.cluster
        seenNodes.set(node.name, { ...node, cluster: mappedCluster })
      }
    })
    return Array.from(seenNodes.values())
  }, [clusterNameMap, gpuNodes])

  const [showAllNamespaces, setShowAllNamespaces] = useState(false)
  const [showPodsByNamespace, setShowPodsByNamespace] = useState(false)
  const [showNodeDetails, setShowNodeDetails] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandedNamespace, setExpandedNamespace] = useState<string | null>(null)
  const [showCPUDetail, setShowCPUDetail] = useState(false)
  const [showMemoryDetail, setShowMemoryDetail] = useState(false)
  const [showStorageDetail, setShowStorageDetail] = useState(false)
  const [showGPUDetail, setShowGPUDetail] = useState(false)

  const clusterGPUs = useMemo(() => {
    const primaryClusterName = clusterInfo?.name || clusterName
    const clusterPrefix = primaryClusterName.split('/')[0]
    return deduplicatedGpuNodes.filter(node => (
      node.cluster === primaryClusterName ||
      node.cluster === clusterName ||
      node.cluster.includes(clusterPrefix)
    ))
  }, [clusterInfo?.name, clusterName, deduplicatedGpuNodes])

  const clusterDeploymentIssues = useMemo(
    () => deploymentIssues.filter(issue => issue.cluster === clusterName || issue.cluster?.includes(clusterName.split('/')[0])),
    [clusterName, deploymentIssues],
  )
  const promptMemorySummary = formatMemoryPromptStat(health?.memoryGB)
  const totalClusterGpus = clusterGPUs.reduce((sum, node) => sum + node.gpuCount, 0)

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

  const isUnreachable = clusterInfo ? isClusterUnreachable(clusterInfo) : false
  const isHealthy = clusterInfo ? isClusterHealthy(clusterInfo) : (!isLoading && health?.healthy !== false)
  const effectiveLoading = forceShowContent ? false : isLoading
  const aliasList = clusterInfo?.aliases || []
  const serverAddress = clusterInfo?.server || health?.apiServer

  const gpuByType = useMemo(() => {
    const map: Record<string, { total: number; allocated: number; nodes: typeof clusterGPUs }> = {}
    clusterGPUs.forEach(node => {
      const type = node.gpuType || 'Unknown'
      if (!map[type]) {
        map[type] = { total: 0, allocated: 0, nodes: [] }
      }
      map[type].total += node.gpuCount
      map[type].allocated += node.gpuAllocated
      map[type].nodes.push(node)
    })
    return map
  }, [clusterGPUs])

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
        <ClusterDetailModalHeader
          aliasList={aliasList}
          clusterInfo={clusterInfo}
          clusterName={clusterName}
          clusterUser={clusterUser}
          health={health}
          isHealthy={isHealthy}
          isUnreachable={isUnreachable}
          onClose={onClose}
          onRemove={onRemove}
          onRename={onRename}
          serverAddress={serverAddress}
        />

        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => !isUnreachable && !effectiveLoading && setShowNodeDetails(!showNodeDetails)}
            disabled={isUnreachable || effectiveLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading ? 'border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer' : 'border-border cursor-default'
            } ${showNodeDetails ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10' : ''}`}
            title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewNode') : undefined}
          >
            {effectiveLoading ? (
              <>
                <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="text-sm text-muted-foreground">{t('common.nodes')}</div>
                <div className="h-4 w-16 bg-muted/30 rounded animate-pulse mt-1" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.nodeCount || 0) : '-'}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  {t('clusterDetail.nodes')}
                  {!isUnreachable && <ChevronDown className={`w-4 h-4 transition-transform text-cyan-400 ${showNodeDetails ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />}
                </div>
                <div className="text-xs text-green-400">{!isUnreachable ? `${health?.readyNodes || 0} ${t('clusterDetail.ready')}` : t('clusterDetail.offline')}</div>
                {!isUnreachable && !showNodeDetails && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-cyan-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !effectiveLoading && setShowPodsByNamespace(!showPodsByNamespace)}
            disabled={isUnreachable || effectiveLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer' : 'border-border cursor-default'
            } ${showPodsByNamespace ? 'border-blue-500/50 bg-blue-500/10 shadow-lg shadow-blue-500/10' : ''}`}
            title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewWorkloads') : undefined}
          >
            <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
              {t('clusterDetail.workloads')}
              {!isUnreachable && !effectiveLoading && <ChevronDown className={`w-4 h-4 transition-transform text-blue-400 ${showPodsByNamespace ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />}
            </div>
            {effectiveLoading ? (
              <div className="space-y-1.5">
                <div className="h-4 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 bg-muted/30 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <div className="space-y-0.5 text-xs">
                  {!isUnreachable ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('clusterDetail.namespaces')}</span>
                        <span className="text-foreground font-medium">{namespaceStats.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('common.deployments')}</span>
                        <span className="text-foreground font-medium">{clusterDeployments.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('common.pods')}</span>
                        <span className="text-foreground font-medium">{health?.podCount || 0}</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </div>
                {!isUnreachable && !showPodsByNamespace && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 && setShowGPUDetail(true)}
            disabled={isUnreachable || effectiveLoading || stableClusterGPUs.length === 0}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 ? 'border-border hover:border-yellow-500/50 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !effectiveLoading && stableClusterGPUs.length > 0 ? t('clusterDetail.clickToViewGPU') : undefined}
          >
            {effectiveLoading ? (
              <>
                <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse mt-1" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">{!isUnreachable ? stableClusterGPUs.reduce((sum, node) => sum + node.gpuCount, 0) : '-'}</div>
                <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
                <div className="text-xs text-yellow-400">{!isUnreachable ? `${stableClusterGPUs.reduce((sum, node) => sum + node.gpuAllocated, 0)} ${t('clusterDetail.allocated')}` : ''}</div>
                {!isUnreachable && stableClusterGPUs.length > 0 && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-yellow-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => !isUnreachable && !effectiveLoading && setShowCPUDetail(true)}
            disabled={isUnreachable || effectiveLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewCPU') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">{t('common.cpu')}</span>
            </div>
            {effectiveLoading ? (
              <>
                <div className="h-8 w-16 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.cpuCores || 0) : '-'}</div>
                <div className="text-xs text-muted-foreground">{t('clusterDetail.coresAllocatable')}</div>
                {!isUnreachable && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !effectiveLoading && setShowMemoryDetail(true)}
            disabled={isUnreachable || effectiveLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading ? 'border-border hover:border-green-500/50 hover:bg-green-500/5 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewMemory') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <MemoryStick className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">{t('common.memory')}</span>
            </div>
            {effectiveLoading ? (
              <>
                <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">
                  {!isUnreachable ? (health?.memoryGB ? (health.memoryGB >= 1024 ? `${(health.memoryGB / 1024).toFixed(1)} TB` : `${Math.round(health.memoryGB)} GB`) : '0 GB') : '-'}
                </div>
                <div className="text-xs text-muted-foreground">{t('clusterDetail.allocatable')}</div>
                {!isUnreachable && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-green-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !effectiveLoading && setShowStorageDetail(true)}
            disabled={isUnreachable || effectiveLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !effectiveLoading ? 'border-border hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !effectiveLoading ? t('clusterDetail.clickToViewStorage') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-muted-foreground">{t('common.storage')}</span>
            </div>
            {effectiveLoading ? (
              <>
                <div className="h-8 w-20 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">
                  {!isUnreachable ? (health?.storageGB ? (health.storageGB >= 1024 ? `${(health.storageGB / 1024).toFixed(1)} TB` : `${Math.round(health.storageGB)} GB`) : '0 GB') : '-'}
                </div>
                <div className="text-xs text-muted-foreground">{t('clusterDetail.ephemeral')}</div>
                {!isUnreachable && (
                  <div className="text-2xs text-muted-foreground/50 mt-2 group-hover:text-purple-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
        </div>

        <ClusterDetailModalContent
          clusterDeploymentIssues={clusterDeploymentIssues}
          clusterInfo={clusterInfo}
          clusterName={clusterName}
          clusterNodes={clusterNodes}
          effectiveLoading={effectiveLoading}
          expandedNamespace={expandedNamespace}
          expandedNodes={expandedNodes}
          health={health}
          healthError={healthError}
          isUnreachable={isUnreachable}
          nodesLoading={nodesLoading}
          nsLoading={nsLoading}
          namespaceStats={namespaceStats}
          onAsk={handleAsk}
          onClose={onClose}
          onDiagnose={handleDiagnose}
          onDrillToDeployment={drillToDeployment}
          onDrillToPod={drillToPod}
          onRemove={onRemove}
          onRepair={handleRepair}
          podIssues={podIssues}
          setExpandedNamespace={setExpandedNamespace}
          setExpandedNodes={setExpandedNodes}
          setShowAllNamespaces={setShowAllNamespaces}
          setShowCPUDetail={setShowCPUDetail}
          setShowGPUDetail={setShowGPUDetail}
          setShowMemoryDetail={setShowMemoryDetail}
          setShowStorageDetail={setShowStorageDetail}
          showAllNamespaces={showAllNamespaces}
          showCPUDetail={showCPUDetail}
          showGPUDetail={showGPUDetail}
          showMemoryDetail={showMemoryDetail}
          showNodeDetails={showNodeDetails}
          showPodsByNamespace={showPodsByNamespace}
          showStorageDetail={showStorageDetail}
          stableClusterGPUs={stableClusterGPUs}
          stableGpuByType={stableGpuByType}
        />
      </div>
    </BaseModal>
  )
}
