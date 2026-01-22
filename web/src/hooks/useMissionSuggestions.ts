import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePodIssues, useDeploymentIssues, useSecurityIssues, useClusters, useNodes, usePods } from './useMCP'
import { useSnoozedMissions } from './useSnoozedMissions'

export type MissionType =
  | 'scale'           // Workloads that may need scaling
  | 'limits'          // Pods without resource limits
  | 'restart'         // Pods with high restart counts
  | 'unavailable'     // Deployments with unavailable replicas
  | 'security'        // Security issues to address
  | 'health'          // Cluster health issues
  | 'resource'        // Resource pressure (nodes at capacity)

export interface MissionSuggestion {
  id: string
  type: MissionType
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  action: {
    type: 'klaude' | 'navigate' | 'scale' | 'diagnose'
    target: string   // Klaude command, route, or action identifier
    label: string    // Button label
  }
  context: {
    cluster?: string
    namespace?: string
    resource?: string
    resourceType?: string
    count?: number
    details?: string[]
  }
  detectedAt: number  // timestamp
}

// Thresholds for generating suggestions
const THRESHOLDS = {
  restartCount: 5,          // Pods with more than 5 restarts
  unavailableReplicas: 1,   // Any unavailable replicas
  cpuUtilization: 0.85,     // 85% CPU utilization
  memoryUtilization: 0.85,  // 85% memory utilization
  securityIssuesHigh: 1,    // Any high severity security issues
}

