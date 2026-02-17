import { useState, useMemo } from 'react'
import { X, CheckCircle, AlertTriangle, WifiOff, Pencil, ChevronRight, ChevronDown, Layers, Server, Network, HardDrive, Box, FolderOpen, Loader2, Cpu, MemoryStick, Database, Wand2, Stethoscope, Wrench, Bot, ExternalLink } from 'lucide-react'
import { BaseModal } from '../../lib/modals'
import { useClusterHealth, usePodIssues, useDeploymentIssues, useGPUNodes, useNodes, useNamespaceStats, useDeployments, useClusters } from '../../hooks/useMCP'
import { useDrillDownActions } from '../../hooks/useDrillDown'
import { useMissions } from '../../hooks/useMissions'
import { Gauge } from '../charts/Gauge'
import { NodeListItem } from './NodeListItem'
import { NodeDetailPanel } from './NodeDetailPanel'
import { NamespaceResources } from './components'
import { CPUDetailModal, MemoryDetailModal, StorageDetailModal, GPUDetailModal } from './ResourceDetailModals'
import { CloudProviderIcon, detectCloudProvider as detectCloudProviderShared, getProviderLabel, CloudProvider as CloudProviderType } from '../ui/CloudProviderIcon'
import { useTranslation } from 'react-i18next'

// Cloud provider types
type CloudProvider = 'eks' | 'gke' | 'aks' | 'openshift' | 'oci' | 'alibaba' | 'digitalocean' | 'rancher' | 'coreweave' | 'kind' | 'minikube' | 'k3s' | 'unknown'

// Get console URL for a specific provider
function getConsoleUrlForProvider(provider: string, clusterName: string, apiServerUrl?: string): string | null {
  const serverUrl = apiServerUrl?.toLowerCase() || ''

  switch (provider) {
    case 'openshift': {
      // OpenShift: api.xxx -> console-openshift-console.apps.xxx
      // Handle URLs with or without protocol prefix
      const apiMatch = apiServerUrl?.match(/(?:https?:\/\/)?api\.([^:\/]+)/)
      if (apiMatch) {
        return `https://console-openshift-console.apps.${apiMatch[1]}`
      }
      return null
    }
    case 'eks': {
      const urlRegionMatch = serverUrl.match(/\.([a-z]{2}-[a-z]+-\d)\.eks\.amazonaws\.com/)
      const nameRegionMatch = clusterName.match(/(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central|northeast|southeast)-\d/)
      const region = urlRegionMatch?.[1] || nameRegionMatch?.[0] || 'us-east-1'
      const shortName = clusterName.split('/').pop() || clusterName
      return `https://${region}.console.aws.amazon.com/eks/home?region=${region}#/clusters/${shortName}`
    }
    case 'gke': {
      const gkeMatch = clusterName.match(/gke_([^_]+)_([^_]+)_(.+)/)
      if (gkeMatch) {
        const [, project, location, gkeName] = gkeMatch
        return `https://console.cloud.google.com/kubernetes/clusters/details/${location}/${gkeName}?project=${project}`
      }
      return 'https://console.cloud.google.com/kubernetes/list/overview'
    }
    case 'aks':
      return 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.ContainerService%2FmanagedClusters'
    case 'oci': {
      const regionMatch = serverUrl.match(/\.([a-z]+-[a-z]+-\d)\.clusters\.oci/)
      const region = regionMatch?.[1] || 'us-ashburn-1'
      return `https://cloud.oracle.com/containers/clusters?region=${region}`
    }
    case 'alibaba':
      return 'https://cs.console.aliyun.com/#/k8s/cluster/list'
    case 'digitalocean':
      return 'https://cloud.digitalocean.com/kubernetes/clusters'
    case 'coreweave':
      return 'https://cloud.coreweave.com/kubernetes'
    default:
      return null
  }
}

