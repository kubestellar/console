/**
 * CNCF Project → Monitoring Card Mapping
 *
 * Maps deployed CNCF projects to relevant monitoring cards for
 * Ground Control dashboard auto-generation.
 *
 * Two-tier strategy:
 *   1. Direct mapping: specific project → specific cards
 *   2. Category fallback: CNCF landscape category → generic cards
 *   3. Baseline: always-included cards for every Ground Control dashboard
 */

/** Cards included on every Ground Control dashboard regardless of project */
const BASELINE_CARDS: readonly string[] = [
  'cluster_health',
  'event_stream',
  'pod_issues',
]

/**
 * Direct CNCF project name → card type mappings.
 * Keys match the `cncfProject` field from MissionExport / PayloadProject.
 */
const PROJECT_TO_CARDS: Record<string, readonly string[]> = {
  // Observability
  prometheus: ['active_alerts', 'alert_rules', 'cluster_metrics'],
  'prometheus-operator': ['active_alerts', 'alert_rules'],
  grafana: ['cluster_metrics', 'resource_trend'],
  jaeger: ['event_stream', 'service_status'],
  fluentd: ['event_stream', 'namespace_events'],

  // GitOps / CD
  argocd: ['argocd_applications', 'argocd_sync_status', 'argocd_health'],
  'argo-cd': ['argocd_applications', 'argocd_sync_status', 'argocd_health'],
  flux: ['kustomization_status', 'gitops_drift', 'helm_release_status'],

  // Security
  falco: ['falco_alerts', 'security_issues'],
  trivy: ['trivy_scan', 'security_issues'],
  kubescape: ['kubescape_scan', 'security_issues'],
  kyverno: ['kyverno_policies', 'policy_violations'],
  opa: ['opa_policies', 'policy_violations'],
  'cert-manager': ['cert_manager'],
  vault: ['vault_secrets', 'external_secrets'],

  // Networking
  istio: ['service_status', 'network_overview', 'gateway_status'],
  envoy: ['network_overview', 'service_status'],
  cilium: ['network_policy_status', 'network_overview'],
  linkerd: ['service_status', 'network_overview'],

  // Storage
  longhorn: ['pvc_status', 'storage_overview', 'pv_status'],
  rook: ['storage_overview', 'pvc_status'],

  // Autoscaling / Workloads
  keda: ['hpa_status', 'deployment_status'],
  'knative-serving': ['deployment_status', 'service_status'],

  // Cost
  opencost: ['opencost_overview'],
  kubecost: ['kubecost_overview'],

  // Helm / Package Management
  helm: ['helm_release_status', 'helm_history', 'chart_versions'],

  // Operators
  kubevirt: ['kubevirt_status'],
  crossplane: ['operator_status', 'crd_health'],

  // AI/ML
  ray: ['ml_jobs', 'gpu_utilization', 'gpu_workloads'],
  kubeflow: ['ml_notebooks', 'ml_jobs'],
  vllm: ['llm_inference', 'gpu_utilization'],

  // Multi-cluster
  karmada: ['cluster_comparison', 'cluster_health'],
  kubestellar: ['cluster_health', 'cluster_comparison', 'service_imports', 'service_exports'],
  kcp: ['cluster_health', 'namespace_status'],
}

/**
 * CNCF landscape category → generic card type fallback.
 * Used when no direct project mapping exists.
 */
const CATEGORY_TO_CARDS: Record<string, readonly string[]> = {
  'Observability': ['cluster_metrics', 'event_stream', 'pod_health_trend', 'resource_trend'],
  'Orchestration': ['cluster_health', 'deployment_status', 'app_status'],
  'Runtime': ['compute_overview', 'resource_capacity', 'pod_issues'],
  'Security': ['security_issues', 'namespace_rbac', 'policy_violations'],
  'Networking': ['network_overview', 'service_status', 'ingress_status'],
  'Storage': ['storage_overview', 'pvc_status', 'pv_status'],
  'Service Mesh': ['service_status', 'network_overview', 'gateway_status'],
  'App Definition': ['deployment_status', 'deployment_progress', 'deployment_issues'],
  'Serverless': ['deployment_status', 'resource_usage', 'hpa_status'],
  'Streaming': ['event_stream', 'warning_events'],
  'Provisioning': ['node_status', 'resource_capacity', 'compute_overview'],
}

export interface ProjectCardMappingResult {
  /** Card type IDs to include on the Ground Control dashboard */
  cards: string[]
  /** Whether a direct project→card mapping was found (vs category fallback) */
  hasDirectMapping: boolean
}

/**
 * Get monitoring cards relevant to a deployed CNCF project.
 *
 * Strategy:
 *   1. If `cncfProject` has a direct mapping → use it
 *   2. Else if `category` has a fallback mapping → use it
 *   3. Always merge with BASELINE_CARDS
 *   4. Deduplicate
 */
export function getMonitoringCardsForProject(
  cncfProject?: string,
  category?: string,
): ProjectCardMappingResult {
  const projectKey = cncfProject?.toLowerCase().replace(/\s+/g, '-')
  const directCards = projectKey ? PROJECT_TO_CARDS[projectKey] : undefined

  if (directCards) {
    const merged = [...new Set([...BASELINE_CARDS, ...directCards])]
    return { cards: merged, hasDirectMapping: true }
  }

  const categoryCards = category ? CATEGORY_TO_CARDS[category] : undefined
  if (categoryCards) {
    const merged = [...new Set([...BASELINE_CARDS, ...categoryCards])]
    return { cards: merged, hasDirectMapping: false }
  }

  return { cards: [...BASELINE_CARDS], hasDirectMapping: false }
}

/**
 * Get monitoring cards for multiple projects (from a Mission Control payload).
 * Merges and deduplicates cards across all projects.
 */
export function getMonitoringCardsForProjects(
  projects: Array<{ cncfProject?: string; category?: string }>,
): ProjectCardMappingResult {
  const allCards = new Set<string>(BASELINE_CARDS)
  let hasAnyDirectMapping = false

  for (const project of projects || []) {
    const result = getMonitoringCardsForProject(project.cncfProject, project.category)
    for (const card of result.cards) allCards.add(card)
    if (result.hasDirectMapping) hasAnyDirectMapping = true
  }

  return { cards: [...allCards], hasDirectMapping: hasAnyDirectMapping }
}
