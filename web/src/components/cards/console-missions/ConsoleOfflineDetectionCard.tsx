import { useMemo, useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Clock, ChevronRight, TrendingUp, TrendingDown, Minus, Cpu, HardDrive, RefreshCw, Info, Sparkles, ThumbsUp, ThumbsDown, Zap } from 'lucide-react'
import { getDemoMode } from '../../../hooks/useDemoMode'
import { useMissions } from '../../../hooks/useMissions'
import { useGPUNodes, usePodIssues, useClusters } from '../../../hooks/useMCP'
import { useGlobalFilters } from '../../../hooks/useGlobalFilters'
import { useDrillDownActions } from '../../../hooks/useDrillDown'
import { usePredictionSettings } from '../../../hooks/usePredictionSettings'
import { useAIPredictions } from '../../../hooks/useAIPredictions'
import { usePredictionFeedback } from '../../../hooks/usePredictionFeedback'
import { useMetricsHistory } from '../../../hooks/useMetricsHistory'
import { cn } from '../../../lib/cn'
import { useApiKeyCheck, ApiKeyPromptModal } from './shared'
import type { ConsoleMissionCardProps } from './shared'
import { useCardLoadingState } from '../CardDataContext'
import type { PredictedRisk, TrendDirection } from '../../../types/predictions'

// ============================================================================
// Module-level cache for all nodes (shared across card instances)
// ============================================================================
type NodeData = { name: string; cluster?: string; status: string; roles: string[]; unschedulable?: boolean }

let nodesCache: NodeData[] = []
let nodesCacheTimestamp = 0
let nodesFetchInProgress = false
const NODES_CACHE_TTL = 30000 // 30 seconds
const nodesSubscribers = new Set<(nodes: NodeData[]) => void>()

function notifyNodesSubscribers() {
  nodesSubscribers.forEach(cb => cb(nodesCache))
}

async function fetchAllNodes(): Promise<NodeData[]> {
  // Return cached data if still fresh
  if (Date.now() - nodesCacheTimestamp < NODES_CACHE_TTL && nodesCache.length > 0) {
    return nodesCache
  }

  // If fetch in progress, wait and return cache
  if (nodesFetchInProgress) {
    return nodesCache
  }

  nodesFetchInProgress = true
  try {
    const response = await fetch('http://127.0.0.1:8585/nodes')
    if (response.ok) {
      const data = await response.json()
      nodesCache = data.nodes || []
      nodesCacheTimestamp = Date.now()
      notifyNodesSubscribers()
    }
  } catch (error) {
    console.error('[OfflineDetection] Error fetching nodes:', error)
  } finally {
    nodesFetchInProgress = false
  }
  return nodesCache
}

// Trend icon component
function TrendIcon({ trend, className }: { trend?: TrendDirection; className?: string }) {
  if (!trend || trend === 'stable') {
    return (
      <span title="Stable">
        <Minus className={cn('w-3 h-3 text-muted-foreground', className)} />
      </span>
    )
  }
  if (trend === 'worsening') {
    return (
      <span title="Worsening">
        <TrendingUp className={cn('w-3 h-3 text-orange-400', className)} />
      </span>
    )
  }
  return (
    <span title="Improving">
      <TrendingDown className={cn('w-3 h-3 text-green-400', className)} />
    </span>
  )
}

// Generate unique ID for heuristic predictions
function generatePredictionId(type: string, name: string, cluster?: string): string {
  return `heuristic-${type}-${name}-${cluster || 'unknown'}`
}