function getProviderInfo(provider: CloudProvider): { color: string; bgColor: string } {
  switch (provider) {
    case 'eks': return { color: 'text-orange-400', bgColor: 'bg-orange-500/20' }
    case 'gke': return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'aks': return { color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' }
    case 'openshift': return { color: 'text-red-400', bgColor: 'bg-red-500/20' }
    case 'oci': return { color: 'text-red-500', bgColor: 'bg-red-500/20' }
    case 'alibaba': return { color: 'text-orange-300', bgColor: 'bg-orange-500/20' }
    case 'digitalocean': return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
    case 'rancher': return { color: 'text-green-400', bgColor: 'bg-green-500/20' }
    case 'coreweave': return { color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' }
    case 'kind': return { color: 'text-blue-300', bgColor: 'bg-blue-500/20' }
    case 'minikube': return { color: 'text-purple-400', bgColor: 'bg-purple-500/20' }
    case 'k3s': return { color: 'text-green-300', bgColor: 'bg-green-500/20' }
    default: return { color: 'text-blue-400', bgColor: 'bg-blue-500/20' }
  }
}

interface ClusterDetailModalProps {
  clusterName: string
  clusterUser?: string  // Optional kubeconfig user for provider detection
  onClose: () => void
  onRename?: (clusterName: string) => void
}

export function ClusterDetailModal({ clusterName, clusterUser, onClose, onRename }: ClusterDetailModalProps) {
  const { t } = useTranslation()
  const { health, isLoading } = useClusterHealth(clusterName)
  const { deduplicatedClusters, clusters: rawClusters } = useClusters()
  const { issues: podIssues } = usePodIssues(clusterName)
  const { issues: deploymentIssues } = useDeploymentIssues(clusterName)
  const { nodes: gpuNodes } = useGPUNodes(clusterName)
  const { nodes: clusterNodes, isLoading: nodesLoading } = useNodes(clusterName)
  const { stats: namespaceStats, isLoading: nsLoading } = useNamespaceStats(clusterName)
  const { deployments: clusterDeployments } = useDeployments(clusterName)
  const { drillToPod } = useDrillDownActions()
  const { startMission } = useMissions()

  // Get cached cluster info for distribution detection
  // First try deduplicated clusters, then raw clusters, also check aliases
  const clusterInfo = useMemo(() => {
    // Direct match in deduplicated clusters
    let found = deduplicatedClusters.find(c => c.name === clusterName)
    if (found) return found
    // Check if clusterName is an alias
    found = deduplicatedClusters.find(c => c.aliases?.includes(clusterName))
    if (found) return found
    // Fallback to raw clusters
    return rawClusters.find(c => c.name === clusterName)
  }, [deduplicatedClusters, rawClusters, clusterName])

  // Build a map of raw cluster names to deduplicated primary names for GPU deduplication
  const clusterNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    deduplicatedClusters.forEach(c => {
      map[c.name] = c.name // Primary maps to itself
      c.aliases?.forEach(alias => {
        map[alias] = c.name // Aliases map to primary
      })
    })
    return map
  }, [deduplicatedClusters])

  // Deduplicate GPU nodes by name to avoid counting same physical node twice
  const deduplicatedGpuNodes = useMemo(() => {
    const seenNodes = new Map<string, typeof gpuNodes[0]>()
    gpuNodes.forEach(node => {
      const nodeKey = node.name
      if (!seenNodes.has(nodeKey)) {
        // Map the cluster name to the primary name
        const mappedCluster = clusterNameMap[node.cluster] || node.cluster
        seenNodes.set(nodeKey, { ...node, cluster: mappedCluster })
      }
    })
    return Array.from(seenNodes.values())
  }, [gpuNodes, clusterNameMap])

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

  // AI diagnose/repair handlers
  const handleDiagnose = () => {
    const issuesSummary = [
      ...podIssues.map(p => `Pod ${p.name} in ${p.namespace}: ${p.status}`),
      ...clusterDeploymentIssues.map(d => `Deployment ${d.name} in ${d.namespace}: ${d.readyReplicas}/${d.replicas} ready`)
    ].slice(0, 10).join('\n')

    startMission({
      title: `Diagnose ${clusterName.split('/').pop()}`,
      description: `Analyzing cluster health and identifying issues`,
      type: 'troubleshoot',
      cluster: clusterName,
      initialPrompt: `Analyze the health of Kubernetes cluster "${clusterName}" and identify any issues that need attention.

Current cluster state:
- Nodes: ${health?.nodeCount || 0} total, ${health?.readyNodes || 0} ready
- Pods: ${health?.podCount || 0} total
- CPU: ${health?.cpuCores || 0} cores
- Memory: ${health?.memoryGB || 0} GB
- GPUs: ${clusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0)} total

Known issues (${podIssues.length + clusterDeploymentIssues.length} total):
${issuesSummary || 'No known issues'}

Please analyze this cluster and provide:
1. Health assessment summary
2. Identified issues and their severity
3. Recommended actions to resolve issues
4. Preventive measures to avoid future problems`,
      context: {
        clusterName,
        health,
        podIssuesCount: podIssues.length,
        deploymentIssuesCount: clusterDeploymentIssues.length,
      }
    })
    onClose()
  }

  const handleRepair = () => {
    const issuesList = [
      ...podIssues.slice(0, 5).map(p => `- Pod "${p.name}" in namespace "${p.namespace}": ${p.status} (${p.restarts} restarts)`),
      ...clusterDeploymentIssues.slice(0, 5).map(d => `- Deployment "${d.name}" in namespace "${d.namespace}": ${d.readyReplicas}/${d.replicas} ready - ${d.reason || 'Unknown reason'}`)
    ].join('\n')

    startMission({
      title: `Repair ${clusterName.split('/').pop()}`,
      description: `Automatically fixing cluster issues`,
      type: 'repair',
      cluster: clusterName,
      initialPrompt: `I need help repairing issues in Kubernetes cluster "${clusterName}".

Current issues that need to be fixed:
${issuesList}

For each issue, please:
1. Diagnose the root cause
2. Suggest a fix with the exact kubectl commands needed
3. Explain what each command does
4. Warn about any potential side effects

After I approve, help me execute the repairs step by step.`,
      context: {
        clusterName,
        podIssues: podIssues.slice(0, 10),
        deploymentIssues: clusterDeploymentIssues.slice(0, 10),
      }
    })
    onClose()
  }

  // Determine cluster status - use same logic as utils.ts
  // Only mark as unreachable when we have confirmed unreachable status, not when loading
  const isUnreachable = health ? (
    health.reachable === false ||
    (health.errorType && ['timeout', 'network', 'certificate'].includes(health.errorType)) ||
    health.nodeCount === 0
  ) : false
  const isHealthy = !isLoading && !isUnreachable && health?.healthy !== false

  // Group GPUs by type for summary
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

  // Show modal immediately with loading state for data - don't block on isLoading
  return (
    <BaseModal isOpen={true} onClose={onClose} size="xl">
      <div className="p-6 h-[90vh] overflow-y-auto">
        {/* Header with status icons */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {isUnreachable ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/20 text-yellow-400" title={t('clusterDetail.offlineStatus')}>
                <WifiOff className="w-4 h-4" />
              </span>
            ) : isHealthy ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/20 text-green-400" title={t('clusterDetail.healthy')}>
                <CheckCircle className="w-4 h-4" />
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/20 text-red-400" title={t('clusterDetail.unhealthy')}>
                <AlertTriangle className="w-4 h-4" />
              </span>
            )}
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold text-foreground">{clusterName.split('/').pop()}</h2>
              {clusterInfo?.aliases && clusterInfo.aliases.length > 0 && (
                <div className="text-xs text-muted-foreground mt-0.5" title={t('clusterDetail.alsoKnownAs', { aliases: clusterInfo.aliases.join(', ') })}>
                  {t('clusterDetail.akaLabel')} {clusterInfo.aliases.length <= 2
                    ? clusterInfo.aliases.map(a => a.split('/').pop()).join(', ')
                    : `${clusterInfo.aliases.slice(0, 2).map(a => a.split('/').pop()).join(', ')} +${clusterInfo.aliases.length - 2} more`
                  }
                </div>
              )}
            </div>
            {(() => {
              // Use cached distribution if available, otherwise detect from name/server
              // Prefer clusterInfo.server over health.apiServer since it's more reliably populated
              const serverUrl = clusterInfo?.server || health?.apiServer
              const detectedProvider = clusterInfo?.distribution as CloudProviderType ||
                detectCloudProviderShared(clusterName, serverUrl, clusterInfo?.namespaces, clusterUser)
              // Get console URL based on detected provider
              const consoleUrl = getConsoleUrlForProvider(detectedProvider, clusterName, serverUrl)
              const providerInfo = getProviderInfo(detectedProvider === 'kubernetes' ? 'unknown' : detectedProvider as CloudProvider)
              const providerLabel = getProviderLabel(detectedProvider)
              return (
                <>
                  {consoleUrl ? (
                    <a
                      href={consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color} hover:opacity-80 transition-opacity`}
                      title={t('clusterDetail.openConsole', { provider: providerLabel })}
                    >
                      <CloudProviderIcon provider={detectedProvider} size={16} />
                      {providerLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium ${providerInfo.bgColor} ${providerInfo.color}`}
                      title={providerLabel}
                    >
                      <CloudProviderIcon provider={detectedProvider} size={16} />
                      {providerLabel}
                    </span>
                  )}
                </>
              )
            })()}
            {onRename && (
              <button
                onClick={() => onRename(clusterName)}
                className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                title={t('clusterDetail.renameCluster')}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Actions */}
        <div className="mb-6 p-4 rounded-lg bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium text-foreground">{t('clusterDetail.aiAssistant')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleDiagnose}
              disabled={isUnreachable}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('clusterDetail.diagnoseTitle')}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              {t('clusterDetail.diagnose')}
            </button>
            <button
              onClick={handleRepair}
              disabled={isUnreachable || (podIssues.length === 0 && clusterDeploymentIssues.length === 0)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={podIssues.length === 0 && clusterDeploymentIssues.length === 0 ? t('clusterDetail.noIssuesToRepair') : t('clusterDetail.repairTitle')}
            >
              <Wrench className="w-3.5 h-3.5" />
              {t('clusterDetail.repair')}
              {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-xs">
                  {podIssues.length + clusterDeploymentIssues.length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                startMission({
                  title: `Ask about ${clusterName.split('/').pop()}`,
                  description: 'Custom question about the cluster',
                  type: 'custom',
                  cluster: clusterName,
                  initialPrompt: `I have a question about Kubernetes cluster "${clusterName}". The cluster currently has ${health?.nodeCount || 0} nodes, ${health?.podCount || 0} pods, ${health?.cpuCores || 0} CPU cores, and ${health?.memoryGB || 0} GB memory. How can I help you?`,
                  context: { clusterName, health }
                })
                onClose()
              }}
              disabled={isUnreachable}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('clusterDetail.askTitle')}
            >
              <Wand2 className="w-3.5 h-3.5" />
              {t('clusterDetail.ask')}
            </button>
          </div>
        </div>

        {/* Stats - Interactive Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => !isUnreachable && !isLoading && setShowNodeDetails(!showNodeDetails)}
            disabled={isUnreachable || isLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading ? 'border-border hover:border-cyan-500/50 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer' : 'border-border cursor-default'
            } ${showNodeDetails ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10' : ''}`}
            title={!isUnreachable && !isLoading ? t('clusterDetail.clickToViewNode') : undefined}
          >
            {isLoading ? (
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
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-cyan-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !isLoading && setShowPodsByNamespace(!showPodsByNamespace)}
            disabled={isUnreachable || isLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading ? 'border-border hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:shadow-lg hover:shadow-indigo-500/10 cursor-pointer' : 'border-border cursor-default'
            } ${showPodsByNamespace ? 'border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/10' : ''}`}
            title={!isUnreachable && !isLoading ? t('clusterDetail.clickToViewWorkloads') : undefined}
          >
            <div className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
              {t('clusterDetail.workloads')}
              {!isUnreachable && !isLoading && <ChevronDown className={`w-4 h-4 transition-transform text-indigo-400 ${showPodsByNamespace ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />}
            </div>
            {isLoading ? (
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
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-indigo-400/70 transition-colors">{t('clusterDetail.clickToExpand')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !isLoading && clusterGPUs.length > 0 && setShowGPUDetail(true)}
            disabled={isUnreachable || isLoading || clusterGPUs.length === 0}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading && clusterGPUs.length > 0 ? 'border-border hover:border-yellow-500/50 hover:bg-yellow-500/5 hover:shadow-lg hover:shadow-yellow-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !isLoading && clusterGPUs.length > 0 ? t('clusterDetail.clickToViewGPU') : undefined}
          >
            {isLoading ? (
              <>
                <div className="h-8 w-12 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse mt-1" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">{!isUnreachable ? clusterGPUs.reduce((sum, n) => sum + n.gpuCount, 0) : '-'}</div>
                <div className="text-sm text-muted-foreground">{t('common.gpus')}</div>
                <div className="text-xs text-yellow-400">{!isUnreachable ? `${clusterGPUs.reduce((sum, n) => sum + n.gpuAllocated, 0)} ${t('clusterDetail.allocated')}` : ''}</div>
                {!isUnreachable && clusterGPUs.length > 0 && (
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-yellow-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
        </div>

        {/* Resource Metrics - Clickable cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => !isUnreachable && !isLoading && setShowCPUDetail(true)}
            disabled={isUnreachable || isLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading ? 'border-border hover:border-blue-500/50 hover:bg-blue-500/5 hover:shadow-lg hover:shadow-blue-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !isLoading ? t('clusterDetail.clickToViewCPU') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-muted-foreground">{t('common.cpu')}</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 w-16 bg-muted/30 rounded animate-pulse mb-1" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-foreground">{!isUnreachable ? (health?.cpuCores || 0) : '-'}</div>
                <div className="text-xs text-muted-foreground">{t('clusterDetail.coresAllocatable')}</div>
                {!isUnreachable && (
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-blue-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !isLoading && setShowMemoryDetail(true)}
            disabled={isUnreachable || isLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading ? 'border-border hover:border-green-500/50 hover:bg-green-500/5 hover:shadow-lg hover:shadow-green-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !isLoading ? t('clusterDetail.clickToViewMemory') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <MemoryStick className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">{t('common.memory')}</span>
            </div>
            {isLoading ? (
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
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-green-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
          <button
            onClick={() => !isUnreachable && !isLoading && setShowStorageDetail(true)}
            disabled={isUnreachable || isLoading}
            className={`group p-4 rounded-lg bg-card/50 border text-left transition-all duration-200 ${
              !isUnreachable && !isLoading ? 'border-border hover:border-purple-500/50 hover:bg-purple-500/5 hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer' : 'border-border cursor-default'
            }`}
            title={!isUnreachable && !isLoading ? t('clusterDetail.clickToViewStorage') : undefined}
          >
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-muted-foreground">{t('common.storage')}</span>
            </div>
            {isLoading ? (
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
                  <div className="text-[10px] text-muted-foreground/50 mt-2 group-hover:text-purple-400/70 transition-colors">{t('clusterDetail.clickForDetails')}</div>
                )}
              </>
            )}
          </button>
        </div>

        {/* Pods by Namespace - Expandable with drill-down */}
        {!isUnreachable && showPodsByNamespace && namespaceStats.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              {t('clusterDetail.workloadsCount', { count: namespaceStats.length })}
            </h3>
            <div className="rounded-lg bg-card/50 border border-border overflow-hidden">
              <div className="divide-y divide-border/30">
                {(showAllNamespaces ? namespaceStats : namespaceStats.slice(0, 5)).map((ns) => {
                  const isExpanded = expandedNamespace === ns.name
                  return (
                    <div key={ns.name} className="overflow-hidden">
                      <button
                        onClick={() => setExpandedNamespace(isExpanded ? null : ns.name)}
                        className="w-full p-3 flex items-center justify-between hover:bg-card/30 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-medium"><FolderOpen className="w-3 h-3" />{t('clusterDetail.ns')}</span>
                          <span className="font-mono text-sm text-foreground">{ns.name}</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{t('clusterDetail.podsCount', { count: ns.podCount })}</span>
                          {ns.runningPods > 0 && (
                            <span className="text-green-400">{t('clusterDetail.runningPods', { count: ns.runningPods })}</span>
                          )}
                          {ns.pendingPods > 0 && (
                            <span className="text-yellow-400">{t('clusterDetail.pendingPods', { count: ns.pendingPods })}</span>
                          )}
                          {ns.failedPods > 0 && (
                            <span className="text-red-400">{t('clusterDetail.failedPods', { count: ns.failedPods })}</span>
                          )}
                        </div>
                      </button>
                      {/* Expanded namespace content - shows all resources with tree/list view */}
                      {isExpanded && (
                        <div className="bg-card/20 border-t border-border/20 px-4 py-2">
                          <NamespaceResources
                            clusterName={clusterName}
                            namespace={ns.name}
                            onClose={onClose}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {namespaceStats.length > 5 && (
                <button
                  onClick={() => setShowAllNamespaces(!showAllNamespaces)}
                  className="w-full p-2 text-sm text-primary hover:bg-card/30 transition-colors border-t border-border/30"
                >
                  {showAllNamespaces ? t('clusterDetail.showLess') : t('clusterDetail.showAllNamespaces', { count: namespaceStats.length })}
                </button>
              )}
            </div>
            {nsLoading && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('clusterDetail.loadingNamespaceData')}
              </div>
            )}
          </div>
        )}

        {/* Issues Section */}
        {(podIssues.length > 0 || clusterDeploymentIssues.length > 0) && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              {t('clusterDetail.issuesCount', { count: podIssues.length + clusterDeploymentIssues.length })}
            </h3>
            <div className="space-y-2">
              {podIssues.slice(0, 5).map((issue, i) => (
                <div
                  key={`pod-${i}`}
                  onClick={() => {
                    drillToPod(clusterName, issue.namespace, issue.name, {
                      status: issue.status,
                      restarts: issue.restarts,
                      issues: issue.issues,
                      reason: issue.reason,
                    })
                    onClose()
                  }}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium flex-shrink-0">
                        <Box className="w-3 h-3" />{t('clusterDetail.pod')}
                      </span>
                      <span className="font-medium text-foreground truncate">{issue.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">({issue.namespace})</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">{issue.status}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  {issue.restarts > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground pl-14">{t('clusterDetail.restarts', { count: issue.restarts })}</div>
                  )}
                </div>
              ))}
              {clusterDeploymentIssues.slice(0, 3).map((issue, i) => (
                <div
                  key={`dep-${i}`}
                  className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium flex-shrink-0">
                        <Layers className="w-3 h-3" />{t('clusterDetail.deploy')}
                      </span>
                      <span className="font-medium text-foreground truncate">{issue.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">({issue.namespace})</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
                        {issue.readyReplicas}/{issue.replicas} ready
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                  {issue.message && (
                    <div className="mt-1 text-xs text-red-400 pl-16 truncate">{issue.message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GPU Section */}
        {clusterGPUs.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              {t('clusterDetail.gpusByType')}
            </h3>
            <div className="space-y-4">
              {Object.entries(gpuByType).map(([type, info]) => (
                <div key={type} className="rounded-lg bg-card/50 border border-border overflow-hidden">
                  <div className="p-3 border-b border-border/50 bg-purple-500/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{type}</span>
                        <span className="text-xs text-muted-foreground">({t('clusterDetail.nodeCount', { count: info.nodes.length })})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-24">
                          <Gauge value={info.allocated} max={info.total} size="sm" unit="" />
                        </div>
                        <span className="text-sm text-muted-foreground">{info.allocated}/{info.total} {t('clusterDetail.allocated')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30">
                    {info.nodes.map((node, i) => (
                      <div key={i} className="p-3 flex items-center justify-between hover:bg-card/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <Network className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm text-foreground">{node.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-16">
                            <Gauge value={node.gpuAllocated} max={node.gpuCount} size="sm" unit="" />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {node.gpuAllocated}/{node.gpuCount}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Node Details */}
        {!isUnreachable && showNodeDetails && clusterNodes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              {t('clusterDetail.nodesCount', { count: clusterNodes.length })}
            </h3>
            <div className="space-y-2">
              {clusterNodes.map((node) => {
                const isExpanded = expandedNodes.has(node.name)
                return (
                  <div key={node.name}>
                    <div className={`rounded-lg border overflow-hidden ${isExpanded ? 'border-cyan-500/30' : 'border-border/30'}`}>
                      <NodeListItem
                        node={node}
                        isSelected={isExpanded}
                        onClick={() => {
                          setExpandedNodes(prev => {
                            const next = new Set(prev)
                            if (next.has(node.name)) next.delete(node.name)
                            else next.add(node.name)
                            return next
                          })
                        }}
                      />
                    </div>
                    {/* Inline expanded details */}
                    {isExpanded && (
                      <NodeDetailPanel
                        node={node}
                        clusterName={clusterName}
                        onClose={() => setExpandedNodes(prev => { const next = new Set(prev); next.delete(node.name); return next })}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            {nodesLoading && (
              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('clusterDetail.loadingNodeDetails')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resource Detail Modals */}
      {showCPUDetail && (
        <CPUDetailModal
          clusterName={clusterName}
          totalCores={health?.cpuCores || 0}
          allocatableCores={health?.cpuCores || 0}
          nodes={clusterNodes.map(n => ({
            name: n.name,
            cpuCapacity: parseInt(n.cpuCapacity) || 0,
            cpuAllocatable: parseInt(n.cpuCapacity) || 0, // Use capacity as allocatable estimate
          }))}
          isLoading={nodesLoading}
          onClose={() => setShowCPUDetail(false)}
        />
      )}

      {showMemoryDetail && (
        <MemoryDetailModal
          clusterName={clusterName}
          totalMemoryGB={health?.memoryGB || 0}
          allocatableMemoryGB={health?.memoryGB || 0}
          nodes={clusterNodes.map(n => {
            // Parse memory string like "16Gi" or "16384Mi"
            const memStr = n.memoryCapacity || '0'
            let memGB = 0
            if (memStr.endsWith('Gi')) {
              memGB = parseFloat(memStr.replace('Gi', ''))
            } else if (memStr.endsWith('Mi')) {
              memGB = parseFloat(memStr.replace('Mi', '')) / 1024
            } else if (memStr.endsWith('Ki')) {
              memGB = parseFloat(memStr.replace('Ki', '')) / (1024 * 1024)
            }
            return {
              name: n.name,
              memoryCapacityGB: memGB,
              memoryAllocatableGB: memGB, // Use capacity as allocatable estimate
            }
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
            // Parse storage string like "100Gi" or "102400Mi"
            const storageStr = n.storageCapacity || '0'
            let storageGB = 0
            if (storageStr.endsWith('Gi')) {
              storageGB = parseFloat(storageStr.replace('Gi', ''))
            } else if (storageStr.endsWith('Mi')) {
              storageGB = parseFloat(storageStr.replace('Mi', '')) / 1024
            } else if (storageStr.endsWith('Ti')) {
              storageGB = parseFloat(storageStr.replace('Ti', '')) * 1024
            }
            return {
              name: n.name,
              ephemeralStorageGB: storageGB,
            }
          })}
          isLoading={nodesLoading}
          onClose={() => setShowStorageDetail(false)}
        />
      )}

      {showGPUDetail && (
        <GPUDetailModal
          clusterName={clusterName}
          gpuNodes={clusterGPUs.map(n => ({
            name: n.name,
            gpuType: n.gpuType || 'Unknown',
            gpuCount: n.gpuCount,
            gpuAllocated: n.gpuAllocated,
          }))}
          isLoading={isLoading}
          onClose={() => setShowGPUDetail(false)}
        />
      )}
    </BaseModal>
  )
}