export function useMissionSuggestions() {
  const [suggestions, setSuggestions] = useState<MissionSuggestion[]>([])

  // Get data from various sources
  const { issues: podIssues } = usePodIssues()
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { issues: securityIssues } = useSecurityIssues()
  const { clusters } = useClusters()
  const { nodes } = useNodes()
  const { pods } = usePods()

  // Get snooze/dismiss state - also get the raw lists to trigger reactivity
  const { isSnoozed, isDismissed, snoozedMissions, dismissedMissions } = useSnoozedMissions()

  // Analyze and generate suggestions
  const analyzeAndSuggest = useCallback(() => {
    const newSuggestions: MissionSuggestion[] = []
    const now = Date.now()

    // 1. Check for pods with high restart counts
    const highRestartPods = podIssues.filter(p =>
      p.restarts && p.restarts > THRESHOLDS.restartCount
    )
    if (highRestartPods.length > 0) {
      const topPods = highRestartPods.slice(0, 3)
      newSuggestions.push({
        id: 'mission-restart-pods',
        type: 'restart',
        title: 'Investigate Restarting Pods',
        description: `${highRestartPods.length} pod${highRestartPods.length > 1 ? 's have' : ' has'} restarted ${THRESHOLDS.restartCount}+ times`,
        priority: highRestartPods.length > 5 ? 'high' : 'medium',
        action: {
          type: 'klaude',
          target: `Diagnose why pods are restarting frequently: ${topPods.map(p => p.name).join(', ')}`,
          label: 'Diagnose with Klaude',
        },
        context: {
          count: highRestartPods.length,
          details: topPods.map(p => `${p.name} (${p.restarts} restarts)`),
        },
        detectedAt: now,
      })
    }

    // 2. Check for deployments with unavailable replicas
    const unavailableDeployments = deploymentIssues.filter(d =>
      d.replicas > d.readyReplicas
    )
    if (unavailableDeployments.length > 0) {
      newSuggestions.push({
        id: 'mission-unavailable-deployments',
        type: 'unavailable',
        title: 'Fix Unavailable Deployments',
        description: `${unavailableDeployments.length} deployment${unavailableDeployments.length > 1 ? 's have' : ' has'} unavailable replicas`,
        priority: 'high',
        action: {
          type: 'klaude',
          target: `Diagnose why deployments have unavailable replicas: ${unavailableDeployments.slice(0, 3).map(d => d.name).join(', ')}`,
          label: 'Diagnose with Klaude',
        },
        context: {
          count: unavailableDeployments.length,
          details: unavailableDeployments.slice(0, 5).map(d => `${d.name}: ${d.replicas - d.readyReplicas}/${d.replicas} unavailable`),
        },
        detectedAt: now,
      })
    }

    // 3. Check for high severity security issues
    const highSeverityIssues = securityIssues.filter(i => i.severity === 'high')
    if (highSeverityIssues.length > 0) {
      newSuggestions.push({
        id: 'mission-security-high',
        type: 'security',
        title: 'Address Security Issues',
        description: `${highSeverityIssues.length} high severity security issue${highSeverityIssues.length > 1 ? 's' : ''} found`,
        priority: 'critical',
        action: {
          type: 'navigate',
          target: '/security',
          label: 'View Security Dashboard',
        },
        context: {
          count: highSeverityIssues.length,
          details: highSeverityIssues.slice(0, 3).map(i => i.issue),
        },
        detectedAt: now,
      })
    }

    // 4. Check for unhealthy clusters
    const unhealthyClusters = clusters.filter(c => c.reachable === false || !c.healthy)
    if (unhealthyClusters.length > 0) {
      newSuggestions.push({
        id: 'mission-unhealthy-clusters',
        type: 'health',
        title: 'Fix Cluster Health Issues',
        description: `${unhealthyClusters.length} cluster${unhealthyClusters.length > 1 ? 's are' : ' is'} unhealthy or unreachable`,
        priority: 'critical',
        action: {
          type: 'klaude',
          target: `Diagnose cluster health issues for: ${unhealthyClusters.map(c => c.name).join(', ')}`,
          label: 'Diagnose with Klaude',
        },
        context: {
          count: unhealthyClusters.length,
          details: unhealthyClusters.map(c => `${c.name}: ${c.errorMessage || 'unhealthy'}`),
        },
        detectedAt: now,
      })
    }

    // 5. Check for pods without resource limits (best practice)
    const podsWithoutLimits = pods.filter(p => {
      // This is a simplified check - in practice we'd need container-level info
      return p.status === 'Running' && !p.node  // Placeholder logic
    })
    // Only suggest if we have many pods without limits
    if (podsWithoutLimits.length > 10) {
      newSuggestions.push({
        id: 'mission-resource-limits',
        type: 'limits',
        title: 'Set Resource Limits',
        description: `${podsWithoutLimits.length} running pods may be missing resource limits`,
        priority: 'low',
        action: {
          type: 'klaude',
          target: 'Find pods without resource limits and suggest appropriate values based on usage',
          label: 'Analyze with Klaude',
        },
        context: {
          count: podsWithoutLimits.length,
        },
        detectedAt: now,
      })
    }

    // 6. Check for nodes under resource pressure
    const pressuredNodes = nodes.filter(n => {
      const cpuPressure = n.conditions?.some(c => c.type === 'MemoryPressure' && c.status === 'True')
      const memPressure = n.conditions?.some(c => c.type === 'DiskPressure' && c.status === 'True')
      return cpuPressure || memPressure
    })
    if (pressuredNodes.length > 0) {
      newSuggestions.push({
        id: 'mission-node-pressure',
        type: 'resource',
        title: 'Address Node Resource Pressure',
        description: `${pressuredNodes.length} node${pressuredNodes.length > 1 ? 's are' : ' is'} under resource pressure`,
        priority: 'high',
        action: {
          type: 'klaude',
          target: `Diagnose resource pressure on nodes: ${pressuredNodes.map(n => n.name).join(', ')}`,
          label: 'Diagnose with Klaude',
        },
        context: {
          count: pressuredNodes.length,
          details: pressuredNodes.map(n => n.name),
        },
        detectedAt: now,
      })
    }

    // 7. Check for deployments that might benefit from scaling
    const lowReplicaDeployments = deploymentIssues.filter(d =>
      d.replicas === 1 && d.readyReplicas === 1  // Running but only one replica
    )
    if (lowReplicaDeployments.length > 3) {
      newSuggestions.push({
        id: 'mission-scale-review',
        type: 'scale',
        title: 'Review Scaling Configuration',
        description: `${lowReplicaDeployments.length} deployments have only 1 replica (no HA)`,
        priority: 'low',
        action: {
          type: 'klaude',
          target: 'Review deployments with single replicas and recommend scaling for high availability',
          label: 'Review with Klaude',
        },
        context: {
          count: lowReplicaDeployments.length,
          details: lowReplicaDeployments.slice(0, 5).map(d => d.name),
        },
        detectedAt: now,
      })
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    newSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

    setSuggestions(newSuggestions)
  }, [podIssues, deploymentIssues, securityIssues, clusters, nodes, pods])

  // Re-analyze when data changes
  useEffect(() => {
    analyzeAndSuggest()
  }, [analyzeAndSuggest])

  // Re-analyze periodically (every 2 minutes)
  useEffect(() => {
    const interval = setInterval(analyzeAndSuggest, 120000)
    return () => clearInterval(interval)
  }, [analyzeAndSuggest])

  // Filter out snoozed and dismissed suggestions
  // Include snoozedMissions and dismissedMissions in deps to trigger re-filter on snooze changes
  const visibleSuggestions = useMemo(() => {
    return suggestions.filter(s => !isSnoozed(s.id) && !isDismissed(s.id))
  }, [suggestions, isSnoozed, isDismissed, snoozedMissions, dismissedMissions])

  // Stats
  const stats = useMemo(() => ({
    total: suggestions.length,
    visible: visibleSuggestions.length,
    critical: visibleSuggestions.filter(s => s.priority === 'critical').length,
    high: visibleSuggestions.filter(s => s.priority === 'high').length,
  }), [suggestions, visibleSuggestions])

  return {
    suggestions: visibleSuggestions,
    allSuggestions: suggestions,
    hasSuggestions: visibleSuggestions.length > 0,
    stats,
    refresh: analyzeAndSuggest,
  }
}