// Card 4: Offline Detection - Detect offline nodes and unavailable GPUs + Predictive Failures
export function ConsoleOfflineDetectionCard(_props: ConsoleMissionCardProps) {
  const { startMission, missions } = useMissions()
  const { nodes: gpuNodes, isLoading } = useGPUNodes()
  const { issues: podIssues } = usePodIssues()
  const { deduplicatedClusters: clusters } = useClusters()
  const { selectedClusters, isAllClustersSelected, customFilter } = useGlobalFilters()
  const { drillToCluster, drillToNode } = useDrillDownActions()
  const { showKeyPrompt, checkKeyAndRun, goToSettings, dismissPrompt } = useApiKeyCheck()

  // Prediction hooks
  const { settings: predictionSettings } = usePredictionSettings()
  const { predictions: aiPredictions, isAnalyzing, analyze: triggerAIAnalysis, isEnabled: aiEnabled } = useAIPredictions()
  const { submitFeedback, getFeedback } = usePredictionFeedback()
  const { getClusterTrend, getPodRestartTrend } = useMetricsHistory()

  // Get thresholds from settings
  const THRESHOLDS = predictionSettings.thresholds

  // Get all nodes from shared cache
  const [allNodes, setAllNodes] = useState<NodeData[]>(() => nodesCache)
  const [nodesLoading, setNodesLoading] = useState(nodesCache.length === 0)

  // Report loading state to CardWrapper for skeleton/refresh behavior
  // Consider both GPU nodes AND local nodes cache for hasAnyData
  useCardLoadingState({
    isLoading: isLoading && nodesLoading,
    hasAnyData: gpuNodes.length > 0 || nodesCache.length > 0 || allNodes.length > 0,
  })

  // Subscribe to cache updates and fetch nodes
  useEffect(() => {
    // Skip agent requests in demo mode (no local agent on Netlify)
    if (getDemoMode()) {
      setNodesLoading(false)
      return
    }

    // Subscribe to cache updates
    const handleUpdate = (nodes: NodeData[]) => {
      setAllNodes(nodes)
      setNodesLoading(false)
    }
    nodesSubscribers.add(handleUpdate)

    // Initial fetch (will use cache if fresh)
    fetchAllNodes().then(nodes => {
      setAllNodes(nodes)
      setNodesLoading(false)
    })

    // Poll every 30 seconds
    const interval = setInterval(() => fetchAllNodes(), 30000)

    return () => {
      nodesSubscribers.delete(handleUpdate)
      clearInterval(interval)
    }
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

  // Predict potential failures using heuristics
  const heuristicPredictions = useMemo(() => {
    const risks: PredictedRisk[] = []

    // 1. Pods with high restart counts - likely to crash
    const filteredPodIssues = isAllClustersSelected
      ? podIssues
      : podIssues.filter(p => selectedClusters.includes(p.cluster || ''))

    filteredPodIssues.forEach(pod => {
      if (pod.restarts && pod.restarts >= THRESHOLDS.highRestartCount) {
        const trend = getPodRestartTrend(pod.name, pod.cluster || '')
        risks.push({
          id: generatePredictionId('pod-crash', pod.name, pod.cluster),
          type: 'pod-crash',
          severity: pod.restarts >= 5 ? 'critical' : 'warning',
          name: pod.name,
          cluster: pod.cluster,
          reason: `${pod.restarts} restarts - likely to crash`,
          reasonDetailed: `Pod has restarted ${pod.restarts} times, which indicates instability. This typically suggests memory pressure (OOMKill), application bugs, or configuration issues. Recommended actions: Check pod logs with 'kubectl logs ${pod.name}', describe the pod to see recent events, and review resource limits.`,
          metric: `${pod.restarts} restarts`,
          source: 'heuristic',
          trend,
        })
      }
    })

    // 2. Clusters with high resource usage - at risk of node pressure
    const filteredClusters = isAllClustersSelected
      ? clusters
      : clusters.filter(c => selectedClusters.includes(c.name))

    filteredClusters.forEach(cluster => {
      // Check CPU pressure (if metrics available)
      if (cluster.cpuCores && cluster.cpuUsageCores) {
        const cpuPercent = (cluster.cpuUsageCores / cluster.cpuCores) * 100
        if (cpuPercent >= THRESHOLDS.cpuPressure) {
          const trend = getClusterTrend(cluster.name, 'cpuPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-cpu', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: cpuPercent >= 90 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `CPU at ${cpuPercent.toFixed(0)}% - risk of throttling`,
            reasonDetailed: `Cluster CPU utilization is at ${cpuPercent.toFixed(1)}%, above the ${THRESHOLDS.cpuPressure}% warning threshold. At this level, workloads may experience throttling, increased latency, and degraded performance. Consider scaling up nodes, optimizing resource-intensive workloads, or implementing CPU limits.`,
            metric: `${cpuPercent.toFixed(0)}% CPU`,
            source: 'heuristic',
            trend,
          })
        }
      }

      // Check memory pressure
      if (cluster.memoryGB && cluster.memoryUsageGB) {
        const memPercent = (cluster.memoryUsageGB / cluster.memoryGB) * 100
        if (memPercent >= THRESHOLDS.memoryPressure) {
          const trend = getClusterTrend(cluster.name, 'memoryPercent')
          risks.push({
            id: generatePredictionId('resource-exhaustion-mem', cluster.name, cluster.name),
            type: 'resource-exhaustion',
            severity: memPercent >= 95 ? 'critical' : 'warning',
            name: cluster.name,
            cluster: cluster.name,
            reason: `Memory at ${memPercent.toFixed(0)}% - risk of OOM`,
            reasonDetailed: `Cluster memory utilization is at ${memPercent.toFixed(1)}%, above the ${THRESHOLDS.memoryPressure}% warning threshold. Pods may be OOMKilled, nodes may become unschedulable, and new deployments may fail. Consider scaling up memory, reviewing memory limits, or identifying memory leaks.`,
            metric: `${memPercent.toFixed(0)}% memory`,
            source: 'heuristic',
            trend,
          })
        }
      }
    })

    // 3. GPU nodes with high allocation - risk of GPU exhaustion
    const filteredGpuNodes = isAllClustersSelected
      ? gpuNodes
      : gpuNodes.filter(n => selectedClusters.includes(n.cluster))

    filteredGpuNodes.forEach(node => {
      if (node.gpuCount > 0 && node.gpuAllocated >= node.gpuCount) {
        risks.push({
          id: generatePredictionId('gpu-exhaustion', node.name, node.cluster),
          type: 'gpu-exhaustion',
          severity: 'warning',
          name: node.name,
          cluster: node.cluster,
          reason: `All ${node.gpuCount} GPUs allocated - no capacity`,
          reasonDetailed: `All ${node.gpuCount} GPUs on this node are fully allocated (${node.gpuAllocated}/${node.gpuCount}). New GPU workloads will not be able to schedule on this node. Consider adding more GPU nodes, optimizing GPU utilization, or implementing GPU sharing strategies.`,
          metric: `${node.gpuAllocated}/${node.gpuCount} GPUs`,
          source: 'heuristic',
        })
      }
    })

    return risks
  }, [podIssues, clusters, gpuNodes, selectedClusters, isAllClustersSelected, THRESHOLDS, getClusterTrend, getPodRestartTrend])

  // Merge heuristic and AI predictions
  const predictedRisks = useMemo(() => {
    // Filter AI predictions by cluster selection
    const filteredAIPredictions = aiEnabled
      ? aiPredictions.filter(p =>
          isAllClustersSelected || !p.cluster || selectedClusters.includes(p.cluster)
        )
      : []

    // Combine all predictions
    const allRisks = [...heuristicPredictions, ...filteredAIPredictions]

    // Deduplicate by key, preferring AI predictions when they overlap
    const uniqueRisks = allRisks.reduce((acc, risk) => {
      const key = `${risk.type}-${risk.name}-${risk.cluster || 'unknown'}`
      const existing = acc.get(key)
      if (!existing) {
        acc.set(key, risk)
      } else if (risk.source === 'ai' && existing.source === 'heuristic') {
        // AI prediction takes precedence
        acc.set(key, risk)
      } else if (existing.severity === 'warning' && risk.severity === 'critical') {
        // Higher severity takes precedence
        acc.set(key, risk)
      }
      return acc
    }, new Map<string, PredictedRisk>())

    // Sort: critical first, then AI predictions, then by name
    return Array.from(uniqueRisks.values())
      .sort((a, b) => {
        if (a.severity !== b.severity) {
          return a.severity === 'critical' ? -1 : 1
        }
        if (a.source !== b.source) {
          return a.source === 'ai' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
  }, [heuristicPredictions, aiPredictions, aiEnabled, selectedClusters, isAllClustersSelected])

  const totalIssues = offlineNodes.length + gpuIssues.length
  const totalPredicted = predictedRisks.length
  const criticalPredicted = predictedRisks.filter(r => r.severity === 'critical').length
  const aiPredictionCount = predictedRisks.filter(r => r.source === 'ai').length
  const heuristicPredictionCount = predictedRisks.filter(r => r.source === 'heuristic').length
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

    // Include both summary and detailed explanation for each prediction
    const predictedSummary = predictedRisks.map(r => {
      const sourceLabel = r.source === 'ai' ? `AI (${r.confidence || 0}% confidence)` : 'Heuristic'
      const trendLabel = r.trend ? ` [${r.trend}]` : ''
      let entry = `- [${r.severity.toUpperCase()}] [${sourceLabel}]${trendLabel} ${r.name} (${r.cluster || 'unknown'}):\n  Summary: ${r.reason}`
      if (r.reasonDetailed) {
        entry += `\n  Details: ${r.reasonDetailed}`
      }
      return entry
    }).join('\n\n')

    const hasCurrentIssues = totalIssues > 0
    const hasPredictions = totalPredicted > 0

    startMission({
      title: hasPredictions && !hasCurrentIssues ? 'Predictive Failure Analysis' : 'Node & GPU Analysis',
      description: hasCurrentIssues
        ? `Analyzing ${totalIssues} issues${hasPredictions ? ` + ${totalPredicted} predicted risks` : ''}`
        : `Analyzing ${totalPredicted} predicted failure risks (${aiPredictionCount} AI, ${heuristicPredictionCount} heuristic)`,
      type: 'troubleshoot',
      initialPrompt: `I need help analyzing ${hasCurrentIssues ? 'current issues and ' : ''}potential failures in my Kubernetes clusters.

${hasCurrentIssues ? `**Current Offline/Unhealthy Nodes (${offlineNodes.length}):**
${nodesSummary || 'None detected'}

**Current GPU Issues (${gpuIssues.length}):**
${gpuSummary || 'None detected'}

` : ''}**Predicted Failure Risks (${totalPredicted} total: ${aiPredictionCount} AI-detected, ${heuristicPredictionCount} threshold-based):**
${predictedSummary || 'None predicted'}

Please:
1. ${hasCurrentIssues ? 'Identify root causes for current offline nodes' : 'Analyze the predicted risks and their likelihood'}
2. ${hasPredictions ? 'Assess the predicted failures - which are most likely to occur? Consider the AI confidence levels and trends.' : 'Check for patterns in the current issues'}
3. Provide preventive actions to avoid predicted failures
4. ${hasCurrentIssues ? 'Provide remediation steps for current issues' : 'Recommend monitoring thresholds to catch issues earlier'}
5. Prioritize by severity and potential impact
6. Suggest proactive measures to prevent future failures`,
      context: {
        offlineNodes: offlineNodes.slice(0, 20),
        gpuIssues,
        predictedRisks: predictedRisks.slice(0, 20),
        affectedClusters,
        criticalPredicted,
        aiPredictionCount,
        heuristicPredictionCount,
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
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div
          className={cn(
            'p-2 rounded-lg border',
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
          <div className="text-xl font-bold text-foreground">{offlineNodes.length}</div>
          <div className={cn('text-[10px]', offlineNodes.length > 0 ? 'text-red-400' : 'text-green-400')}>
            Offline
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
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
          <div className="text-xl font-bold text-foreground">{gpuIssues.length}</div>
          <div className={cn('text-[10px]', gpuIssues.length > 0 ? 'text-yellow-400' : 'text-green-400')}>
            GPU Issues
          </div>
        </div>
        <div
          className={cn(
            'p-2 rounded-lg border',
            totalPredicted > 0
              ? criticalPredicted > 0
                ? 'bg-orange-500/10 border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-colors'
                : aiPredictionCount > 0
                  ? 'bg-purple-500/10 border-purple-500/20 cursor-pointer hover:bg-purple-500/20 transition-colors'
                  : 'bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-colors'
              : 'bg-green-500/10 border-green-500/20 cursor-default'
          )}
          onClick={aiEnabled && !isAnalyzing ? () => triggerAIAnalysis() : undefined}
          title={`Predictive Failure Detection:

Heuristic Rules (instant):
• Pods with ${THRESHOLDS.highRestartCount}+ restarts → likely to crash
• Clusters with >${THRESHOLDS.cpuPressure}% CPU → throttling risk
• Clusters with >${THRESHOLDS.memoryPressure}% memory → OOM risk
• GPU nodes at full capacity → no headroom

AI Analysis (${aiEnabled ? `every ${predictionSettings.interval}m` : 'disabled'}):
${aiEnabled ? '• Trend detection over time\n• Correlated failure patterns\n• Anomaly detection' : '• Enable in Settings > Predictions'}

${totalPredicted > 0 ? `Current: ${heuristicPredictionCount} heuristic, ${aiPredictionCount} AI${criticalPredicted > 0 ? ` (${criticalPredicted} critical)` : ''}` : 'No predicted risks detected'}
${aiEnabled ? '\nClick to run AI analysis now' : ''}`}
        >
          <div className="flex items-center gap-1">
            {aiPredictionCount > 0 ? (
              <Sparkles className={cn('w-3 h-3', criticalPredicted > 0 ? 'text-orange-400' : 'text-purple-400')} />
            ) : (
              <TrendingUp className={cn('w-3 h-3', totalPredicted > 0 ? criticalPredicted > 0 ? 'text-orange-400' : 'text-blue-400' : 'text-green-400')} />
            )}
            <span className="text-xl font-bold text-foreground">{totalPredicted}</span>
            {isAnalyzing && (
              <RefreshCw className="w-3 h-3 text-purple-400 animate-spin" />
            )}
          </div>
          <div className={cn(
            'text-[10px] flex items-center gap-1',
            totalPredicted > 0
              ? criticalPredicted > 0
                ? 'text-orange-400'
                : aiPredictionCount > 0
                  ? 'text-purple-400'
                  : 'text-blue-400'
              : 'text-green-400'
          )}>
            Predicted
            <Info className="w-3 h-3 opacity-60" />
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
        {gpuIssues.slice(0, 1).map((issue, i) => (
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
        {/* Predicted Risks */}
        {predictedRisks.slice(0, 2).map((risk) => {
          const feedback = risk.id ? getFeedback(risk.id) : null
          return (
            <div
              key={risk.id}
              className={cn(
                'p-2 rounded text-xs transition-colors group',
                risk.severity === 'critical'
                  ? 'bg-orange-500/10 hover:bg-orange-500/20'
                  : risk.source === 'ai'
                    ? 'bg-purple-500/10 hover:bg-purple-500/20'
                    : 'bg-blue-500/10 hover:bg-blue-500/20'
              )}
              title={risk.reasonDetailed || risk.reason}
            >
              <div className="flex items-center justify-between">
                <div
                  className="min-w-0 flex items-center gap-2 flex-1 cursor-pointer"
                  onClick={() => risk.cluster && drillToCluster(risk.cluster)}
                >
                  {/* Type Icon */}
                  {risk.type === 'pod-crash' && <RefreshCw className="w-3 h-3 text-orange-400 flex-shrink-0" />}
                  {risk.type === 'resource-exhaustion' && <Cpu className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                  {risk.type === 'gpu-exhaustion' && <HardDrive className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                  {(risk.type === 'resource-trend' || risk.type === 'capacity-risk' || risk.type === 'anomaly') && (
                    <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground truncate">{risk.name}</span>
                      {/* Source Badge */}
                      {risk.source === 'ai' ? (
                        <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-purple-500/20 text-purple-400 rounded">
                          AI
                        </span>
                      ) : (
                        <span className="flex-shrink-0 px-1 py-0.5 text-[9px] font-medium bg-blue-500/20 text-blue-400 rounded flex items-center gap-0.5">
                          <Zap className="w-2 h-2" />
                        </span>
                      )}
                      {/* Confidence */}
                      {risk.confidence !== undefined && (
                        <span className="text-[9px] text-muted-foreground">{risk.confidence}%</span>
                      )}
                      {/* Trend */}
                      {risk.trend && <TrendIcon trend={risk.trend} />}
                    </div>
                    <div className={cn(
                      'truncate',
                      risk.severity === 'critical' ? 'text-orange-400' : risk.source === 'ai' ? 'text-purple-400' : 'text-blue-400'
                    )}>
                      {risk.metric ? `${risk.metric} • ` : ''}{risk.cluster}
                    </div>
                  </div>
                </div>

                {/* Feedback Buttons + Chevron */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  {risk.source === 'ai' && risk.id && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          submitFeedback(risk.id, 'accurate', risk.type, risk.provider)
                        }}
                        className={cn(
                          'p-1 rounded transition-colors',
                          feedback === 'accurate'
                            ? 'bg-green-500/20 text-green-400'
                            : 'text-muted-foreground hover:text-green-400 hover:bg-green-500/10'
                        )}
                        title="Mark as accurate"
                      >
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          submitFeedback(risk.id, 'inaccurate', risk.type, risk.provider)
                        }}
                        className={cn(
                          'p-1 rounded transition-colors',
                          feedback === 'inaccurate'
                            ? 'bg-red-500/20 text-red-400'
                            : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
                        )}
                        title="Mark as inaccurate"
                      >
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <ChevronRight
                    className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer"
                    onClick={() => risk.cluster && drillToCluster(risk.cluster)}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {totalIssues === 0 && totalPredicted === 0 && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground" title="All nodes and GPUs healthy">
            <CheckCircle className="w-4 h-4 mr-2 text-green-400" />
            All nodes & GPUs healthy
          </div>
        )}
        {(totalIssues + totalPredicted) > 5 && (
          <div className="text-xs text-muted-foreground text-center" title={`${totalIssues + totalPredicted - 5} additional issues`}>
            +{totalIssues + totalPredicted - 5} more
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        onClick={handleStartAnalysis}
        disabled={(totalIssues === 0 && totalPredicted === 0) || !!runningMission}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all',
          totalIssues === 0 && totalPredicted === 0
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : runningMission
              ? 'bg-purple-500/20 text-purple-400 cursor-wait'
              : totalIssues > 0
                ? statusColor === 'red'
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                  : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
                : aiPredictionCount > 0
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400'
                  : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
        )}
      >
        {totalIssues === 0 && totalPredicted === 0 ? (
          <>
            <CheckCircle className="w-4 h-4" />
            All Healthy
          </>
        ) : runningMission ? (
          <>
            <Clock className="w-4 h-4 animate-pulse" />
            Analyzing...
          </>
        ) : totalIssues > 0 ? (
          <>
            <AlertCircle className="w-4 h-4" />
            Analyze {totalIssues} Issue{totalIssues !== 1 ? 's' : ''}{totalPredicted > 0 ? ` + ${totalPredicted} Risks` : ''}
          </>
        ) : (
          <>
            {aiPredictionCount > 0 ? <Sparkles className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            Analyze {totalPredicted} Predicted Risk{totalPredicted !== 1 ? 's' : ''}
            {aiPredictionCount > 0 && (
              <span className="text-xs opacity-75">({aiPredictionCount} AI)</span>
            )}
          </>
        )}
      </button>
    </div>
  )
}
