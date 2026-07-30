import type { ClusterDataCache, NamespaceResources, TreeLens, IssueCounts } from './types'

/**
 * Default restart count used when seeding a pod row from the podIssues
 * endpoint, which does not report restart counts. Keeping this as a named
 * constant avoids a magic number in the merge logic below.
 */
const POD_ISSUE_DEFAULT_RESTARTS = 0

/** Factory that returns an empty NamespaceResources record. */
function createEmptyNamespaceResources(): NamespaceResources {
  return {
    deployments: [],
    services: [],
    pvcs: [],
    pods: [],
    configmaps: [],
    secrets: [],
    serviceaccounts: [],
    jobs: [],
    hpas: [],
    replicasets: [],
    statefulsets: [],
    daemonsets: [],
    cronjobs: [],
    ingresses: [],
    networkpolicies: [],
  }
}

/**
 * Returns true when a pod row represents an issue (not Running/Succeeded).
 * Centralizing this keeps the "what counts as a pod issue" definition in
 * sync between the namespace filter and the namespace badge.
 */
function isPodIssueStatus(status: string): boolean {
  return status !== 'Running' && status !== 'Succeeded'
}

/**
 * Build a map of namespace -> resources from cached cluster data.
 * Optionally filters namespaces by a search query.
 *
 * Pods from clusterData.podIssues (a separate API endpoint than the bulk
 * pods list) are merged into each namespace's pods so the Issues lens and
 * the top-of-card issues badge stay in sync. Without this merge, the badge
 * could report "1 issue" while the tree collapsed to an empty state when
 * the issue-bearing pod was not present in the limited bulk pods response.
 */
export function buildNamespaceResources(clusterData: ClusterDataCache, searchFilter: string): Map<string, NamespaceResources> {
  const map = new Map<string, NamespaceResources>()

  const query = searchFilter ? searchFilter.toLowerCase() : ''
  const matchesSearch = (ns: string): boolean => !query || ns.toLowerCase().includes(query)

  // Filter namespaces based on search, then initialize records
  const namespaces = (clusterData.namespaces || []).filter(matchesSearch)
  namespaces.forEach((ns: string) => {
    map.set(ns, createEmptyNamespaceResources())
  })

  // Ensure namespaces that appear only in podIssues are still represented.
  // Otherwise a pod issue in a namespace missing from the bulk namespace
  // listing would silently disappear from the Issues lens.
  for (const p of clusterData.podIssues || []) {
    if (!map.has(p.namespace) && matchesSearch(p.namespace)) {
      map.set(p.namespace, createEmptyNamespaceResources())
    }
  }

  // Group deployments
  for (const d of clusterData.deployments) {
    const nsData = map.get(d.namespace)
    if (nsData) {
      nsData.deployments.push(d)
    }
  }

  // Group services
  for (const s of clusterData.services) {
    const nsData = map.get(s.namespace)
    if (nsData) {
      nsData.services.push(s)
    }
  }

  // Group PVCs
  for (const p of clusterData.pvcs) {
    const nsData = map.get(p.namespace)
    if (nsData) {
      nsData.pvcs.push(p)
    }
  }

  // Group pods
  for (const p of clusterData.pods) {
    const nsData = map.get(p.namespace)
    if (nsData) {
      nsData.pods.push({
        name: p.name,
        namespace: p.namespace,
        status: p.status,
        restarts: p.restarts,
      })
    }
  }

  // Merge podIssues into namespace pods. The bulk pods list is capped per
  // request and may omit pods that are included in the dedicated podIssues
  // endpoint. Dedupe by (namespace, name) so we do not double-count pods
  // that exist in both lists.
  for (const issue of clusterData.podIssues || []) {
    const nsData = map.get(issue.namespace)
    if (!nsData) continue
    const alreadyPresent = nsData.pods.some(
      existing => existing.name === issue.name,
    )
    if (alreadyPresent) continue
    nsData.pods.push({
      name: issue.name,
      namespace: issue.namespace,
      status: issue.status,
      restarts: POD_ISSUE_DEFAULT_RESTARTS,
    })
  }

  // Group ConfigMaps
  for (const cm of clusterData.configmaps) {
    const nsData = map.get(cm.namespace)
    if (nsData) {
      nsData.configmaps.push({
        name: cm.name,
        namespace: cm.namespace,
        dataCount: cm.dataCount || 0,
      })
    }
  }

  // Group Secrets
  for (const s of clusterData.secrets) {
    const nsData = map.get(s.namespace)
    if (nsData) {
      nsData.secrets.push({
        name: s.name,
        namespace: s.namespace,
        type: s.type || 'Opaque',
      })
    }
  }

  // Group ServiceAccounts
  for (const sa of clusterData.serviceaccounts) {
    const nsData = map.get(sa.namespace)
    if (nsData) {
      nsData.serviceaccounts.push({
        name: sa.name,
        namespace: sa.namespace,
      })
    }
  }

  // Group Jobs
  for (const j of clusterData.jobs) {
    const nsData = map.get(j.namespace)
    if (nsData) {
      nsData.jobs.push({
        name: j.name,
        namespace: j.namespace,
        status: j.status,
        completions: j.completions,
        duration: j.duration,
      })
    }
  }

  // Group HPAs
  for (const h of clusterData.hpas) {
    const nsData = map.get(h.namespace)
    if (nsData) {
      nsData.hpas.push({
        name: h.name,
        namespace: h.namespace,
        reference: h.reference,
        minReplicas: h.minReplicas,
        maxReplicas: h.maxReplicas,
        currentReplicas: h.currentReplicas,
      })
    }
  }

  // Group ReplicaSets
  for (const rs of clusterData.replicasets) {
    const nsData = map.get(rs.namespace)
    if (nsData) {
      nsData.replicasets.push(rs)
    }
  }

  // Group StatefulSets
  for (const ss of clusterData.statefulsets) {
    const nsData = map.get(ss.namespace)
    if (nsData) {
      nsData.statefulsets.push(ss)
    }
  }

  // Group DaemonSets
  for (const ds of clusterData.daemonsets) {
    const nsData = map.get(ds.namespace)
    if (nsData) {
      nsData.daemonsets.push(ds)
    }
  }

  // Group CronJobs
  for (const cj of clusterData.cronjobs) {
    const nsData = map.get(cj.namespace)
    if (nsData) {
      nsData.cronjobs.push(cj)
    }
  }

  // Group Ingresses
  for (const ing of clusterData.ingresses) {
    const nsData = map.get(ing.namespace)
    if (nsData) {
      nsData.ingresses.push(ing)
    }
  }

  // Group NetworkPolicies
  for (const np of clusterData.networkpolicies) {
    const nsData = map.get(np.namespace)
    if (nsData) {
      nsData.networkpolicies.push(np)
    }
  }

  return map
}

