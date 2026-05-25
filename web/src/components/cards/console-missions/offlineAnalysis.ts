/**
 * Mission prompt builder for the Offline Detection card's "Start Analysis" action.
 * Extracted from ConsoleOfflineDetectionCard to reduce component size.
 */
import type { UnifiedItem, GpuIssue, NodeData, ClusterHealthIssue } from './offlineDataTransforms'
import type { PredictedRisk } from '../../../types/predictions'

export interface AnalysisContext {
  unifiedItems: UnifiedItem[]
  categorizedItems: {
    offline: UnifiedItem[]
    gpu: UnifiedItem[]
    prediction: UnifiedItem[]
  }
  gpuIssues: GpuIssue[]
  predictedRisks: PredictedRisk[]
  filteredTotalIssues: number
  filteredTotalPredicted: number
  filteredCriticalPredicted: number
  isFiltered: boolean
}

export interface AnalysisMissionConfig {
  title: string
  description: string
  type: 'custom' | 'deploy' | 'upgrade' | 'repair' | 'troubleshoot' | 'analyze' | 'maintain'
  initialPrompt: string
  context: {
    offlineNodes: NodeData[]
    clusterHealthIssues: ClusterHealthIssue[]
    gpuIssues: GpuIssue[]
    predictedRisks: PredictedRisk[]
    affectedClusters: number
    criticalPredicted: number
    aiPredictionCount: number
    heuristicPredictionCount: number
  }
}

/**
 * Builds the mission configuration for AI analysis of cluster health issues.
 */
export function buildAnalysisMissionConfig(ctx: AnalysisContext): AnalysisMissionConfig {
  const { categorizedItems, gpuIssues, predictedRisks, isFiltered, unifiedItems } = ctx

  const filteredOfflineItems = isFiltered
    ? categorizedItems.offline
    : unifiedItems.filter(i => i.category === 'offline')
  const filteredOfflineNodes = filteredOfflineItems
    .map(i => i.nodeData)
    .filter((node): node is NonNullable<typeof node> => !!node)
  const filteredClusterHealthIssues = filteredOfflineItems
    .map(i => i.clusterIssueData)
    .filter((issue): issue is NonNullable<typeof issue> => !!issue)
  const filteredGpuIssuesList = isFiltered
    ? categorizedItems.gpu.map(i => i.gpuData).filter((data): data is NonNullable<typeof data> => !!data)
    : gpuIssues
  const filteredPredictedRisks = isFiltered
    ? categorizedItems.prediction.map(i => i.predictionData).filter((data): data is NonNullable<typeof data> => !!data)
    : predictedRisks

  const nodesSummary = filteredOfflineNodes.map(node => {
    const item = filteredOfflineItems.find(entry => entry.nodeData?.name === node.name && entry.nodeData?.cluster === node.cluster)
    const rootCause = item?.rootCause
    let line = `- Node ${node.name} (${node.cluster || 'unknown'}): Status=${node.unschedulable ? 'Cordoned' : node.status}`
    if (rootCause) {
      line += `\n  Root Cause: ${rootCause.cause}`
      line += `\n  Details: ${rootCause.details}`
    }
    return line
  }).join('\n')

  const clusterHealthSummary = filteredClusterHealthIssues.map(issue =>
    `- Cluster ${issue.cluster}: ${issue.reason}${issue.reasonDetailed ? `\n  Details: ${issue.reasonDetailed}` : ''}`
  ).join('\n')

  const gpuSummary = filteredGpuIssuesList.map(g =>
    `- Node ${g.nodeName} (${g.cluster}): ${g.reason}`
  ).join('\n')

  const predictedSummary = filteredPredictedRisks.map(r => {
    const sourceLabel = r.source === 'ai' ? `AI (${r.confidence || 0}% confidence)` : 'Heuristic'
    const trendLabel = r.trend ? ` [${r.trend}]` : ''
    let entry = `- [${r.severity.toUpperCase()}] [${sourceLabel}]${trendLabel} ${r.name} (${r.cluster || 'unknown'}):\n  Summary: ${r.reason}`
    if (r.reasonDetailed) {
      entry += `\n  Details: ${r.reasonDetailed}`
    }
    return entry
  }).join('\n\n')

  const filteredAICount = filteredPredictedRisks.filter(r => r.source === 'ai').length
  const filteredHeuristicCount = filteredPredictedRisks.filter(r => r.source === 'heuristic').length
  const hasCurrentIssues = ctx.filteredTotalIssues > 0
  const hasPredictions = ctx.filteredTotalPredicted > 0

  return {
    title: hasPredictions && !hasCurrentIssues ? 'Predictive Health Analysis' : 'Health Issue Analysis',
    description: hasCurrentIssues
      ? `Analyzing ${ctx.filteredTotalIssues} issues${hasPredictions ? ` + ${ctx.filteredTotalPredicted} predicted risks` : ''}`
      : `Analyzing ${ctx.filteredTotalPredicted} predicted failure risks (${filteredAICount} AI, ${filteredHeuristicCount} heuristic)`,
    type: 'troubleshoot',
    initialPrompt: `I need help analyzing ${hasCurrentIssues ? 'current issues and ' : ''}potential failures in my Kubernetes clusters.

${hasCurrentIssues ? `**Current Cluster Health Issues (${filteredClusterHealthIssues.length}):**
${clusterHealthSummary || 'None detected'}

**Current Node Issues (${filteredOfflineNodes.length}):**
${nodesSummary || 'None detected'}

**Current GPU Issues (${filteredGpuIssuesList.length}):**
${gpuSummary || 'None detected'}

` : ''}**Predicted Failure Risks (${ctx.filteredTotalPredicted} total: ${filteredAICount} AI-detected, ${filteredHeuristicCount} threshold-based):**
${predictedSummary || 'None predicted'}

Please:
1. ${hasCurrentIssues ? 'Identify root causes for the current cluster and node issues' : 'Analyze the predicted risks and their likelihood'}
2. ${hasPredictions ? 'Assess the predicted failures - which are most likely to occur? Consider the AI confidence levels and trends.' : 'Check for patterns in the current issues'}
3. Provide preventive actions to avoid predicted failures
4. ${hasCurrentIssues ? 'Provide remediation steps for the current issues' : 'Recommend monitoring thresholds to catch issues earlier'}
5. Prioritize by severity and potential impact
6. Suggest proactive measures to prevent future failures`,
    context: {
      offlineNodes: filteredOfflineNodes.slice(0, 20),
      clusterHealthIssues: filteredClusterHealthIssues.slice(0, 20),
      gpuIssues: filteredGpuIssuesList,
      predictedRisks: filteredPredictedRisks.slice(0, 20),
      affectedClusters: new Set([
        ...filteredOfflineNodes.map(node => node.cluster || 'unknown'),
        ...filteredClusterHealthIssues.map(issue => issue.cluster),
        ...filteredGpuIssuesList.map(g => g.cluster)
      ]).size,
      criticalPredicted: ctx.filteredCriticalPredicted,
      aiPredictionCount: filteredAICount,
      heuristicPredictionCount: filteredHeuristicCount,
    },
  }
}
