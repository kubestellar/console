import { useState } from 'react'
import { Sparkles, Plus, Loader2, LayoutGrid, Search } from 'lucide-react'
import { BaseModal } from '../../lib/modals'

// Card catalog - all available cards organized by category
const CARD_CATALOG = {
  'Cluster Health': [
    { type: 'cluster_health', title: 'Cluster Health', description: 'Health status of all clusters', visualization: 'status' },
    { type: 'cluster_metrics', title: 'Cluster Metrics', description: 'CPU, memory, and pod metrics over time', visualization: 'timeseries' },
    { type: 'cluster_locations', title: 'Cluster Locations', description: 'Clusters grouped by region and cloud provider', visualization: 'status' },
    { type: 'cluster_focus', title: 'Cluster Focus', description: 'Single cluster detailed view', visualization: 'status' },
    { type: 'cluster_comparison', title: 'Cluster Comparison', description: 'Side-by-side cluster metrics', visualization: 'bar' },
    { type: 'cluster_costs', title: 'Cluster Costs', description: 'Resource cost estimation', visualization: 'bar' },
    { type: 'upgrade_status', title: 'Cluster Upgrade Status', description: 'Available cluster upgrades', visualization: 'status' },
    { type: 'cluster_resource_tree', title: 'Cluster Resource Tree', description: 'Hierarchical view of cluster resources with search and filters', visualization: 'table' },
  ],
  'Workloads': [
    { type: 'deployment_status', title: 'Deployment Status', description: 'Deployment health across clusters', visualization: 'donut' },
    { type: 'deployment_issues', title: 'Deployment Issues', description: 'Deployments with problems', visualization: 'table' },
    { type: 'deployment_progress', title: 'Deployment Progress', description: 'Rolling update progress', visualization: 'gauge' },
    { type: 'pod_issues', title: 'Pod Issues', description: 'Pods with errors or restarts', visualization: 'table' },
    { type: 'top_pods', title: 'Top Pods', description: 'Highest resource consuming pods', visualization: 'bar' },
    { type: 'app_status', title: 'Workload Status', description: 'Workload health overview', visualization: 'donut' },
  ],
  'Compute': [
    { type: 'compute_overview', title: 'Compute Overview', description: 'CPU, memory, and GPU summary with live data', visualization: 'status' },
    { type: 'resource_usage', title: 'Resource Usage', description: 'CPU and memory utilization', visualization: 'gauge' },
    { type: 'resource_capacity', title: 'Resource Capacity', description: 'Cluster capacity and allocation', visualization: 'bar' },
    { type: 'gpu_overview', title: 'GPU Overview', description: 'Total GPUs across clusters', visualization: 'gauge' },
    { type: 'gpu_status', title: 'GPU Status', description: 'GPU utilization by state', visualization: 'donut' },
    { type: 'gpu_inventory', title: 'GPU Inventory', description: 'Detailed GPU list', visualization: 'table' },
    { type: 'gpu_workloads', title: 'GPU Workloads', description: 'Pods running on GPU nodes or in NVIDIA namespaces', visualization: 'table' },
    { type: 'gpu_usage_trend', title: 'GPU Usage Trend', description: 'GPU used vs available over time with stacked area chart', visualization: 'timeseries' },
  ],
  'Storage': [
    { type: 'storage_overview', title: 'Storage Overview', description: 'Total storage capacity and PVC summary', visualization: 'status' },
    { type: 'pvc_status', title: 'PVC Status', description: 'Persistent Volume Claims with status breakdown', visualization: 'table' },
  ],
  'Network': [
    { type: 'network_overview', title: 'Network Overview', description: 'Services breakdown by type and namespace', visualization: 'status' },
    { type: 'service_status', title: 'Service Status', description: 'Service list with type and ports', visualization: 'table' },
    { type: 'cluster_network', title: 'Cluster Network', description: 'API server and network info', visualization: 'status' },
  ],
  'GitOps': [
    { type: 'helm_release_status', title: 'Helm Releases', description: 'Helm release status and versions', visualization: 'status' },
    { type: 'helm_history', title: 'Helm History', description: 'Release revision history', visualization: 'events' },
    { type: 'helm_values_diff', title: 'Helm Values Diff', description: 'Compare values vs defaults', visualization: 'table' },
    { type: 'chart_versions', title: 'Helm Chart Versions', description: 'Available chart upgrades', visualization: 'table' },
    { type: 'kustomization_status', title: 'Kustomization Status', description: 'Flux kustomizations health', visualization: 'status' },
    { type: 'overlay_comparison', title: 'Overlay Comparison', description: 'Compare kustomize overlays', visualization: 'table' },
    { type: 'gitops_drift', title: 'GitOps Drift', description: 'Configuration drift detection', visualization: 'status' },
  ],
  'ArgoCD': [
    { type: 'argocd_applications', title: 'ArgoCD Applications', description: 'ArgoCD app status', visualization: 'status' },
    { type: 'argocd_sync_status', title: 'ArgoCD Sync Status', description: 'Sync state of applications', visualization: 'donut' },
    { type: 'argocd_health', title: 'ArgoCD Health', description: 'Application health overview', visualization: 'status' },
  ],
  'Operators': [
    { type: 'operator_status', title: 'OLM Operators', description: 'Operator Lifecycle Manager status', visualization: 'status' },
    { type: 'operator_subscriptions', title: 'Operator Subscriptions', description: 'Subscriptions and pending upgrades', visualization: 'table' },
    { type: 'crd_health', title: 'CRD Health', description: 'Custom resource definitions status', visualization: 'status' },
  ],
  'Namespaces': [
    { type: 'namespace_overview', title: 'Namespace Overview', description: 'Namespace resources and health', visualization: 'status' },
    { type: 'namespace_quotas', title: 'Namespace Quotas', description: 'Resource quota usage', visualization: 'gauge' },
    { type: 'namespace_rbac', title: 'Namespace RBAC', description: 'Roles, bindings, service accounts', visualization: 'table' },
    { type: 'namespace_events', title: 'Namespace Events', description: 'Events in namespace', visualization: 'events' },
  ],
  'Security & Events': [
    { type: 'security_issues', title: 'Security Issues', description: 'Security findings and vulnerabilities', visualization: 'table' },
    { type: 'event_stream', title: 'Event Stream', description: 'Live Kubernetes event feed', visualization: 'events' },
    { type: 'user_management', title: 'User Management', description: 'Console users and Kubernetes RBAC', visualization: 'table' },
  ],
  'Live Trends': [
    { type: 'events_timeline', title: 'Events Timeline', description: 'Warning vs normal events over time with live data', visualization: 'timeseries' },
    { type: 'pod_health_trend', title: 'Pod Health Trend', description: 'Healthy/unhealthy/pending pods over time', visualization: 'timeseries' },
    { type: 'resource_trend', title: 'Resource Trend', description: 'CPU, memory, pods, nodes over time', visualization: 'timeseries' },
    { type: 'gpu_utilization', title: 'GPU Utilization', description: 'GPU allocation trend with donut chart', visualization: 'timeseries' },
  ],
  'Klaude AI': [
    { type: 'klaude_issues', title: 'Klaude Issues', description: 'AI-powered issue detection and repair', visualization: 'status' },
    { type: 'klaude_kubeconfig_audit', title: 'Klaude Kubeconfig Audit', description: 'Audit kubeconfig for stale contexts', visualization: 'status' },
    { type: 'klaude_health_check', title: 'Klaude Health Check', description: 'Comprehensive AI health analysis', visualization: 'gauge' },
  ],
  'Alerting': [
    { type: 'active_alerts', title: 'Active Alerts', description: 'Firing alerts with severity and quick actions', visualization: 'status' },
    { type: 'alert_rules', title: 'Alert Rules', description: 'Manage alert rules and notification channels', visualization: 'table' },
  ],
  'Cost Management': [
    { type: 'cluster_costs', title: 'Cluster Costs', description: 'Resource cost estimation by cluster with cloud provider pricing', visualization: 'bar' },
    { type: 'opencost_overview', title: 'OpenCost', description: 'Cost allocation by namespace using OpenCost (demo)', visualization: 'bar' },
    { type: 'kubecost_overview', title: 'Kubecost', description: 'Cost optimization and savings recommendations (demo)', visualization: 'bar' },
  ],
  'Security Posture': [
    { type: 'opa_policies', title: 'OPA Gatekeeper', description: 'Policy enforcement with OPA Gatekeeper - shows installed status per cluster', visualization: 'status' },
    { type: 'kyverno_policies', title: 'Kyverno Policies', description: 'Kubernetes-native policy management with Kyverno', visualization: 'status' },
    { type: 'falco_alerts', title: 'Falco Alerts', description: 'Runtime security monitoring - syscall anomalies, container escapes, privilege escalation', visualization: 'events' },
    { type: 'trivy_scan', title: 'Trivy Scanner', description: 'Vulnerability scanning for container images, IaC, and secrets', visualization: 'table' },
    { type: 'kubescape_scan', title: 'Kubescape', description: 'Security posture management and NSA/CISA hardening compliance', visualization: 'status' },
    { type: 'policy_violations', title: 'Policy Violations', description: 'Aggregated policy violations across all enforcement tools', visualization: 'table' },
    { type: 'compliance_score', title: 'Compliance Score', description: 'Overall compliance posture with drill-down by framework (CIS, NSA, PCI-DSS)', visualization: 'gauge' },
  ],
  'Data Compliance': [
    { type: 'vault_secrets', title: 'HashiCorp Vault', description: 'Secrets management, dynamic credentials, and encryption-as-a-service', visualization: 'status' },
    { type: 'external_secrets', title: 'External Secrets', description: 'Sync secrets from external providers (AWS, Azure, GCP, Vault)', visualization: 'status' },
    { type: 'cert_manager', title: 'Cert-Manager', description: 'TLS certificate lifecycle management with automatic renewal', visualization: 'status' },
    { type: 'namespace_rbac', title: 'Access Controls', description: 'RBAC policies and permission auditing per namespace', visualization: 'table' },
  ],
  'Workload Detection': [
    { type: 'prow_jobs', title: 'Prow Jobs', description: 'Prow CI/CD job status - presubmit, postsubmit, and periodic jobs', visualization: 'table' },
    { type: 'prow_status', title: 'Prow Status', description: 'Prow controller health and job queue metrics', visualization: 'status' },
    { type: 'prow_history', title: 'Prow History', description: 'Recent Prow job runs with pass/fail trends', visualization: 'events' },
    { type: 'llm_inference', title: 'LLM Inference', description: 'vLLM, LLM-d, and TGI inference server status', visualization: 'status' },
    { type: 'llm_models', title: 'LLM Models', description: 'Deployed language models with memory and GPU allocation', visualization: 'table' },
    { type: 'ml_jobs', title: 'ML Training Jobs', description: 'Kubeflow, Ray, or custom ML training job status', visualization: 'table' },
    { type: 'ml_notebooks', title: 'Jupyter Notebooks', description: 'Running Jupyter notebook servers and resource usage', visualization: 'table' },
  ],
  'Arcade': [
    { type: 'kube_man', title: 'Kube-Man', description: 'Classic Pac-Man arcade game - eat dots and avoid ghosts in the cluster maze', visualization: 'status' },
    { type: 'kube_kong', title: 'Kube Kong', description: 'Donkey Kong-style platformer - climb the infrastructure and rescue the deployment', visualization: 'status' },
    { type: 'node_invaders', title: 'Node Invaders', description: 'Space Invaders-style shooter - defend your cluster from invading nodes', visualization: 'status' },
    { type: 'pod_pitfall', title: 'Pod Pitfall', description: 'Pitfall-style adventure - swing on vines and collect treasures in the jungle', visualization: 'status' },
    { type: 'container_tetris', title: 'Container Tetris', description: 'Classic Tetris game - stack falling containers and clear lines', visualization: 'status' },
    { type: 'flappy_pod', title: 'Flappy Pod', description: 'Navigate your pod through node walls - click or press Space to fly', visualization: 'status' },
    { type: 'pod_sweeper', title: 'Pod Sweeper', description: 'Minesweeper-style game - find the corrupted pods without hitting them', visualization: 'status' },
    { type: 'game_2048', title: 'Kube 2048', description: 'Merge pods to reach 2048 - swipe or use arrow keys', visualization: 'status' },
    { type: 'checkers', title: 'AI Checkers', description: 'Play checkers against a snarky pirate AI - pods vs nodes', visualization: 'status' },
    { type: 'solitaire', title: 'Kube Solitaire', description: 'Classic Klondike solitaire with Kubernetes-themed suits', visualization: 'status' },
    { type: 'match_game', title: 'Kube Match', description: 'Memory matching game with Kubernetes-themed cards', visualization: 'status' },
    { type: 'kubedle', title: 'Kubedle', description: 'Wordle-style word guessing game with Kubernetes terms', visualization: 'status' },
    { type: 'sudoku_game', title: 'Sudoku', description: 'Brain-training Sudoku puzzle with multiple difficulty levels, hints, and timer', visualization: 'status' },
  ],
  'Misc': [
    { type: 'weather', title: 'Weather', description: 'Weather conditions with multi-day forecasts and animated backgrounds', visualization: 'status' },
    { type: 'github_activity', title: 'GitHub Activity', description: 'Monitor GitHub repository activity - PRs, issues, releases, and contributors', visualization: 'table' },
    { type: 'kubectl', title: 'Kubectl', description: 'Interactive kubectl terminal with AI assistance, YAML editor, and command history', visualization: 'table' },
    { type: 'stock_market_ticker', title: 'Stock Market Ticker', description: 'Track multiple stocks with real-time sparkline charts and iPhone-style design', visualization: 'timeseries' },
  ],
} as const

