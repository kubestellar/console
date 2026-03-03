/**
 * Mission Matcher
 *
 * Matches missions to cluster characteristics for "Recommended for You" section.
 */

import type { MissionExport, MissionMatch } from './types'

interface ClusterInfo {
  name: string
  provider?: string
  version?: string
  resources?: string[]
  issues?: string[]
  labels?: Record<string, string>
}

/**
 * Map operator/helm names to related CNCF project keywords for cross-matching.
 * E.g., having "prometheus-operator" installed should boost prometheus/alertmanager missions.
 */
const RESOURCE_TO_PROJECTS: Record<string, string[]> = {
  prometheus: ['prometheus', 'alertmanager', 'monitoring', 'grafana', 'thanos'],
  grafana: ['grafana', 'monitoring', 'observability', 'dashboards'],
  'cert-manager': ['cert-manager', 'certificates', 'tls', 'lets-encrypt'],
  istio: ['istio', 'service-mesh', 'envoy', 'traffic-management'],
  linkerd: ['linkerd', 'service-mesh'],
  'ingress-nginx': ['ingress', 'nginx', 'load-balancing'],
  argocd: ['argocd', 'gitops', 'continuous-delivery'],
  'argo-workflows': ['argo', 'workflows', 'ci-cd'],
  flux: ['flux', 'gitops', 'continuous-delivery'],
  vault: ['vault', 'secrets', 'security', 'hashicorp'],
  'external-secrets': ['secrets', 'external-secrets', 'security'],
  falco: ['falco', 'security', 'runtime-security'],
  trivy: ['trivy', 'security', 'vulnerability-scanning'],
  redis: ['redis', 'caching', 'data'],
  elasticsearch: ['elasticsearch', 'logging', 'elk', 'observability'],
  jaeger: ['jaeger', 'tracing', 'observability'],
  'open-telemetry': ['opentelemetry', 'tracing', 'observability'],
  keda: ['keda', 'autoscaling', 'scaling'],
  knative: ['knative', 'serverless', 'eventing'],
  harbor: ['harbor', 'registry', 'container-registry'],
  velero: ['velero', 'backup', 'disaster-recovery'],
  crossplane: ['crossplane', 'infrastructure', 'multi-cloud'],
  kubestellar: ['kubestellar', 'multi-cluster', 'edge'],
}

/** Map issue patterns to solution categories */
const ISSUE_TO_CATEGORIES: Record<string, string[]> = {
  crashloopbackoff: ['troubleshoot', 'debugging', 'pod-restart'],
  oomkilled: ['resources', 'memory', 'limits', 'troubleshoot'],
  imagepullbackoff: ['registry', 'container-images', 'troubleshoot'],
  'privileged container': ['security', 'pod-security', 'hardening'],
  'host network': ['security', 'network-policy', 'hardening'],
  'no resource limits': ['resources', 'best-practices', 'limits'],
  pending: ['scheduling', 'resources', 'node-capacity'],
  evicted: ['resources', 'node-pressure', 'troubleshoot'],
}

/**
 * Score and rank missions against cluster data.
 * Returns missions sorted by match score (highest first).
 * Always returns results — uses baseline scoring when no cluster matches exist.
 */
