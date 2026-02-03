import { useMemo, useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { getDemoMode } from '../../../hooks/useDemoMode'
import { useMissions } from '../../../hooks/useMissions'
import { useGPUNodes } from '../../../hooks/useMCP'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useReportCardDataState } from '../CardDataContext'

// Card 4: Offline Detection - Detect offline nodes and unavailable GPUs
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { nodes: gpuNodes, isLoading } = useGPUNodes()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  // hasData should be true once loading completes (even with empty data)
  const hasData = !isLoading || gpuNodes.length > 0

  // Report state to CardWrapper for refresh animation
  useReportCardDataState({
    isFailed: false,
    consecutiveFailures: 0,
    isLoading: isLoading && gpuNodes.length === 0,
    isRefreshing: isLoading && gpuNodes.length > 0,
    hasData,
  })

  // Get all nodes from direct API fetch
  const [allNodes, setAllNodes] = useState<Array<{ name: string; cluster?: string; status: string; roles: string[]; unschedulable?: boolean }>>([])
  const [, setNodesLoading] = useState(true)

  // Fetch nodes from local agent (no auth required)
  useEffect(() => {
    // Skip agent requests in demo mode (no local agent on Netlify)
    if (getDemoMode()) {
      setNodesLoading(false)
      return
    }

    const fetchNodes = async () => {
      setNodesLoading(true)
      try {
        // Use local agent directly - works without auth
        const response = await fetch('http://127.0.0.1:8585/nodes')

        if (response.ok) {
          const data = await response.json()
          setAllNodes(data.nodes || [])
        }
      } catch (error) {
        console.error('[OfflineDetection] Error fetching nodes:', error)
      } finally {
        setNodesLoading(false)
      }
    }

    fetchNodes()
    // Poll every 30 seconds
    const interval = setInterval(fetchNodes, 30000)
    return () => clearInterval(interval)
  }, [])

  // Filter nodes by global cluster filter
  const nodes = useMemo(() => {
    let result = allNodes

    // Apply global cluster filter
    if (!isAllClustersSelected) {
      result = result.filter(n => !n.cluster || selectedClusters.includes(n.cluster))
    }

    // Apply global custom text filter
    if (customFilter.trim()) {
      const query = customFilter.toLowerCase()
      result = result.filter(n =>
        n.name.toLowerCase().includes(query) ||
        (n.cluster?.toLowerCase() || '').includes(query)
      )
    }

    return result
  }, [allNodes, selectedClusters, isAllClustersSelected, customFilter])

  // Detect any node that is not fully Ready (NotReady, Unknown, SchedulingDisabled, Cordoned, etc.)
  // Deduplicate by node name, preferring short cluster names
  const offlineNodes = useMemo(() => {
    const unhealthy = nodes.filter(n =>
      n.status !== 'Ready' || n.unschedulable === true
    )
    // Deduplicate by node name, keep entry with shortest cluster name
    const byName = new Map<string, typeof unhealthy[0]>()
    unhealthy.forEach(n => {
      const existing = byName.get(n.name)
      if (!existing || (n.cluster?.length || 999) < (existing.cluster?.length || 999)) {
        byName.set(n.name, n)
      }
    })
    return Array.from(byName.values())
  }, [nodes])

  // Detect GPU issues from GPU nodes data
  const gpuIssues = useMemo(() => {
    const issues: Array<{ cluster: string; nodeName: string; expected: number; available: number; reason: string }> = []

    // Filter GPU nodes by global cluster filter
    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    // Detect nodes with 0 GPUs that should have GPUs (based on their GPU type label)
    filteredGpuNodes.forEach(node => {
      if (node.gpuCount === 0 && node.gpuType) {
        issues.push({
          cluster: node.cluster,
          nodeName: node.name,
          expected: -1, // Unknown expected count
          available: 0,
          reason: `GPU node showing 0 GPUs (type: ${node.gpuType})`
        })
      }
    })

    return issues
  }, [gpuNodes, selectedClusters, isAllClustersSelected])

  const totalIssues = offlineNodes.length + gpuIssues.length
  const affectedClusters = new Set([
    ...offlineNodes.map(n => n.cluster || 'unknown'),
    ...gpuIssues.map(g => g.cluster)
  ]).size

  const runningMission = missions.find(m =>
    m.title.includes('Offline') && m.status === 'running'
  )

  const doStartAnalysis = () => {
    const nodesSummary = offlineNodes.map(n =>
      `- Node ${n.name} (${n.cluster || 'unknown'}): Status=${n.unschedulable ? 'Cordoned' : n.status}`
    ).join('\n')

    const gpuSummary = gpuIssues.map(g =>
      `- Node ${g.nodeName} (${g.cluster}): ${g.reason}`
    ).join('\n')

    startMission({
      title: 'Offline Node/GPU Detection',
      description: `Analyzing ${totalIssues} offline issues across ${affectedClusters} clusters`,
      type: 'troubleshoot',
      initialPrompt: `I need help analyzing offline nodes and unavailable GPUs in my Kubernetes clusters.

**Offline/Unhealthy Nodes (${offlineNodes.length}):**
${nodesSummary || 'None detected'}

**GPU Availability Issues (${gpuIssues.length}):**
${gpuSummary || 'None detected'}

Please:
1. Identify the root cause for each offline node
2. Check for common patterns (network issues, resource exhaustion, driver failures)
3. For GPU issues, check NVIDIA driver pod status and GPU operator health
4. Provide specific remediation steps for each issue
5. Prioritize issues by severity and impact`,
      context: {
        offlineNodes: offlineNodes.slice(0, 20),
        gpuIssues,
        affectedClusters,
      },
    })
  }

  const handleStartAnalysis = () => checkKeyAndRun(doStartAnalysis)

  // Determine status color
  const statusColor = totalIssues === 0
    ? 'green'
    : offlineNodes.length > 0
      ? 'red'
      : 'yellow'

  return (
    <div className="h-full flex flex-col relative">
      {/* API Key Prompt Modal */}
      <ApiKeyPromptModal
        isOpen={showKeyPrompt}
        onDismiss={dismissPrompt}
        onGoToSettings={goToSettings}
      />

      <div className="flex items-center justify-end mb-4">
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className={cn(
            'p-3 rounded-lg border',
            offlineNodes.length > 0
              ? 'bg-red-500/10 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => {
            if (offlineNodes.length > 0 && offlineNodes[0]?.cluster) {
              drillToCluster(offlineNodes[0].cluster)
            }
          }}
          title={offlineNodes.length > 0 ? `${offlineNodes.length} offline node${offlineNodes.length !== 1 ? 's' : ''} - Click to view` : 'All nodes online'}
        >
          <div className="text-2xl font-bold text-foreground">{offlineNodes.length}</div>
          <div className={cn('text-xs', offlineNodes.length > 0 ? 'text-red-400' : 'text-green-400')}>
            Offline Nodes
          </div>
        </div>
        <div
          className={cn(
            'p-3 rounded-lg border',
            gpuIssues.length > 0
              ? 'bg-yellow-500/10 border-yellow-500/20 cursor-pointer hover:bg-yellow-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={() => {
            if (gpuIssues.length > 0 && gpuIssues[0]) {
              drillToCluster(gpuIssues[0].cluster)
            }
          }}
          title={gpuIssues.length > 0 ? `${gpuIssues.length} GPU issue${gpuIssues.length !== 1 ? 's' : ''} - Click to view` : 'All GPUs available'}
        >
          <div className="text-2xl font-bold text-foreground">{gpuIssues.length}</div>
          <div className={cn('text-xs', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            GPU Issues
          </div>
        </div>
      </div>

      {/* Issues Preview */}
      <div className="flex-1 space-y-2 overflow-y-auto mb-4">
        {offlineNodes.slice(0, 2).map((node, i) => (
          <div
            key={`node-${i}`}
            className="p-2 rounded bg-red-500/10 text-xs cursor-pointer hover:bg-red-500/20 transition-colors group flex items-center justify-between"
            onClick={() => node.cluster && drillToNode(node.cluster, node.name, {
              status: node.unschedulable ? 'Cordoned' : node.status,
              unschedulable: node.unschedulable,
              roles: node.roles,
              issue: node.unschedulable ? 'Node is cordoned and not accepting new workloads' : `Node status: ${node.status}`
            })}
            title={`Click to diagnose ${node.name}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{node.name}</div>
              <div className="text-red-400">
                {node.unschedulable ? 'Cordoned' : node.status} • {node.cluster || 'unknown'}
              </div>
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </div>
        ))}
        {gpuIssues.slice(0, 2).map((issue, i) => (
          <div
            key={`gpu-${i}`}
            className="p-2 rounded bg-yellow-500/10 text-xs cursor-pointer hover:bg-yellow-500/20 transition-colors group flex items-center justify-between"
            onClick={() => drillToCluster(issue.cluster)}
            title={`Click to view cluster ${issue.cluster}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{issue.nodeName}</div>
              <div className="text-yellow-400">0 GPUs • {issue.cluster}</div>
            </div>
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
          </div>
        ))}
        {totalIssues === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground" title="All nodes and GPUs healthy">
            <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
            All nodes & GPUs healthy
          </div>
        )}
        {totalIssues > 4 && (
          <div className="text-xs text-muted-foreground text-center" title={`${totalIssues - 4} additional issues`}>
            +{totalIssues - 4} more issues
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleStartAnalysis}
        disabled={totalIssues === 0 || !!runningMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
          totalIssues === 0
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : runningMission
              ? 'bg-purple-500/20 text-purple-400 cursor-wait'
              : statusColor === 'red'
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
        )}
      >
        {totalIssues === 0 ? (
          <>
            <CheckCircle className="w-4 h-4" />
            All Healthy
          </>
        ) : runningMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Analyzing...
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4" />
            Analyze {totalIssues} Issue{totalIssues !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </div>
  )
}
