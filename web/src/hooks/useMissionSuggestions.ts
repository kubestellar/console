import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { usePodIssues, useDeploymentIssues, useSecurityIssues, useClusters, useNodes, usePods } from './useMCP'
import { useSnoozedMissions } from './useSnoozedMissions'
import { useConsoleKBIndex } from './useConsoleKBIndex'
import { lazyMatchIndex, type ClusterIssue, type IndexMatchResult } from '@/lib/missions/indexMatcher'

export type MissionType =
  | 'scale'           // Workloads that may need scaling
  | 'limits'          // Pods without resource limits
  | 'restart'         // Pods with high restart counts
  | 'unavailable'     // Deployments with unavailable replicas
  | 'security'        // Security issues to address
  | 'health'          // Cluster health issues
  | 'resource'        // Resource pressure (nodes at capacity)
  | 'import'          // Community KB import suggestions

export interface MissionSuggestion {
  id: string
  type: MissionType
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  action: {
    type: 'ai' | 'navigate' | 'scale' | 'diagnose' | 'import'
    target: string   // AI command, route, or action identifier
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

const MISSIONS_STORAGE_KEY = 'kc_missions'
const MAX_IMPORT_SUGGESTIONS = 3

/** Get titles of already-imported missions from localStorage */
function getImportedMissionTitles(): Set<string> {
  try {
    const raw = localStorage.getItem(MISSIONS_STORAGE_KEY)
    if (!raw) return new Set()
    const missions = JSON.parse(raw) as Array<{ title?: string }>
    return new Set(missions.map(m => m.title).filter(Boolean) as string[])
  } catch {
    return new Set()
  }
}

/** Convert pod/deployment issues into ClusterIssue format for the index matcher */
function buildClusterIssues(
  podIssues: Array<{ name: string; namespace: string; cluster?: string; status: string; restarts: number }>,
  deploymentIssues: Array<{ name: string; namespace: string; cluster?: string; replicas: number; readyReplicas: number }>,
): ClusterIssue[] {
  const issues: ClusterIssue[] = []

  for (const p of podIssues) {
    if (p.restarts > 5) {
      issues.push({ type: 'CrashLoopBackOff', resource: p.name, namespace: p.namespace, cluster: p.cluster || '' })
    }
    if (p.status === 'OOMKilled') {
      issues.push({ type: 'OOMKilled', resource: p.name, namespace: p.namespace, cluster: p.cluster || '' })
    }
    if (p.status === 'Error' || p.status === 'Failed') {
      issues.push({ type: p.status, resource: p.name, namespace: p.namespace, cluster: p.cluster || '' })
    }
  }

  for (const d of deploymentIssues) {
    if (d.replicas > d.readyReplicas) {
      issues.push({ type: 'Unavailable', resource: d.name, namespace: d.namespace, cluster: d.cluster || '' })
    }
  }

  return issues
}

export function useMissionSuggestions() {
  const [suggestions, setSuggestions] = useState<MissionSuggestion[]>([])
  const [importSuggestions, setImportSuggestions] = useState<MissionSuggestion[]>([])
  const cancelMatchRef = useRef<(() => void) | null>(null)

  // Get data from various sources
  const { issues: podIssues } = usePodIssues()
  const { issues: deploymentIssues } = useDeploymentIssues()
  const { issues: securityIssues } = useSecurityIssues()
  const { clusters } = useClusters()
  const { nodes } = useNodes()
  const { pods } = usePods()

  // Get snooze/dismiss state - also get the raw lists to trigger reactivity
  const { isSnoozed, isDismissed, snoozedMissions, dismissedMissions } = useSnoozedMissions()

  // KB index for community import suggestions (deferred)
  const { missions: kbMissions } = useConsoleKBIndex()

  // Analyze and generate suggestions
  const analyzeAndSuggest = useCallback(() => {
    const newSuggestions: MissionSuggestion[] = []
    const now = Date.now()

    // 1. Check for pods with high restart counts
    const highRestartPods = podIssues.filter(p =>
      p.restarts && p.restarts > THRESHOLDS.restartCount
    )
    if (highRestartPods.length > 0) {
      const topPods = highRestartPods.slice(0, 5)
      const podDetails = topPods.map(p => `- ${p.name} in ${p.namespace} (${p.restarts} restarts, status: ${p.status})`).join('\n')
      newSuggestions.push({
        id: 'mission-restart-pods',
        type: 'restart',
        title: 'Investigate Restarting Pods',
        description: `${highRestartPods.length} pod${highRestartPods.length > 1 ? 's have' : ' has'} restarted ${THRESHOLDS.restartCount}+ times`,
        priority: highRestartPods.length > 5 ? 'high' : 'medium',
        action: {
          type: 'ai',
          target: `Diagnose why these ${highRestartPods.length} pods are restarting frequently:\n\n${podDetails}\n\nCheck container logs, resource limits, liveness/readiness probes, and OOM kills. Provide specific remediation steps.`,
          label: 'Diagnose',
        },
        context: {
          count: highRestartPods.length,
          details: topPods.map(p => `${p.name} in ${p.namespace} (${p.restarts} restarts)`),
        },
        detectedAt: now,
      })
    }

    // 2. Check for deployments with unavailable replicas
    const unavailableDeployments = deploymentIssues.filter(d =>
      d.replicas > d.readyReplicas
    )
    if (unavailableDeployments.length > 0) {
      const topDeployments = unavailableDeployments.slice(0, 5)
      const deploymentDetails = topDeployments.map(d => `- ${d.name} in ${d.namespace}: ${d.readyReplicas}/${d.replicas} ready`).join('\n')
      newSuggestions.push({
        id: 'mission-unavailable-deployments',
        type: 'unavailable',
        title: 'Fix Unavailable Deployments',
        description: `${unavailableDeployments.length} deployment${unavailableDeployments.length > 1 ? 's have' : ' has'} unavailable replicas`,
        priority: 'high',
        action: {
          type: 'ai',
          target: `Diagnose why these ${unavailableDeployments.length} deployments have unavailable replicas:\n\n${deploymentDetails}\n\nCheck pod status, events, resource availability, and image pull issues. Provide specific remediation steps.`,
          label: 'Diagnose',
        },
        context: {
          count: unavailableDeployments.length,
          details: topDeployments.map(d => `${d.name} in ${d.namespace}: ${d.replicas - d.readyReplicas}/${d.replicas} unavailable`),
        },
        detectedAt: now,
      })
    }

    // 3. Check for high severity security issues
    const highSeverityIssues = securityIssues.filter(i => i.severity === 'high')
    if (highSeverityIssues.length > 0) {
      const issueDetails = highSeverityIssues.slice(0, 5).map(i => `- ${i.issue} (${i.cluster || 'unknown cluster'})`).join('\n')
      newSuggestions.push({
        id: 'mission-security-high',
        type: 'security',
        title: 'Address Security Issues',
        description: `${highSeverityIssues.length} high severity security issue${highSeverityIssues.length > 1 ? 's' : ''} found`,
        priority: 'critical',
        action: {
          type: 'ai',
          target: `Analyze and help remediate ${highSeverityIssues.length} high severity security issues:\n\n${issueDetails}\n\nProvide specific remediation steps for each issue.`,
          label: 'Analyze Security',
        },
        context: {
          count: highSeverityIssues.length,
          details: highSeverityIssues.slice(0, 5).map(i => `${i.issue} (${i.cluster || 'unknown'})`),
        },
        detectedAt: now,
      })
    }

    // 4. Check for unhealthy clusters
    const unhealthyClusters = clusters.filter(c => c.reachable === false || !c.healthy)
    if (unhealthyClusters.length > 0) {
      const clusterDetails = unhealthyClusters.map(c => `- ${c.name}: ${c.reachable === false ? 'unreachable' : 'unhealthy'}${c.errorMessage ? ` (${c.errorMessage})` : ''}`).join('\n')
      newSuggestions.push({
        id: 'mission-unhealthy-clusters',
        type: 'health',
        title: 'Fix Cluster Health Issues',
        description: `${unhealthyClusters.length} cluster${unhealthyClusters.length > 1 ? 's are' : ' is'} unhealthy or unreachable`,
        priority: 'critical',
        action: {
          type: 'ai',
          target: `Diagnose health issues for ${unhealthyClusters.length} cluster(s):\n\n${clusterDetails}\n\nCheck API server connectivity, control plane health, node status, and certificate expiration. Provide troubleshooting steps.`,
          label: 'Diagnose',
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
      const samplePods = podsWithoutLimits.slice(0, 5).map(p => `- ${p.name} in ${p.namespace}`).join('\n')
      newSuggestions.push({
        id: 'mission-resource-limits',
        type: 'limits',
        title: 'Set Resource Limits',
        description: `${podsWithoutLimits.length} running pods may be missing resource limits`,
        priority: 'low',
        action: {
          type: 'ai',
          target: `Analyze ${podsWithoutLimits.length} pods that may be missing resource limits:\n\nSample pods:\n${samplePods}\n\nRecommend appropriate CPU/memory requests and limits based on workload type. Explain the risks of missing limits (OOM kills, noisy neighbors, scheduling issues).`,
          label: 'Analyze with AI',
        },
        context: {
          count: podsWithoutLimits.length,
          details: podsWithoutLimits.slice(0, 10).map(p => `${p.name} in ${p.namespace}`),
        },
        detectedAt: now,
      })
    }

    // 6. Check for nodes under resource pressure
    const pressuredNodes = nodes.filter(n => {
      const memPressure = n.conditions?.some(c => c.type === 'MemoryPressure' && c.status === 'True')
      const diskPressure = n.conditions?.some(c => c.type === 'DiskPressure' && c.status === 'True')
      return memPressure || diskPressure
    })
    if (pressuredNodes.length > 0) {
      const nodeDetails = pressuredNodes.map(n => {
        const conditions = n.conditions?.filter(c => (c.type === 'MemoryPressure' || c.type === 'DiskPressure') && c.status === 'True')
          .map(c => c.type).join(', ') || 'unknown pressure'
        return `- ${n.name}: ${conditions}`
      }).join('\n')
      newSuggestions.push({
        id: 'mission-node-pressure',
        type: 'resource',
        title: 'Address Node Resource Pressure',
        description: `${pressuredNodes.length} node${pressuredNodes.length > 1 ? 's are' : ' is'} under resource pressure`,
        priority: 'high',
        action: {
          type: 'ai',
          target: `Diagnose resource pressure on ${pressuredNodes.length} node(s):\n\n${nodeDetails}\n\nIdentify resource-hungry workloads, check for memory leaks, and recommend remediation (eviction, scaling, adding nodes).`,
          label: 'Diagnose',
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
          type: 'ai',
          target: 'Review deployments with single replicas and recommend scaling for high availability',
          label: 'Review with AI',
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

  // Lazy KB index matching — runs AFTER existing suggestions are generated
  useEffect(() => {
    if (kbMissions.length === 0) return

    // Cancel any previous matching run
    if (cancelMatchRef.current) cancelMatchRef.current()

    const clusterIssues = buildClusterIssues(podIssues, deploymentIssues)
    if (clusterIssues.length === 0) {
      setImportSuggestions([])
      return
    }

    // Detect CNCF projects from pod namespaces/names
    const detectedProjects: string[] = []
    const projectKeywords = ['istio', 'envoy', 'prometheus', 'grafana', 'argo', 'flux', 'linkerd', 'helm', 'cert-manager', 'jaeger', 'contour', 'falco', 'kyverno']
    const allNames = podIssues.map(p => `${p.name} ${p.namespace}`).join(' ').toLowerCase()
    for (const kw of projectKeywords) {
      if (allNames.includes(kw)) detectedProjects.push(kw)
    }

    // Resource kinds from deployment issues
    const resourceKinds = deploymentIssues.length > 0 ? ['Deployment'] : []
    if (podIssues.length > 0) resourceKinds.push('Pod')

    const importedTitles = getImportedMissionTitles()

    cancelMatchRef.current = lazyMatchIndex(
      kbMissions,
      clusterIssues,
      detectedProjects,
      resourceKinds,
      (results: IndexMatchResult[], _done: boolean) => {
        const now = Date.now()
        const newImports: MissionSuggestion[] = results
          .filter(r => !importedTitles.has(r.mission.title))
          .slice(0, MAX_IMPORT_SUGGESTIONS)
          .map(r => ({
            id: `kb-import-${r.mission.path.replace(/[^a-zA-Z0-9]/g, '-')}`,
            type: 'import' as const,
            title: r.mission.title,
            description: r.reasons.slice(0, 2).join('. ') || r.mission.description,
            priority: 'medium' as const,
            action: {
              type: 'import' as const,
              target: r.mission.path,
              label: 'Import Mission',
            },
            context: {
              details: r.reasons,
              ...(r.matchedIssue && {
                cluster: r.matchedIssue.cluster,
                namespace: r.matchedIssue.namespace,
                resource: r.matchedIssue.resource,
              }),
            },
            detectedAt: now,
          }))
        setImportSuggestions(newImports)
      },
    )

    return () => {
      if (cancelMatchRef.current) {
        cancelMatchRef.current()
        cancelMatchRef.current = null
      }
    }
  }, [kbMissions, podIssues, deploymentIssues])

  // Merge core suggestions with import suggestions
  const mergedSuggestions = useMemo(() => {
    return [...suggestions, ...importSuggestions]
  }, [suggestions, importSuggestions])

  // Filter out snoozed and dismissed suggestions
  // Include snoozedMissions and dismissedMissions in deps to trigger re-filter on snooze changes
  const visibleSuggestions = useMemo(() => {
    return mergedSuggestions.filter(s => !isSnoozed(s.id) && !isDismissed(s.id))
  }, [mergedSuggestions, isSnoozed, isDismissed, snoozedMissions, dismissedMissions])

  // Stats
  const stats = useMemo(() => ({
    total: mergedSuggestions.length,
    visible: visibleSuggestions.length,
    critical: visibleSuggestions.filter(s => s.priority === 'critical').length,
    high: visibleSuggestions.filter(s => s.priority === 'high').length,
  }), [mergedSuggestions, visibleSuggestions])

  return {
    suggestions: visibleSuggestions,
    allSuggestions: mergedSuggestions,
    hasSuggestions: visibleSuggestions.length > 0,
    stats,
    refresh: analyzeAndSuggest,
  }
}
