// Pod security posture summary used by the "Analyze Cluster & Suggest Policies" flow.
// Extracted from CreatePolicyModal.tsx (issue #24058) — logic unchanged.

export interface PodSecuritySummary {
  securitySummary: string
  resourceLimitsSummary: string
}

/** Summarizes privileged / hostNetwork / root / missing-limit findings from `kubectl get pods -A -o json` output. */
export function summarizePodSecurity(podsOutput: string): PodSecuritySummary {
  const podsData = JSON.parse(podsOutput)
  const pods = podsData.items || []

  // Analyze security issues
  let privilegedCount = 0
  let hostNetworkCount = 0
  let runAsRootCount = 0
  let noLimitsCount = 0
  const issueDetails: string[] = []

  for (const pod of pods) {
    const ns = pod.metadata?.namespace || 'unknown'
    // Skip system namespaces
    if (ns.startsWith('kube-') || ns === 'gatekeeper-system') continue

    if (pod.spec?.hostNetwork) {
      hostNetworkCount++
      issueDetails.push(`- Pod ${ns}/${pod.metadata?.name}: uses hostNetwork`)
    }

    for (const container of (pod.spec?.containers || [])) {
      if (container.securityContext?.privileged) {
        privilegedCount++
        issueDetails.push(`- Container ${container.name} in ${ns}/${pod.metadata?.name}: runs privileged`)
      }
      if (container.securityContext?.runAsUser === 0 ||
          (!container.securityContext?.runAsNonRoot && !pod.spec?.securityContext?.runAsNonRoot)) {
        runAsRootCount++
      }
      if (!container.resources?.limits?.cpu || !container.resources?.limits?.memory) {
        noLimitsCount++
      }
    }
  }

  const securitySummary = [
    `Privileged containers: ${privilegedCount}`,
    `Host network pods: ${hostNetworkCount}`,
    `Containers potentially running as root: ${runAsRootCount}`,
    ...(issueDetails.length > 0 ? ['', 'Details (first 10):', ...issueDetails.slice(0, 10)] : []),
  ].join('\n')

  const resourceLimitsSummary = `Containers without CPU/memory limits: ${noLimitsCount}`
  return { securitySummary, resourceLimitsSummary }
}