interface CardSuggestion {
  type: string
  title: string
  description: string
  visualization: 'gauge' | 'table' | 'timeseries' | 'events' | 'donut' | 'bar' | 'status' | 'sparkline'
  config: Record<string, unknown>
}

interface AddCardModalProps {
  isOpen: boolean
  onClose: () => void
  onAddCards: (cards: CardSuggestion[]) => void
  existingCardTypes?: string[]
}

// Simulated AI response - in production this would call Claude API
function generateCardSuggestions(query: string): CardSuggestion[] {
  const lowerQuery = query.toLowerCase()

  // GPU-related queries
  if (lowerQuery.includes('gpu')) {
    return [
      {
        type: 'gpu_overview',
        title: 'GPU Overview',
        description: 'Total GPUs across all clusters',
        visualization: 'gauge',
        config: { metric: 'gpu_utilization' },
      },
      {
        type: 'gpu_status',
        title: 'GPU Status',
        description: 'GPUs by state',
        visualization: 'donut',
        config: { groupBy: 'status' },
      },
      {
        type: 'gpu_list',
        title: 'GPU Inventory',
        description: 'Detailed GPU list with status',
        visualization: 'table',
        config: { columns: ['node', 'gpu_type', 'memory', 'status', 'utilization'] },
      },
      {
        type: 'gpu_issues',
        title: 'GPU Issues',
        description: 'GPUs with problems',
        visualization: 'events',
        config: { filter: 'gpu_issues' },
      },
      {
        type: 'gpu_workloads',
        title: 'GPU Workloads',
        description: 'Pods running on GPU nodes',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // Memory-related queries
  if (lowerQuery.includes('memory') || lowerQuery.includes('ram')) {
    return [
      {
        type: 'memory_usage',
        title: 'Memory Usage',
        description: 'Current memory utilization',
        visualization: 'gauge',
        config: { metric: 'memory_usage' },
      },
      {
        type: 'memory_trend',
        title: 'Memory Trend',
        description: 'Memory usage over time',
        visualization: 'timeseries',
        config: { metric: 'memory', period: '1h' },
      },
    ]
  }

  // CPU-related queries
  if (lowerQuery.includes('cpu') || lowerQuery.includes('processor')) {
    return [
      {
        type: 'cpu_usage',
        title: 'CPU Usage',
        description: 'Current CPU utilization',
        visualization: 'gauge',
        config: { metric: 'cpu_usage' },
      },
      {
        type: 'cpu_trend',
        title: 'CPU Trend',
        description: 'CPU usage over time',
        visualization: 'timeseries',
        config: { metric: 'cpu', period: '1h' },
      },
      {
        type: 'top_cpu_pods',
        title: 'Top CPU Consumers',
        description: 'Pods using most CPU',
        visualization: 'bar',
        config: { metric: 'cpu', limit: 10 },
      },
    ]
  }

  // Pod-related queries
  if (lowerQuery.includes('pod')) {
    return [
      {
        type: 'pod_status',
        title: 'Pod Status',
        description: 'Pods by state',
        visualization: 'donut',
        config: { groupBy: 'status' },
      },
      {
        type: 'pod_list',
        title: 'Pod List',
        description: 'All pods with details',
        visualization: 'table',
        config: { columns: ['name', 'namespace', 'status', 'restarts', 'age'] },
      },
    ]
  }

  // Cluster-related queries
  if (lowerQuery.includes('cluster')) {
    return [
      {
        type: 'cluster_health',
        title: 'Cluster Health',
        description: 'Health status of all clusters',
        visualization: 'status',
        config: {},
      },
      {
        type: 'cluster_focus',
        title: 'Cluster Focus',
        description: 'Single cluster detailed view',
        visualization: 'status',
        config: {},
      },
      {
        type: 'cluster_comparison',
        title: 'Cluster Comparison',
        description: 'Side-by-side cluster metrics',
        visualization: 'bar',
        config: {},
      },
      {
        type: 'cluster_network',
        title: 'Cluster Network',
        description: 'API server and network info',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Namespace-related queries
  if (lowerQuery.includes('namespace') || lowerQuery.includes('quota') || lowerQuery.includes('rbac')) {
    return [
      {
        type: 'namespace_overview',
        title: 'Namespace Overview',
        description: 'Namespace resources and health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'namespace_quotas',
        title: 'Namespace Quotas',
        description: 'Resource quota usage',
        visualization: 'gauge',
        config: {},
      },
      {
        type: 'namespace_rbac',
        title: 'Namespace RBAC',
        description: 'Roles, bindings, service accounts',
        visualization: 'table',
        config: {},
      },
      {
        type: 'namespace_events',
        title: 'Namespace Events',
        description: 'Events in namespace',
        visualization: 'events',
        config: {},
      },
    ]
  }

  // Operator/OLM-related queries
  if (lowerQuery.includes('operator') || lowerQuery.includes('olm') || lowerQuery.includes('crd')) {
    return [
      {
        type: 'operator_status',
        title: 'Operator Status',
        description: 'OLM operator health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'operator_subscriptions',
        title: 'Operator Subscriptions',
        description: 'Subscriptions and pending upgrades',
        visualization: 'table',
        config: {},
      },
      {
        type: 'crd_health',
        title: 'CRD Health',
        description: 'Custom resource definitions status',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Helm-related queries
  if (lowerQuery.includes('helm') || lowerQuery.includes('chart') || lowerQuery.includes('release')) {
    return [
      {
        type: 'helm_release_status',
        title: 'Helm Releases',
        description: 'Release status and versions',
        visualization: 'status',
        config: {},
      },
      {
        type: 'helm_values_diff',
        title: 'Helm Values Diff',
        description: 'Compare values vs defaults',
        visualization: 'table',
        config: {},
      },
      {
        type: 'helm_history',
        title: 'Helm History',
        description: 'Release revision history',
        visualization: 'events',
        config: {},
      },
      {
        type: 'chart_versions',
        title: 'Helm Chart Versions',
        description: 'Available chart upgrades',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // Kustomize/GitOps-related queries
  if (lowerQuery.includes('kustomize') || lowerQuery.includes('flux') || lowerQuery.includes('overlay')) {
    return [
      {
        type: 'kustomization_status',
        title: 'Kustomization Status',
        description: 'Flux kustomizations health',
        visualization: 'status',
        config: {},
      },
      {
        type: 'overlay_comparison',
        title: 'Overlay Comparison',
        description: 'Compare kustomize overlays',
        visualization: 'table',
        config: {},
      },
      {
        type: 'gitops_drift',
        title: 'GitOps Drift',
        description: 'Detect configuration drift',
        visualization: 'status',
        config: {},
      },
    ]
  }

  // Cost-related queries
  if (lowerQuery.includes('cost') || lowerQuery.includes('price') || lowerQuery.includes('expense')) {
    return [
      {
        type: 'cluster_costs',
        title: 'Cluster Costs',
        description: 'Resource cost estimation',
        visualization: 'bar',
        config: {},
      },
      {
        type: 'resource_usage',
        title: 'Resource Usage',
        description: 'CPU and memory consumption',
        visualization: 'gauge',
        config: {},
      },
    ]
  }

  // Policy-related queries
  if (lowerQuery.includes('policy') || lowerQuery.includes('opa') || lowerQuery.includes('gatekeeper') || lowerQuery.includes('kyverno') || lowerQuery.includes('compliance')) {
    return [
      {
        type: 'opa_policies',
        title: 'OPA Gatekeeper',
        description: 'Policy enforcement with OPA Gatekeeper',
        visualization: 'status',
        config: {},
      },
      {
        type: 'kyverno_policies',
        title: 'Kyverno Policies',
        description: 'Kubernetes-native policy management',
        visualization: 'status',
        config: {},
      },
      {
        type: 'security_issues',
        title: 'Security Issues',
        description: 'Security findings and vulnerabilities',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // User management queries
  if (lowerQuery.includes('user') || lowerQuery.includes('service account') || lowerQuery.includes('access') || lowerQuery.includes('permission')) {
    return [
      {
        type: 'user_management',
        title: 'User Management',
        description: 'Console users and Kubernetes RBAC',
        visualization: 'table',
        config: {},
      },
      {
        type: 'namespace_rbac',
        title: 'Namespace RBAC',
        description: 'Roles, bindings, service accounts',
        visualization: 'table',
        config: {},
      },
    ]
  }

  // Events/logs queries
  if (lowerQuery.includes('event') || lowerQuery.includes('log') || lowerQuery.includes('error')) {
    return [
      {
        type: 'event_stream',
        title: 'Event Stream',
        description: 'Live event feed',
        visualization: 'events',
        config: { filter: 'all' },
      },
      {
        type: 'events_timeline',
        title: 'Events Timeline',
        description: 'Warning vs normal events over time',
        visualization: 'timeseries',
        config: {},
      },
      {
        type: 'error_count',
        title: 'Errors Over Time',
        description: 'Error count trend',
        visualization: 'sparkline',
        config: { metric: 'errors' },
      },
    ]
  }

  // Trend/analytics queries
  if (lowerQuery.includes('trend') || lowerQuery.includes('analytics') || lowerQuery.includes('over time') || lowerQuery.includes('history')) {
    return [
      {
        type: 'events_timeline',
        title: 'Events Timeline',
        description: 'Warning vs normal events over time',
        visualization: 'timeseries',
        config: {},
      },
      {
        type: 'pod_health_trend',
        title: 'Pod Health Trend',
        description: 'Healthy/unhealthy/pending pods over time',
        visualization: 'timeseries',
        config: {},
      },
      {
        type: 'resource_trend',
        title: 'Resource Trend',
        description: 'CPU, memory, pods, nodes over time',
        visualization: 'timeseries',
        config: {},
      },
      {
        type: 'gpu_utilization',
        title: 'GPU Utilization',
        description: 'GPU allocation trend with utilization chart',
        visualization: 'timeseries',
        config: {},
      },
    ]
  }

  // Default suggestions
  return [
    {
      type: 'custom_query',
      title: 'Custom Metric',
      description: 'Based on your query',
      visualization: 'timeseries',
      config: { query: query },
    },
  ]
}

const visualizationIcons: Record<string, string> = {
  gauge: '⏱️',
  table: '📋',
  timeseries: '📈',
  events: '📜',
  donut: '🍩',
  bar: '📊',
  status: '🚦',
  sparkline: '〰️',
}

interface HoveredCard {
  type: string
  title: string
  description: string
  visualization: string
}

// Mock preview component for card visualization - renders a mini card preview
function CardPreview({ card }: { card: HoveredCard }) {
  const renderVisualization = () => {
    switch (card.visualization) {
      case 'gauge':
        return (
          <div className="flex items-center justify-center flex-1">
            <div className="relative w-14 h-14">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-purple-400" strokeDasharray="70 30" strokeLinecap="round" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">70%</span>
            </div>
          </div>
        )
      case 'donut':
        return (
          <div className="flex items-center justify-center flex-1">
            <div className="relative w-12 h-12">
              <svg className="w-full h-full" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-green-400" strokeDasharray="60 40" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-yellow-400" strokeDasharray="25 75" strokeDashoffset="-60" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="currentColor" strokeWidth="6" className="text-red-400" strokeDasharray="15 85" strokeDashoffset="-85" />
              </svg>
            </div>
            <div className="ml-2 space-y-0.5">
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-muted-foreground">Healthy</span>
              </div>
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                <span className="text-muted-foreground">Warning</span>
              </div>
              <div className="flex items-center gap-1 text-[8px]">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <span className="text-muted-foreground">Critical</span>
              </div>
            </div>
          </div>
        )
      case 'bar':
        return (
          <div className="flex-1 px-2 flex items-end justify-center gap-1 pb-2">
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '60%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '45%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '80%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '55%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '70%' }} />
            <div className="w-3 bg-purple-400 rounded-t" style={{ height: '40%' }} />
          </div>
        )
      case 'timeseries':
      case 'sparkline':
        return (
          <div className="flex-1 px-2 pb-2">
            <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
              <path
                d="M0,30 L10,25 L20,28 L30,15 L40,20 L50,10 L60,18 L70,12 L80,8 L90,15 L100,5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-purple-400"
              />
              <path
                d="M0,30 L10,25 L20,28 L30,15 L40,20 L50,10 L60,18 L70,12 L80,8 L90,15 L100,5 L100,40 L0,40 Z"
                fill="currentColor"
                className="text-purple-400/20"
              />
            </svg>
          </div>
        )
      case 'table':
        return (
          <div className="flex-1 p-2 space-y-1">
            <div className="flex gap-1 pb-1 border-b border-border/50">
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
              <div className="h-1.5 w-1/4 bg-muted-foreground/30 rounded" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-1">
                <div className="h-1.5 w-1/4 bg-purple-400/20 rounded" />
                <div className="h-1.5 w-1/4 bg-secondary rounded" />
                <div className="h-1.5 w-1/4 bg-secondary rounded" />
                <div className={`h-1.5 w-1/4 rounded ${i === 1 ? 'bg-yellow-400/40' : i === 3 ? 'bg-red-400/40' : 'bg-green-400/40'}`} />
              </div>
            ))}
          </div>
        )
      case 'events':
        return (
          <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
            {[
              { color: 'bg-blue-400', time: '2m ago' },
              { color: 'bg-yellow-400', time: '5m ago' },
              { color: 'bg-green-400', time: '8m ago' },
              { color: 'bg-red-400', time: '12m ago' },
            ].map((event, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${event.color} flex-shrink-0`} />
                <div className="h-1.5 flex-1 bg-secondary rounded" />
                <span className="text-[7px] text-muted-foreground/60">{event.time}</span>
              </div>
            ))}
          </div>
        )
      case 'status':
      default:
        return (
          <div className="flex-1 p-2">
            <div className="grid grid-cols-3 gap-1">
              {['gke-prod', 'eks-dev', 'aks-stg', 'kind-local', 'k3s-edge', 'gke-dr'].map((name, i) => (
                <div key={i} className={`rounded p-1 ${i === 3 ? 'bg-yellow-500/30' : i === 5 ? 'bg-red-500/30' : 'bg-green-500/30'}`}>
                  <div className="text-[6px] text-foreground/80 truncate">{name}</div>
                </div>
              ))}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden h-32 flex flex-col">
      {/* Card header */}
      <div className="px-2 py-1.5 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
        <span className="text-[9px] font-medium text-foreground truncate">{card.title}</span>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        </div>
      </div>
      {/* Card content */}
      {renderVisualization()}
    </div>
  )
}

export function AddCardModal({ isOpen, onClose, onAddCards, existingCardTypes = [] }: AddCardModalProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'browse'>('browse')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<CardSuggestion[]>([])
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [selectedBrowseCards, setSelectedBrowseCards] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(Object.keys(CARD_CATALOG)))
  const [hoveredCard, setHoveredCard] = useState<HoveredCard | null>(null)

  const handleGenerate = async () => {
    if (!query.trim()) return

    setIsGenerating(true)
    setSuggestions([])
    setSelectedCards(new Set())

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const results = generateCardSuggestions(query)
    setSuggestions(results)
    // Select all non-duplicate by default
    setSelectedCards(new Set(results.map((card, i) => existingCardTypes.includes(card.type) ? -1 : i).filter(i => i !== -1)))
    setIsGenerating(false)
  }

  const toggleCard = (index: number) => {
    const newSelected = new Set(selectedCards)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedCards(newSelected)
  }

  const toggleBrowseCard = (cardType: string) => {
    const newSelected = new Set(selectedBrowseCards)
    if (newSelected.has(cardType)) {
      newSelected.delete(cardType)
    } else {
      newSelected.add(cardType)
    }
    setSelectedBrowseCards(newSelected)
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Filter catalog by search
  const filteredCatalog = Object.entries(CARD_CATALOG).reduce((acc, [category, cards]) => {
    if (!browseSearch.trim()) {
      acc[category] = [...cards]
    } else {
      const search = browseSearch.toLowerCase()
      const filtered = cards.filter(
        card => card.title.toLowerCase().includes(search) ||
                card.description.toLowerCase().includes(search) ||
                card.type.toLowerCase().includes(search)
      )
      if (filtered.length > 0) {
        acc[category] = filtered
      }
    }
    return acc
  }, {} as Record<string, Array<{ type: string; title: string; description: string; visualization: string }>>)

  const handleAddCards = () => {
    const cardsToAdd = suggestions.filter((_, i) => selectedCards.has(i))
    onAddCards(cardsToAdd)
    onClose()
    setQuery('')
    setSuggestions([])
    setSelectedCards(new Set())
  }

  const handleAddBrowseCards = () => {
    const cardsToAdd: CardSuggestion[] = []
    const addedTypes = new Set<string>() // Track added types to prevent duplicates
    for (const cards of Object.values(CARD_CATALOG)) {
      for (const card of cards) {
        // Only add if selected AND not already added (prevents duplicates from multiple categories)
        if (selectedBrowseCards.has(card.type) && !addedTypes.has(card.type)) {
          addedTypes.add(card.type)
          cardsToAdd.push({
            type: card.type,
            title: card.title,
            description: card.description,
            visualization: card.visualization as CardSuggestion['visualization'],
            config: {},
          })
        }
      }
    }
    onAddCards(cardsToAdd)
    onClose()
    setBrowseSearch('')
    setSelectedBrowseCards(new Set())
  }

  const tabs = [
    { id: 'browse', label: 'Browse Cards', icon: LayoutGrid },
    { id: 'ai', label: 'AI Suggestions', icon: Sparkles },
  ]

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} size="xl">
      <BaseModal.Header
        title="Add Cards"
        icon={Plus}
        onClose={onClose}
        showBack={false}
      />

      <BaseModal.Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'ai' | 'browse')}
      />

      <BaseModal.Content className="max-h-[60vh]">
          {/* Browse Tab */}
          {activeTab === 'browse' && (
            <div className="flex gap-4">
              {/* Left side - Card catalog */}
              <div className="flex-1 min-w-0">
                {/* Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={browseSearch}
                      onChange={(e) => setBrowseSearch(e.target.value)}
                      placeholder="Search cards..."
                      className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                    />
                  </div>
                </div>

                {/* Card catalog */}
                <div className="max-h-[50vh] overflow-y-auto space-y-3">
                  {Object.entries(filteredCatalog).map(([category, cards]) => {
                    // Count how many cards in this category are not already added
                    const availableCards = cards.filter(c => !existingCardTypes.includes(c.type))
                    const allCategorySelected = availableCards.length > 0 && availableCards.every(c => selectedBrowseCards.has(c.type))

                    return (
                    <div key={category} className="border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center bg-secondary/50 hover:bg-secondary transition-colors">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="flex-1 px-3 py-2 text-left text-sm font-medium text-foreground flex items-center justify-between"
                        >
                          <span>{category}</span>
                          <span className="text-xs text-muted-foreground">
                            {cards.length} cards {expandedCategories.has(category) ? '▼' : '▶'}
                          </span>
                        </button>
                        {availableCards.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const newSelected = new Set(selectedBrowseCards)
                              if (allCategorySelected) {
                                // Deselect all from this category
                                availableCards.forEach(c => newSelected.delete(c.type))
                              } else {
                                // Select all from this category
                                availableCards.forEach(c => newSelected.add(c.type))
                              }
                              setSelectedBrowseCards(newSelected)
                            }}
                            className={`px-2 py-1 mr-2 text-xs rounded transition-colors ${
                              allCategorySelected
                                ? 'bg-purple-500/30 text-purple-300 hover:bg-purple-500/40'
                                : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                            }`}
                          >
                            {allCategorySelected ? 'Deselect All' : 'Add All'}
                          </button>
                        )}
                      </div>
                      {expandedCategories.has(category) && (
                        <div className="p-2 grid grid-cols-2 gap-2">
                          {cards.map((card) => {
                            const isAlreadyAdded = existingCardTypes.includes(card.type)
                            const isSelected = selectedBrowseCards.has(card.type)
                            return (
                              <button
                                key={card.type}
                                onClick={() => !isAlreadyAdded && toggleBrowseCard(card.type)}
                                onMouseEnter={() => setHoveredCard(card)}
                                onMouseLeave={() => setHoveredCard(null)}
                                disabled={isAlreadyAdded}
                                className={`p-2 rounded-lg text-left transition-all ${
                                  isAlreadyAdded
                                    ? 'bg-secondary/30 opacity-50 cursor-not-allowed'
                                    : isSelected
                                      ? 'bg-purple-500/20 border-2 border-purple-500'
                                      : 'bg-secondary/30 border-2 border-transparent hover:border-purple-500/30'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm">{visualizationIcons[card.visualization]}</span>
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {card.title}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {card.description}
                                </p>
                                {isAlreadyAdded && (
                                  <span className="text-xs text-muted-foreground">(Added)</span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )})}

                </div>

                {/* Browse footer */}
                {(() => {
                  // Calculate total available cards (not already added)
                  const allAvailableCards = Object.values(filteredCatalog).flat().filter(c => !existingCardTypes.includes(c.type))
                  const uniqueAvailableTypes = new Set(allAvailableCards.map(c => c.type))
                  const totalAvailable = uniqueAvailableTypes.size

                  return (
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {selectedBrowseCards.size > 0
                          ? `${selectedBrowseCards.size} card${selectedBrowseCards.size !== 1 ? 's' : ''} selected`
                          : `${totalAvailable} cards available`}
                      </span>
                      <div className="flex items-center gap-2">
                        {totalAvailable > 0 && selectedBrowseCards.size !== totalAvailable && (
                          <button
                            onClick={() => {
                              const newSelected = new Set(selectedBrowseCards)
                              uniqueAvailableTypes.forEach(type => newSelected.add(type))
                              setSelectedBrowseCards(newSelected)
                            }}
                            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                          >
                            Select All ({totalAvailable})
                          </button>
                        )}
                        {selectedBrowseCards.size > 0 && (
                          <>
                            <button
                              onClick={() => setSelectedBrowseCards(new Set())}
                              className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Clear
                            </button>
                            <button
                              onClick={handleAddBrowseCards}
                              className="px-4 py-2 bg-gradient-ks text-foreground rounded-lg font-medium flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Add {selectedBrowseCards.size} Card{selectedBrowseCards.size !== 1 ? 's' : ''}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Right side - Preview Panel (always rendered) */}
              <div className="w-64 border-l border-border pl-4 flex-shrink-0">
                {hoveredCard ? (
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Preview</div>

                    {/* Card preview - looks like actual card */}
                    <CardPreview card={hoveredCard} />

                    {/* Card info */}
                    <div className="mt-3 space-y-2">
                      <div>
                        <h3 className="text-sm font-medium text-foreground">
                          {hoveredCard.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {hoveredCard.description}
                        </p>
                      </div>

                      {/* Visualization type badge */}
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-secondary text-xs text-foreground capitalize">
                          {visualizationIcons[hoveredCard.visualization]} {hoveredCard.visualization}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
                    <LayoutGrid className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs text-center">Hover over a card<br />to see preview</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI Tab */}
          {activeTab === 'ai' && (
            <>
          {/* Query input */}
          <div className="mb-4">
            <label className="block text-sm text-muted-foreground mb-2">
              Describe what you want to see
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g., Show me GPU status, utilization, and any issues..."
                className="flex-1 px-4 py-2 bg-secondary rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <button
                onClick={handleGenerate}
                disabled={!query.trim() || isGenerating}
                className="px-4 py-2 bg-gradient-ks text-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Example queries */}
          {!suggestions.length && !isGenerating && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Show me GPU utilization and availability',
                  'What pods are having issues?',
                  'Helm releases and chart versions',
                  'Namespace quotas and RBAC',
                  'Operator status and CRDs',
                  'Kustomize and GitOps status',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
                    className="px-3 py-1 text-xs bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Suggested cards ({selectedCards.size} selected):
              </p>
              <div className="grid grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto">
                {suggestions.map((card, index) => {
                  const isAlreadyAdded = existingCardTypes.includes(card.type)
                  return (
                    <button
                      key={index}
                      onClick={() => !isAlreadyAdded && toggleCard(index)}
                      disabled={isAlreadyAdded}
                      className={`p-3 rounded-lg text-left transition-all ${
                        isAlreadyAdded
                          ? 'bg-secondary/30 border-2 border-transparent opacity-50 cursor-not-allowed'
                          : selectedCards.has(index)
                            ? 'bg-purple-500/20 border-2 border-purple-500'
                            : 'bg-secondary/50 border-2 border-transparent hover:border-purple-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{visualizationIcons[card.visualization]}</span>
                        <span className="text-sm font-medium text-foreground">
                          {card.title}
                        </span>
                        {isAlreadyAdded && (
                          <span className="text-xs text-muted-foreground">(Already added)</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {card.description}
                      </p>
                      <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground capitalize">
                        {card.visualization}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          </>
          )}
      </BaseModal.Content>

      {/* Footer - AI tab */}
      {activeTab === 'ai' && suggestions.length > 0 && (
        <BaseModal.Footer>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddCards}
              disabled={selectedCards.size === 0}
              className="px-4 py-2 bg-gradient-ks text-foreground rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add {selectedCards.size} Card{selectedCards.size !== 1 ? 's' : ''}
            </button>
          </div>
        </BaseModal.Footer>
      )}
    </BaseModal>
  )
}