/**
 * Filter namespaces to show based on the active lens and search filter.
 * Hides system namespaces unless the user is searching.
 */
export function getVisibleNamespaces(
  namespaceResources: Map<string, NamespaceResources>,
  activeLens: TreeLens,
  searchFilter: string,
): string[] {
  const namespaces = Array.from(namespaceResources.keys())

  // Always filter out system namespaces unless searching
  let filtered = searchFilter
    ? namespaces
    : namespaces.filter(ns => !ns.startsWith('kube-') && ns !== 'openshift' && !ns.startsWith('openshift-'))

  // Apply lens filter
  if (activeLens === 'issues') {
    filtered = filtered.filter(ns => {
      const resources = namespaceResources.get(ns)!
      return resources.pods.some(p => isPodIssueStatus(p.status)) ||
             resources.deployments.some(d => d.readyReplicas < d.replicas) ||
             resources.pvcs.some(p => p.status !== 'Bound')
    })
  } else if (activeLens === 'workloads') {
    filtered = filtered.filter(ns => {
      const resources = namespaceResources.get(ns)!
      return resources.deployments.length > 0 || resources.pods.length > 0
    })
  } else if (activeLens === 'storage') {
    filtered = filtered.filter(ns => {
      const resources = namespaceResources.get(ns)!
      return resources.pvcs.length > 0
    })
  } else if (activeLens === 'network') {
    filtered = filtered.filter(ns => {
      const resources = namespaceResources.get(ns)!
      return resources.services.length > 0
    })
  }

  return filtered.sort()
}

/**
 * Count issues for badge display from cached cluster data.
 */
export function getIssueCounts(clusterData: ClusterDataCache): IssueCounts {
  const counts: IssueCounts = {
    nodes: clusterData.nodes.filter(n => n.status !== 'Ready').length,
    deployments: clusterData.deployments.filter(d => d.readyReplicas < d.replicas).length,
    pods: clusterData.podIssues.length,
    pvcs: clusterData.pvcs.filter(p => p.status !== 'Bound').length,
    total: 0,
  }
  counts.total = counts.nodes + counts.deployments + counts.pods + counts.pvcs
  return counts
}

/**
 * Get pods for a specific deployment by name prefix matching.
 * Uses the standard naming pattern for pods created by ReplicaSets.
 */
export function getPodsForDeployment(
  namespaceResources: Map<string, NamespaceResources>,
  deploymentName: string,
  namespace: string,
): Array<{ name: string; namespace: string; status: string; restarts: number }> {
  const nsData = namespaceResources.get(namespace)
  if (!nsData) return []
  // Match pods whose names start with deployment name followed by a dash and hash
  return nsData.pods.filter(p => p.name.startsWith(`${deploymentName}-`))
}
