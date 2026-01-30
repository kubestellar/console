// Dashboard templates with pre-configured cards for common use cases

export interface DashboardTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'cluster' | 'namespace' | 'workloads' | 'gitops' | 'security' | 'gpu' | 'storage' | 'compute' | 'network' | 'ai' | 'alerting' | 'cost' | 'compliance' | 'arcade' | 'deploy' | 'custom'
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
      { card_type: 'cluster_locations', position: { w: 6, h: 3 } },
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
      { card_type: 'namespace_monitor', position: { w: 6, h: 3 } },
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
      { card_type: 'gpu_utilization', position: { w: 6, h: 3 } },
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
      { card_type: 'service_exports', position: { w: 6, h: 2 } },
      { card_type: 'service_imports', position: { w: 6, h: 2 } },
      { card_type: 'gateway_status', position: { w: 6, h: 2 } },
      { card_type: 'service_topology', position: { w: 6, h: 3 } },
      { card_type: 'event_stream', title: 'Network Events', config: { filter: 'network' }, position: { w: 6, h: 2 } },
    ],
  },

  // AI templates
  {
    id: 'ai-dashboard',
    name: 'AI Dashboard',
    description: 'AI-powered cluster analysis and troubleshooting',
    icon: '🤖',
    category: 'ai',
    cards: [
      { card_type: 'console_ai_issues', title: 'AI Issues', position: { w: 4, h: 3 } },
      { card_type: 'console_ai_kubeconfig_audit', title: 'Kubeconfig Audit', position: { w: 4, h: 3 } },
      { card_type: 'console_ai_health_check', title: 'Health Check', position: { w: 4, h: 3 } },
      { card_type: 'console_ai_offline_detection', title: 'Offline Detection', position: { w: 4, h: 3 } },
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
    name: 'llm-d inference dashboard',
    description: 'Monitor vLLM, llm-d, and AI inference workloads',
    icon: '🤖',
    category: 'workloads',
    cards: [
      { card_type: 'llm_inference', title: 'llm-d inference status', position: { w: 6, h: 3 } },
      { card_type: 'llm_models', title: 'llm-d models', position: { w: 6, h: 3 } },
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
      { card_type: 'ml_jobs', title: 'ML Training Jobs', position: { w: 6, h: 3 } },
      { card_type: 'ml_notebooks', title: 'ML Notebooks', position: { w: 6, h: 3 } },
      { card_type: 'llm_models', title: 'llm-d model registry', position: { w: 6, h: 3 } },
      { card_type: 'gpu_overview', position: { w: 3, h: 2 } },
      { card_type: 'gpu_status', position: { w: 3, h: 2 } },
      { card_type: 'resource_capacity', position: { w: 6, h: 2 } },
    ],
  },

  // Arcade templates
  {
    id: 'arcade-classics',
    name: 'Arcade Classics',
    description: 'Classic games with a Kubernetes twist - Tetris, 2048, Minesweeper, and more',
    icon: '🎮',
    category: 'arcade',
    cards: [
      { card_type: 'checkers', title: 'Kube Checkers', position: { w: 4, h: 4 } },
      { card_type: 'container_tetris', title: 'Container Tetris', position: { w: 4, h: 4 } },
      { card_type: 'game_2048', title: 'Kube 2048', position: { w: 4, h: 4 } },
      { card_type: 'pod_sweeper', title: 'Pod Sweeper', position: { w: 6, h: 4 } },
      { card_type: 'solitaire', title: 'Kube Solitaire', position: { w: 6, h: 4 } },
    ],
  },
  {
    id: 'arcade-action',
    name: 'Arcade Action',
    description: 'Fast-paced action games - Flappy Pod, Node Invaders, Kube Kong, and more',
    icon: '🚀',
    category: 'arcade',
    cards: [
      { card_type: 'flappy_pod', title: 'Flappy Pod', position: { w: 4, h: 4 } },
      { card_type: 'node_invaders', title: 'Node Invaders', position: { w: 4, h: 4 } },
      { card_type: 'kube_kong', title: 'Kube Kong', position: { w: 4, h: 4 } },
      { card_type: 'pod_pitfall', title: 'Pod Pitfall', position: { w: 6, h: 4 } },
      { card_type: 'kube_man', title: 'Kube Man', position: { w: 6, h: 4 } },
      { card_type: 'kube_doom', title: 'Kube Doom', position: { w: 6, h: 4 } },
    ],
  },
  {
    id: 'arcade-puzzle',
    name: 'Arcade Puzzles',
    description: 'Brain teasers and puzzle games - Kubedle, Match Game, and more',
    icon: '🧩',
    category: 'arcade',
    cards: [
      { card_type: 'kubedle', title: 'Kubedle', position: { w: 4, h: 4 } },
      { card_type: 'match_game', title: 'Kube Match', position: { w: 4, h: 4 } },
      { card_type: 'game_2048', title: 'Kube 2048', position: { w: 4, h: 4 } },
    ],
  },
  {
    id: 'arcade-all',
    name: 'Full Arcade',
    description: 'All available Kubernetes-themed arcade games',
    icon: '🎪',
    category: 'arcade',
    cards: [
      { card_type: 'checkers', title: 'Kube Checkers', position: { w: 4, h: 4 } },
      { card_type: 'kube_chess', title: 'Kube Chess', position: { w: 4, h: 4 } },
      { card_type: 'sudoku_game', title: 'Kube Sudoku', position: { w: 4, h: 4 } },
      { card_type: 'flappy_pod', title: 'Flappy Pod', position: { w: 4, h: 4 } },
      { card_type: 'container_tetris', title: 'Container Tetris', position: { w: 4, h: 4 } },
      { card_type: 'game_2048', title: 'Kube 2048', position: { w: 4, h: 4 } },
      { card_type: 'pod_sweeper', title: 'Pod Sweeper', position: { w: 4, h: 4 } },
      { card_type: 'match_game', title: 'Kube Match', position: { w: 4, h: 4 } },
      { card_type: 'kubedle', title: 'Kubedle', position: { w: 4, h: 4 } },
      { card_type: 'solitaire', title: 'Kube Solitaire', position: { w: 4, h: 4 } },
      { card_type: 'node_invaders', title: 'Node Invaders', position: { w: 4, h: 4 } },
      { card_type: 'kube_kong', title: 'Kube Kong', position: { w: 4, h: 4 } },
      { card_type: 'kube_man', title: 'Kube Man', position: { w: 4, h: 4 } },
      { card_type: 'pod_pitfall', title: 'Pod Pitfall', position: { w: 4, h: 4 } },
      { card_type: 'pod_brothers', title: 'Pod Brothers', position: { w: 4, h: 4 } },
      { card_type: 'kube_kart', title: 'Kube Kart', position: { w: 4, h: 4 } },
      { card_type: 'kube_pong', title: 'Kube Pong', position: { w: 4, h: 4 } },
      { card_type: 'kube_snake', title: 'Kube Snake', position: { w: 4, h: 4 } },
      { card_type: 'kube_galaga', title: 'Kube Galaga', position: { w: 4, h: 4 } },
      { card_type: 'kube_craft', title: 'KubeCraft', position: { w: 4, h: 4 } },
      { card_type: 'kube_craft_3d', title: 'KubeCraft 3D', position: { w: 4, h: 4 } },
      { card_type: 'kube_doom', title: 'Kube Doom', position: { w: 6, h: 4 } },
    ],
  },

  // Live Trends templates
  {
    id: 'live-trends',
    name: 'Live Trends',
    description: 'Real-time timeseries charts for events, pods, resources, and GPU utilization',
    icon: '📈',
    category: 'custom',
    cards: [
      { card_type: 'events_timeline', position: { w: 6, h: 3 } },
      { card_type: 'pod_health_trend', position: { w: 6, h: 3 } },
      { card_type: 'resource_trend', position: { w: 6, h: 3 } },
      { card_type: 'gpu_utilization', position: { w: 6, h: 3 } },
    ],
  },

  // Secrets & Certificates templates
  {
    id: 'secrets-management',
    name: 'Secrets Management',
    description: 'Vault secrets, external secrets, and certificate management',
    icon: '🔑',
    category: 'security',
    cards: [
      { card_type: 'vault_secrets', position: { w: 4, h: 3 } },
      { card_type: 'external_secrets', position: { w: 4, h: 3 } },
      { card_type: 'cert_manager', position: { w: 4, h: 3 } },
    ],
  },

  // Utilities templates
  {
    id: 'utilities',
    name: 'Utilities',
    description: 'Kubectl terminal, network tools, browser, and external integrations',
    icon: '🧰',
    category: 'custom',
    cards: [
      { card_type: 'kubectl', position: { w: 6, h: 4 } },
      { card_type: 'network_utils', position: { w: 6, h: 3 } },
      { card_type: 'mobile_browser', position: { w: 6, h: 4 } },
      { card_type: 'github_activity', position: { w: 6, h: 3 } },
      { card_type: 'stock_market_ticker', position: { w: 4, h: 2 } },
      { card_type: 'iframe_embed', position: { w: 8, h: 4 } },
    ],
  },

  // Deploy templates
  {
    id: 'deploy-overview',
    name: 'Deployment Overview',
    description: 'Monitor deployment status, issues, and progress across clusters',
    icon: '🚀',
    category: 'deploy',
    cards: [
      { card_type: 'workload_deployment', title: 'Workloads', position: { w: 4, h: 2 } },
      { card_type: 'cluster_groups', title: 'Cluster Groups', position: { w: 4, h: 2 } },
      { card_type: 'deployment_missions', title: 'Missions', position: { w: 4, h: 2 } },
      { card_type: 'resource_marshall', title: 'Resource Marshall', position: { w: 6, h: 2 } },
      { card_type: 'deployment_status', position: { w: 6, h: 2 } },
      { card_type: 'deployment_progress', position: { w: 5, h: 2 } },
      { card_type: 'deployment_issues', position: { w: 6, h: 2 } },
      { card_type: 'upgrade_status', position: { w: 4, h: 2 } },
    ],
  },
  {
    id: 'deploy-gitops',
    name: 'GitOps Deployments',
    description: 'ArgoCD applications, sync status, and drift detection',
    icon: '🔄',
    category: 'deploy',
    cards: [
      { card_type: 'gitops_drift', position: { w: 6, h: 2 } },
      { card_type: 'argocd_applications', position: { w: 6, h: 3 } },
      { card_type: 'argocd_sync_status', position: { w: 6, h: 3 } },
      { card_type: 'argocd_health', position: { w: 6, h: 2 } },
    ],
  },
  {
    id: 'deploy-helm',
    name: 'Helm Deployments',
    description: 'Helm releases, history, and chart versions',
    icon: '⛵',
    category: 'deploy',
    cards: [
      { card_type: 'helm_release_status', position: { w: 6, h: 2 } },
      { card_type: 'helm_history', position: { w: 8, h: 3 } },
      { card_type: 'chart_versions', position: { w: 6, h: 3 } },
      { card_type: 'helm_values_diff', position: { w: 8, h: 3 } },
    ],
  },
  {
    id: 'deploy-full',
    name: 'Full Deployment Dashboard',
    description: 'Complete deployment monitoring with GitOps, Helm, and Kustomize',
    icon: '📦',
    category: 'deploy',
    cards: [
      { card_type: 'workload_deployment', title: 'Workloads', position: { w: 4, h: 2 } },
      { card_type: 'cluster_groups', title: 'Cluster Groups', position: { w: 4, h: 2 } },
      { card_type: 'deployment_missions', title: 'Missions', position: { w: 4, h: 2 } },
      { card_type: 'resource_marshall', title: 'Resource Marshall', position: { w: 6, h: 2 } },
      { card_type: 'deployment_status', position: { w: 6, h: 2 } },
      { card_type: 'deployment_issues', position: { w: 6, h: 2 } },
      { card_type: 'gitops_drift', position: { w: 6, h: 2 } },
      { card_type: 'argocd_applications', position: { w: 6, h: 2 } },
      { card_type: 'helm_release_status', position: { w: 6, h: 2 } },
      { card_type: 'kustomization_status', position: { w: 6, h: 2 } },
      { card_type: 'upgrade_status', position: { w: 4, h: 2 } },
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
  { id: 'ai', name: 'AI Assistant', icon: '🤖' },
  { id: 'arcade', name: 'Arcade', icon: '🕹️' },
  { id: 'deploy', name: 'Deploy', icon: '🚀' },
  { id: 'custom', name: 'Other', icon: '📌' },
] as const
