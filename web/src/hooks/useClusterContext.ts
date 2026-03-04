/**
 * useClusterContext – aggregates live cluster data into the shape
 * that matchMissionsToCluster() expects for contextual recommendations.
 *
 * Combines: clusters, operators, helm releases, pod issues, security issues.
 * Returns null when no clusters are connected (triggers generic mode).
 */

import { useMemo } from 'react'
import { useClusters } from './mcp/clusters'
import { useOperators } from './mcp/operators'
import { useHelmReleases } from './mcp/helm'
import { usePodIssues } from './mcp/workloads'
import { useSecurityIssues } from './mcp/security'

export interface ClusterContext {
  name: string
  provider?: string
  version?: string
  resources: string[]
  issues: string[]
  labels: Record<string, string>
}

export function useClusterContext(): {
  clusterContext: ClusterContext | null
  isLoading: boolean
} {
  const { deduplicatedClusters, isLoading: clustersLoading } = useClusters()
  const { operators, isLoading: operatorsLoading } = useOperators()
  const { releases, isLoading: helmLoading } = useHelmReleases()
  const { issues: podIssues, isLoading: podLoading } = usePodIssues()
  const { issues: securityIssues, isLoading: securityLoading } = useSecurityIssues()

  const isLoading = clustersLoading || operatorsLoading || helmLoading || podLoading || securityLoading

  const clusterContext = useMemo(() => {
    const healthyClusters = deduplicatedClusters.filter(c => c.healthy)
    if (healthyClusters.length === 0) return null

    // Pick primary cluster (current context or first healthy)
    const primary = healthyClusters.find(c => c.isCurrent) ?? healthyClusters[0]

    // Build resources[] from operators + helm releases
    const resources = new Set<string>()
    for (const op of (operators || [])) {
      resources.add(op.name.toLowerCase())
      // Extract base name (e.g. "prometheus-operator" → "prometheus")
      const base = op.name.replace(/-operator$/, '').replace(/-controller$/, '').toLowerCase()
      if (base !== op.name.toLowerCase()) resources.add(base)
    }
    for (const rel of (releases || [])) {
      resources.add(rel.name.toLowerCase())
      // Extract chart base name (e.g. "prometheus-25.8.0" → "prometheus")
      const chartBase = rel.chart.replace(/-[\d.]+$/, '').toLowerCase()
      if (chartBase) resources.add(chartBase)
    }

    // Build issues[] from pod issues + security issues
    const issues = new Set<string>()
    for (const pi of (podIssues || [])) {
      for (const issue of (pi.issues || [])) {
        issues.add(issue)
      }
      if (pi.status && pi.status !== 'Running') {
        issues.add(pi.status)
      }
    }
    for (const si of (securityIssues || [])) {
      issues.add(si.issue)
    }

    // Build labels from cluster metadata + namespaces
    const labels: Record<string, string> = {}
    if (primary.distribution) {
      labels['distribution'] = primary.distribution
    }
    // Add namespace-derived labels (presence of monitoring/istio-system etc.)
    for (const cluster of (healthyClusters || [])) {
      if (cluster.namespaces) {
        for (const ns of (cluster.namespaces || [])) {
          if (ns.includes('istio')) labels['cncf.io/project'] = 'istio'
          if (ns.includes('linkerd')) labels['cncf.io/project'] = 'linkerd'
          if (ns.includes('monitoring') || ns.includes('prometheus')) labels['monitoring'] = 'true'
          if (ns.includes('cert-manager')) labels['cert-manager'] = 'true'
        }
      }
    }

    // Derive provider from distribution or cluster name
    const provider = deriveProvider(primary.distribution, primary.name)

    return {
      name: primary.name,
      provider,
      version: primary.namespaces ? undefined : undefined, // version not directly available
      resources: Array.from(resources),
      issues: Array.from(issues),
      labels,
    }
  }, [deduplicatedClusters, operators, releases, podIssues, securityIssues])

  return { clusterContext, isLoading }
}

/** Derive cloud provider from distribution string or cluster name */
function deriveProvider(distribution?: string, name?: string): string | undefined {
  const d = (distribution ?? '').toLowerCase()
  const n = (name ?? '').toLowerCase()
  if (d.includes('eks') || n.includes('eks')) return 'eks'
  if (d.includes('gke') || n.includes('gke')) return 'gke'
  if (d.includes('aks') || n.includes('aks')) return 'aks'
  if (d.includes('openshift') || d.includes('ocp')) return 'openshift'
  if (d.includes('k3s') || n.includes('k3s')) return 'k3s'
  if (d.includes('kind') || n.includes('kind')) return 'kind'
  if (d.includes('minikube') || n.includes('minikube')) return 'minikube'
  if (d.includes('rke') || n.includes('rke')) return 'rke'
  return undefined
}
