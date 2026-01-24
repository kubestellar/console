// Dashboard templates with pre-configured cards for common use cases

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'cluster' | 'namespace' | 'workloads' | 'gitops' | 'security' | 'gpu' | 'storage' | 'compute' | 'network' | 'klaude' | 'alerting' | 'cost' | 'compliance' | 'custom'
  cards: Array<{
    card_type: string
    title?: string
    config?: Record<string, unknown>
    position: { w: number; h: number }
  }>
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  // Cluster-focused templates
  {
    id: 'cluster-overview',
    name: 'Cluster Overview',
    description: 'Health, resources, and issues across all clusters',
    icon: '🌐',
    category: 'cluster',
    cards: [
      { card_type: 'cluster_health', position: { w: 4, h: 2 } },
      { card_type: 'compute_overview', position: { w: 4, h: 3 } },
      { card_type: 'storage_overview', position: { w: 4, h: 3 } },
      { card_type: 'network_overview', position: { w: 4, h: 3 } },
      { card_type: 'pod_issues', position: { w: 6, h: 2 } },
      { card_type: 'deployment_issues', position: { w: 6, h: 2 } },
    ],
  },
  {
    id: 'cluster-resource-tree',
    name: 'Resource Explorer',
    description: 'Hierarchical tree view of all cluster resources',
    icon: '🌳',
    category: 'cluster',
    cards: [
      { card_type: 'cluster_resource_tree', position: { w: 12, h: 6 } },
    ],
  },
  {
    id: 'cluster-comparison',
    name: 'Cluster Comparison',
    description: 'Compare metrics and resources across clusters',
    icon: '⚖️',
    category: 'cluster',
    cards: [
      { card_type: 'cluster_comparison', position: { w: 8, h: 3 } },
      { card_type: 'cluster_costs', position: { w: 4, h: 3 } },
      { card_type: 'resource_capacity', position: { w: 6, h: 2 } },
      { card_type: 'cluster_network', position: { w: 6, h: 2 } },
    ],
  },
  {
    id: 'single-cluster-focus',
    name: 'Single Cluster Focus',
    description: 'Deep dive into a specific cluster',
    icon: '🔍',
    category: 'cluster',
    cards: [
      { card_type: 'cluster_focus', position: { w: 6, h: 3 } },
      { card_type: 'cluster_network', position: { w: 6, h: 3 } },
      { card_type: 'event_stream', position: { w: 4, h: 2 } },
      { card_type: 'deployment_status', position: { w: 4, h: 2 } },
      { card_type: 'upgrade_status', position: { w: 4, h: 2 } },
    ],
  },

  // Namespace-focused templates
  {
    id: 'namespace-dashboard',
    name: 'Namespace Dashboard',
    description: 'Quotas, RBAC, and events for a namespace',
    icon: '📁',
    category: 'namespace',
    cards: [
      { card_type: 'namespace_overview', position: { w: 6, h: 2 } },
      { card_type: 'namespace_quotas', position: { w: 6, h: 2 } },
      { card_type: 'namespace_rbac', position: { w: 6, h: 3 } },
      { card_type: 'namespace_events', position: { w: 6, h: 3 } },
    ],
  },

  // GitOps templates
  {
    id: 'gitops-overview',
    name: 'GitOps Overview',
    description: 'Helm releases, Kustomizations, and drift detection',
    icon: '🔄',
    category: 'gitops',
    cards: [
      { card_type: 'gitops_drift', position: { w: 4, h: 2 } },
      { card_type: 'helm_release_status', position: { w: 4, h: 2 } },
      { card_type: 'kustomization_status', position: { w: 4, h: 2 } },
      { card_type: 'chart_versions', position: { w: 6, h: 3 } },
      { card_type: 'helm_history', position: { w: 6, h: 3 } },
    ],
  },
  {
    id: 'helm-management',
    name: 'Helm Management',
    description: 'Complete Helm releases management',
    icon: '⚓',
    category: 'gitops',
    cards: [
      { card_type: 'helm_release_status', position: { w: 6, h: 3 } },
      { card_type: 'chart_versions', position: { w: 6, h: 3 } },
      { card_type: 'helm_history', position: { w: 6, h: 3 } },
      { card_type: 'helm_values_diff', position: { w: 6, h: 3 } },
    ],
  },
  {
    id: 'flux-dashboard',
    name: 'Flux Dashboard',
    description: 'Kustomizations and overlay management',
    icon: '🌊',
    category: 'gitops',
    cards: [
      { card_type: 'kustomization_status', position: { w: 6, h: 3 } },
      { card_type: 'overlay_comparison', position: { w: 6, h: 3 } },
      { card_type: 'gitops_drift', position: { w: 6, h: 2 } },
      { card_type: 'event_stream', position: { w: 6, h: 2 } },
    ],
  },
  {
    id: 'argocd-dashboard',
    name: 'ArgoCD Dashboard',
    description: 'Monitor ArgoCD applications, sync status, and health',
    icon: '🐙',
    category: 'gitops',
    cards: [
      { card_type: 'argocd_applications', position: { w: 6, h: 3 } },
      { card_type: 'argocd_sync_status', position: { w: 3, h: 2 } },
      { card_type: 'argocd_health', position: { w: 3, h: 2 } },
      { card_type: 'gitops_drift', position: { w: 6, h: 2 } },
    ],
  },

  // Security templates
  {
    id: 'security-overview',
    name: 'Security Overview',
    description: 'Security issues and RBAC across clusters',
    icon: '🔒',
    category: 'security',
    cards: [
      { card_type: 'security_issues', position: { w: 6, h: 3 } },
      { card_type: 'namespace_rbac', position: { w: 6, h: 3 } },
      { card_type: 'event_stream', title: 'Security Events', config: { filter: 'security' }, position: { w: 12, h: 2 } },
    ],
  },

  // Operator templates
  {
    id: 'operator-management',
    name: 'Operator Management',
    description: 'OLM operators, subscriptions, and CRDs',
    icon: '📦',
    category: 'custom',
    cards: [
      { card_type: 'operator_status', position: { w: 4, h: 3 } },
      { card_type: 'operator_subscriptions', position: { w: 4, h: 3 } },
      { card_type: 'crd_health', position: { w: 4, h: 3 } },
    ],
  },

  // GPU templates
  {
    id: 'gpu-dashboard',
    name: 'GPU Dashboard',
    description: 'GPU utilization, inventory, and status',
    icon: '🎮',
    category: 'gpu',
    cards: [
      { card_type: 'gpu_overview', position: { w: 4, h: 2 } },
      { card_type: 'gpu_status', position: { w: 4, h: 2 } },
      { card_type: 'gpu_usage_trend', position: { w: 4, h: 2 } },
      { card_type: 'gpu_inventory', position: { w: 6, h: 3 } },
      { card_type: 'gpu_workloads', position: { w: 6, h: 3 } },
    ],
  },

  // Application templates
  {
    id: 'app-monitoring',
    name: 'Application Monitoring',
    description: 'Deployments, pods, and application status',
    icon: '📱',
    category: 'custom',
    cards: [
      { card_type: 'app_status', position: { w: 4, h: 2 } },
      { card_type: 'deployment_status', position: { w: 4, h: 2 } },
      { card_type: 'deployment_progress', position: { w: 4, h: 2 } },
      { card_type: 'pod_issues', position: { w: 6, h: 3 } },
      { card_type: 'deployment_issues', position: { w: 6, h: 3 } },
    ],
  },

  // Troubleshooting templates
  {
    id: 'troubleshooting',
    name: 'Troubleshooting',
    description: 'Events, issues, and diagnostics',
    icon: '🔧',
    category: 'custom',
    cards: [
      { card_type: 'event_stream', position: { w: 6, h: 3 } },
      { card_type: 'pod_issues', position: { w: 6, h: 3 } },
      { card_type: 'deployment_issues', position: { w: 4, h: 2 } },
      { card_type: 'security_issues', position: { w: 4, h: 2 } },
      { card_type: 'namespace_events', position: { w: 4, h: 2 } },
    ],
  },

  // Storage templates
  {
    id: 'storage-overview',
    name: 'Storage Overview',
    description: 'PVs, PVCs, and storage classes',
    icon: '💾',
    category: 'storage',
    cards: [
      { card_type: 'storage_overview', position: { w: 4, h: 3 } },
      { card_type: 'pvc_status', position: { w: 8, h: 3 } },
      { card_type: 'event_stream', title: 'Storage Events', config: { filter: 'storage' }, position: { w: 12, h: 2 } },
    ],
  },

  // Compute templates
  {
    id: 'compute-overview',
    name: 'Compute Overview',
    description: 'CPU, memory, and node resources',
    icon: '⚙️',
    category: 'compute',
    cards: [
      { card_type: 'compute_overview', position: { w: 4, h: 3 } },
      { card_type: 'resource_usage', position: { w: 4, h: 2 } },
      { card_type: 'resource_capacity', position: { w: 4, h: 2 } },
      { card_type: 'cluster_metrics', position: { w: 4, h: 2 } },
      { card_type: 'top_pods', title: 'Top CPU Consumers', position: { w: 6, h: 3 } },
      { card_type: 'top_pods', title: 'Top Memory Consumers', position: { w: 6, h: 3 } },
    ],
  },

  // Network templates
  {
    id: 'network-overview',
    name: 'Network Overview',
    description: 'Network policies, services, and connectivity',
    icon: '🌐',
    category: 'network',
    cards: [
      { card_type: 'network_overview', position: { w: 4, h: 3 } },
      { card_type: 'service_status', position: { w: 8, h: 3 } },
      { card_type: 'cluster_network', position: { w: 6, h: 2 } },
      { card_type: 'event_stream', title: 'Network Events', config: { filter: 'network' }, position: { w: 6, h: 2 } },
    ],
  },

  // Klaude AI templates
  {
    id: 'klaude-dashboard',
    name: 'Klaude AI Dashboard',
    description: 'AI-powered cluster analysis and troubleshooting',
    icon: '🤖',
    category: 'klaude',
    cards: [
      { card_type: 'klaude_issues', title: 'Klaude Issues', position: { w: 4, h: 3 } },
      { card_type: 'klaude_kubeconfig_audit', title: 'Klaude Kubeconfig Audit', position: { w: 4, h: 3 } },
      { card_type: 'klaude_health_check', title: 'Klaude Health Check', position: { w: 4, h: 3 } },
      { card_type: 'pod_issues', position: { w: 6, h: 2 } },
      { card_type: 'deployment_issues', position: { w: 6, h: 2 } },
    ],
  },

  // Alerting templates
  {
    id: 'alerting-dashboard',
    name: 'Alerting Dashboard',
    description: 'Active alerts, rules, and AI-powered diagnostics',
    icon: '🔔',
    category: 'alerting',
    cards: [
      { card_type: 'active_alerts', position: { w: 6, h: 3 } },
      { card_type: 'alert_rules', position: { w: 6, h: 3 } },
      { card_type: 'pod_issues', position: { w: 4, h: 2 } },
      { card_type: 'deployment_issues', position: { w: 4, h: 2 } },
      { card_type: 'security_issues', position: { w: 4, h: 2 } },
    ],
  },

  // Cost Management templates
  {
    id: 'cost-management',
    name: 'Cost Management',
    description: 'Resource costs, allocation, and optimization recommendations',
    icon: '💰',
    category: 'cost',
    cards: [
      { card_type: 'cluster_costs', position: { w: 6, h: 4 } },
      { card_type: 'opencost_overview', position: { w: 6, h: 4 } },
      { card_type: 'kubecost_overview', position: { w: 6, h: 4 } },
      { card_type: 'resource_usage', position: { w: 3, h: 2 } },
      { card_type: 'resource_capacity', position: { w: 3, h: 2 } },
    ],
  },

  // Weather template
  {
    id: 'weather-dashboard',
    name: 'Weather Dashboard',
    description: 'Weather conditions with multi-day forecasts and animated conditions',
    icon: '🌤️',
    category: 'custom',
    cards: [
      { card_type: 'weather', position: { w: 6, h: 4 } },
    ],
  },

  // Compliance templates (Task 10)
  {
    id: 'compliance-overview',
    name: 'Compliance Overview',
    description: 'Policy enforcement, security compliance, and audit readiness',
    icon: '📋',
    category: 'compliance',
    cards: [
      { card_type: 'compliance_score', title: 'Compliance Score', position: { w: 4, h: 2 } },
      { card_type: 'opa_policies', position: { w: 4, h: 3 } },
      { card_type: 'kyverno_policies', position: { w: 4, h: 3 } },
      { card_type: 'kubescape_scan', position: { w: 4, h: 3 } },
      { card_type: 'policy_violations', title: 'Policy Violations', position: { w: 8, h: 3 } },
    ],
  },
  {
    id: 'policy-enforcement',
    name: 'Policy Enforcement',
    description: 'OPA Gatekeeper, Kyverno, and Kubescape policy violations',
    icon: '🛡️',
    category: 'compliance',
    cards: [
      { card_type: 'opa_policies', position: { w: 4, h: 3 } },
      { card_type: 'kyverno_policies', position: { w: 4, h: 3 } },
      { card_type: 'kubescape_scan', position: { w: 4, h: 3 } },
      { card_type: 'policy_violations', title: 'All Violations', position: { w: 12, h: 3 } },
    ],
  },
  {
    id: 'security-scanning',
    name: 'Security Scanning',
    description: 'Vulnerability scanning with Trivy and runtime monitoring with Falco',
    icon: '🔍',
    category: 'compliance',
    cards: [
      { card_type: 'trivy_scan', title: 'Trivy Vulnerabilities', position: { w: 6, h: 4 } },
      { card_type: 'falco_alerts', title: 'Falco Alerts', position: { w: 6, h: 4 } },
      { card_type: 'security_issues', position: { w: 6, h: 3 } },
      { card_type: 'event_stream', title: 'Security Events', config: { filter: 'security' }, position: { w: 6, h: 3 } },
    ],
  },
  {
    id: 'audit-readiness',
    name: 'Audit Readiness',
    description: 'Prepare for compliance audits with CIS, NSA, and PCI-DSS frameworks',
    icon: '✅',
    category: 'compliance',
    cards: [
      { card_type: 'compliance_score', position: { w: 4, h: 2 } },
      { card_type: 'kubescape_scan', title: 'CIS Benchmark', config: { framework: 'cis' }, position: { w: 4, h: 3 } },
      { card_type: 'kubescape_scan', title: 'NSA Hardening', config: { framework: 'nsa' }, position: { w: 4, h: 3 } },
      { card_type: 'namespace_rbac', title: 'RBAC Audit', position: { w: 6, h: 3 } },
      { card_type: 'user_management', position: { w: 6, h: 3 } },
    ],
  },

  // Workload-specific templates (Task 3)
  {
    id: 'prow-dashboard',
    name: 'Prow CI Dashboard',
    description: 'Monitor Prow CI/CD jobs, ProwJobs, and test results',
    icon: '🚢',
    category: 'workloads',
    cards: [
      { card_type: 'prow_jobs', title: 'Prow Jobs', position: { w: 6, h: 4 } },
      { card_type: 'prow_status', title: 'Prow Status', position: { w: 6, h: 2 } },
      { card_type: 'prow_history', title: 'Recent Jobs', position: { w: 6, h: 2 } },
      { card_type: 'pod_issues', title: 'CI Pod Issues', config: { namespace: 'prow' }, position: { w: 6, h: 3 } },
      { card_type: 'event_stream', title: 'Prow Events', config: { namespace: 'prow' }, position: { w: 6, h: 3 } },
    ],
  },
  {
    id: 'llm-inference',
    name: 'LLM Inference Dashboard',
    description: 'Monitor vLLM, LLM-d, and AI inference workloads',
    icon: '🤖',
    category: 'workloads',
    cards: [
      { card_type: 'llm_inference', title: 'LLM Inference Status', position: { w: 6, h: 3 } },
      { card_type: 'llm_models', title: 'Deployed Models', position: { w: 6, h: 3 } },
      { card_type: 'gpu_workloads', title: 'GPU Workloads', position: { w: 6, h: 3 } },
      { card_type: 'gpu_usage_trend', position: { w: 6, h: 3 } },
      { card_type: 'pod_issues', title: 'Inference Pod Issues', config: { labelSelector: 'app.kubernetes.io/name=vllm' }, position: { w: 6, h: 2 } },
      { card_type: 'resource_usage', title: 'Inference Resource Usage', position: { w: 6, h: 2 } },
    ],
  },
  {
    id: 'ml-platform',
    name: 'ML Platform Dashboard',
    description: 'Monitor ML training jobs, notebooks, and model serving',
    icon: '🧠',
    category: 'workloads',
    cards: [
      { card_type: 'ml_jobs', title: 'Training Jobs', position: { w: 6, h: 3 } },
      { card_type: 'ml_notebooks', title: 'Jupyter Notebooks', position: { w: 6, h: 3 } },
      { card_type: 'llm_models', title: 'Model Registry', position: { w: 6, h: 3 } },
      { card_type: 'gpu_overview', position: { w: 3, h: 2 } },
      { card_type: 'gpu_status', position: { w: 3, h: 2 } },
      { card_type: 'resource_capacity', position: { w: 6, h: 2 } },
    ],
  },
]

export const TEMPLATE_CATEGORIES = [
  { id: 'cluster', name: 'Cluster', icon: '🌐' },
  { id: 'namespace', name: 'Namespace', icon: '📁' },
  { id: 'workloads', name: 'Workloads', icon: '🏗️' },
  { id: 'alerting', name: 'Alerting', icon: '🔔' },
  { id: 'compliance', name: 'Compliance', icon: '📋' },
  { id: 'cost', name: 'Cost Management', icon: '💰' },
  { id: 'storage', name: 'Storage', icon: '💾' },
  { id: 'compute', name: 'Compute', icon: '⚙️' },
  { id: 'network', name: 'Network', icon: '🌐' },
  { id: 'gitops', name: 'GitOps', icon: '🔄' },
  { id: 'security', name: 'Security', icon: '🔒' },
  { id: 'gpu', name: 'GPU', icon: '🎮' },
  { id: 'klaude', name: 'Klaude AI', icon: '🤖' },
  { id: 'custom', name: 'Other', icon: '📌' },
] as const
