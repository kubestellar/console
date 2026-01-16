import { useState, useEffect, useCallback } from 'react'
import { usePodIssues, useDeploymentIssues, useWarningEvents, useGPUNodes, useClusters } from './useMCP'
import { useAIMode } from './useAIMode'

export interface CardRecommendation {
  id: string
  cardType: string
  title: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  replaceCardId?: string  // Which existing card to replace
  config?: Record<string, unknown>
}

// Card priority based on cluster activity
const CARD_PRIORITIES: Record<string, number> = {
  pod_issues: 90,
  deployment_issues: 85,
  security_issues: 80,
  gpu_status: 75,
  event_stream: 60,
  cluster_health: 50,
  resource_capacity: 40,
  gpu_inventory: 35,
}

export function useCardRecommendations(currentCardTypes: string[]) {
  const [recommendations, setRecommendations] = useState<CardRecommendation[]>([])
  const { shouldProactivelySuggest } = useAIMode()

  // Fetch cluster data to analyze
  const { issues: podIssues } = usePodIssues()
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { events: warningEvents } = useWarningEvents()
  const { nodes: gpuNodes } = useGPUNodes()
  const { clusters } = useClusters()

  // Analyze cluster state and generate recommendations
  const analyzeAndRecommend = useCallback(() => {
    if (!shouldProactivelySuggest) {
      setRecommendations([])
      return
    }

    const newRecommendations: CardRecommendation[] = []

    // Check for pod issues
    if (podIssues.length > 5 && !currentCardTypes.includes('pod_issues')) {
      newRecommendations.push({
        id: 'rec-pod-issues',
        cardType: 'pod_issues',
        title: 'Pod Issues',
        reason: `${podIssues.length} pods have issues that need attention`,
        priority: 'high',
      })
    }

    // Check for deployment issues
    if (deploymentIssues.length > 0 && !currentCardTypes.includes('deployment_issues')) {
      newRecommendations.push({
        id: 'rec-deployment-issues',
        cardType: 'deployment_issues',
        title: 'Deployment Issues',
        reason: `${deploymentIssues.length} deployments have issues`,
        priority: deploymentIssues.length > 3 ? 'high' : 'medium',
      })
    }

    // Check for many warning events
    if (warningEvents.length > 10 && !currentCardTypes.includes('event_stream')) {
      newRecommendations.push({
        id: 'rec-events',
        cardType: 'event_stream',
        title: 'Event Stream',
        reason: `${warningEvents.length} warning events in your clusters`,
        priority: 'medium',
        config: { warningsOnly: true },
      })
    }

    // Check for GPU utilization
    const totalGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuCount, 0)
    const allocatedGPUs = gpuNodes.reduce((sum, n) => sum + n.gpuAllocated, 0)
    const gpuUtilization = totalGPUs > 0 ? allocatedGPUs / totalGPUs : 0

    if (totalGPUs > 0) {
      if (gpuUtilization > 0.9 && !currentCardTypes.includes('gpu_status')) {
        newRecommendations.push({
          id: 'rec-gpu-status',
          cardType: 'gpu_status',
          title: 'GPU Status',
          reason: `GPU utilization is at ${Math.round(gpuUtilization * 100)}% - consider monitoring`,
          priority: 'high',
        })
      } else if (!currentCardTypes.includes('gpu_overview') && !currentCardTypes.includes('gpu_inventory')) {
        newRecommendations.push({
          id: 'rec-gpu-overview',
          cardType: 'gpu_overview',
          title: 'GPU Overview',
          reason: `You have ${totalGPUs} GPUs across ${gpuNodes.length} nodes`,
          priority: 'low',
        })
      }
    }

    // Check for unhealthy clusters
    const unhealthyClusters = clusters.filter(c => !c.healthy)
    if (unhealthyClusters.length > 0 && !currentCardTypes.includes('cluster_health')) {
      newRecommendations.push({
        id: 'rec-cluster-health',
        cardType: 'cluster_health',
        title: 'Cluster Health',
        reason: `${unhealthyClusters.length} clusters are unhealthy`,
        priority: 'high',
      })
    }

    // Sort by priority
    newRecommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    setRecommendations(newRecommendations.slice(0, 3)) // Top 3 recommendations
  }, [
    shouldProactivelySuggest,
    currentCardTypes,
    podIssues,
    deploymentIssues,
    warningEvents,
    gpuNodes,
    clusters,
  ])

  // Re-analyze when data changes
  useEffect(() => {
    analyzeAndRecommend()
  }, [analyzeAndRecommend])

  // Re-analyze periodically
  useEffect(() => {
    const interval = setInterval(analyzeAndRecommend, 60000) // Every minute
    return () => clearInterval(interval)
  }, [analyzeAndRecommend])

  return {
    recommendations,
    hasRecommendations: recommendations.length > 0,
    highPriorityCount: recommendations.filter(r => r.priority === 'high').length,
  }
}