export function matchMissionsToCluster(
  missions: MissionExport[],
  cluster: ClusterInfo | null
): MissionMatch[] {
  // Pre-compute expanded resource keywords from installed resources
  const expandedKeywords = new Set<string>()
  if (cluster?.resources) {
    for (const r of cluster.resources) {
      expandedKeywords.add(r.toLowerCase())
      // Expand via known mappings
      for (const [key, projects] of Object.entries(RESOURCE_TO_PROJECTS)) {
        if (r.toLowerCase().includes(key)) {
          for (const p of projects) expandedKeywords.add(p)
        }
      }
    }
  }

  // Pre-compute issue categories
  const issueCategories = new Set<string>()
  if (cluster?.issues) {
    for (const issue of cluster.issues) {
      const issueLower = issue.toLowerCase()
      for (const [pattern, categories] of Object.entries(ISSUE_TO_CATEGORIES)) {
        if (issueLower.includes(pattern)) {
          for (const cat of categories) issueCategories.add(cat)
        }
      }
    }
  }

  const results: MissionMatch[] = []

  for (const mission of missions) {
    let score = 0
    const matchReasons: string[] = []

    if (cluster) {
      // Match by tags against cluster resources (direct + expanded keywords)
      if (mission.tags && expandedKeywords.size > 0) {
        for (const tag of mission.tags) {
          if (expandedKeywords.has(tag.toLowerCase())) {
            score += 20
            matchReasons.push(`Tag "${tag}" matches cluster resource`)
          }
        }
      }

      // Match mission category/tags against issue-derived categories
      if (issueCategories.size > 0) {
        const missionKeywords = [
          ...(mission.tags ?? []),
          mission.category ?? '',
          mission.type ?? '',
        ].map(s => s.toLowerCase())
        for (const kw of missionKeywords) {
          if (kw && issueCategories.has(kw)) {
            score += 35
            matchReasons.push(`Relevant to detected cluster issue`)
            break
          }
        }
      }

      // Match by CNCF project against cluster labels + expanded keywords
      if (mission.cncfProject) {
        const projectLower = mission.cncfProject.toLowerCase()
        if (expandedKeywords.has(projectLower)) {
          score += 30
          matchReasons.push(`CNCF project "${mission.cncfProject}" is installed`)
        } else if (cluster.labels) {
          for (const [key, value] of Object.entries(cluster.labels)) {
            if (
              key.toLowerCase().includes(projectLower) ||
              value.toLowerCase().includes(projectLower)
            ) {
              score += 30
              matchReasons.push(`CNCF project "${mission.cncfProject}" found in cluster labels`)
              break
            }
          }
        }
      }

      // Match troubleshoot missions against cluster issues (direct text match)
      if (mission.type === 'troubleshoot' && cluster.issues) {
        const descLower = mission.description.toLowerCase()
        for (const issue of cluster.issues) {
          if (descLower.includes(issue.toLowerCase())) {
            score += 40
            matchReasons.push(`Addresses cluster issue: ${issue}`)
          }
        }
      }

      // Match upgrade missions against version
      if (mission.type === 'upgrade' && cluster.version) {
        const descLower = mission.description.toLowerCase()
        if (descLower.includes(cluster.version) || descLower.includes('upgrade')) {
          score += 15
          matchReasons.push('Relevant to cluster version')
        }
      }

      // Boost deploy missions for matching provider
      if (mission.type === 'deploy' && cluster.provider && mission.tags) {
        if (mission.tags.some((t) => t.toLowerCase() === cluster.provider?.toLowerCase())) {
          score += 25
          matchReasons.push(`Matches cluster provider: ${cluster.provider}`)
        }
      }
    }

    // Baseline: score by engagement metadata (reactions, comments) so popular missions surface
    const meta = (mission as unknown as Record<string, unknown>).metadata as Record<string, unknown> | undefined
    const reactions = Number(meta?.reactions) || 0
    const comments = Number(meta?.comments) || 0
    if (reactions >= 20) {
      score += 10
      matchReasons.push(`High engagement (${reactions} reactions)`)
    } else if (reactions >= 5) {
      score += 5
      matchReasons.push(`${reactions} reactions`)
    }
    if (comments >= 10) {
      score += 5
    }

    // Minimum score of 1 so all missions are included — build descriptive reason
    if (score === 0) {
      score = 1
    }
    if (matchReasons.length === 0) {
      const parts: string[] = []
      if (mission.cncfProject) parts.push(mission.cncfProject)
      if (mission.category) parts.push(mission.category)
      if (parts.length > 0) {
        matchReasons.push(`CNCF community · ${parts.join(' · ')}`)
      } else {
        matchReasons.push('CNCF community mission')
      }
    }

    results.push({ mission, score, matchPercent: 0, matchReasons })
  }

  results.sort((a, b) => b.score - a.score)
  const maxScore = results[0]?.score || 1
  for (const r of results) {
    r.matchPercent = Math.round((r.score / maxScore) * 100)
  }

  return results
}
