/**
 * Shared card catalog data — used by both the AddCardModal (legacy) and
 * the unified DashboardCustomizer.
 *
 * Extracted from AddCardModal.tsx to allow reuse without circular deps.
 */
import { ReactNode, createElement } from 'react'
import { TechnicalAcronym } from '../../shared/TechnicalAcronym'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardSuggestion {
  type: string
  title: string
  description: string
  visualization: 'gauge' | 'table' | 'timeseries' | 'events' | 'donut' | 'bar' | 'status' | 'sparkline'
  config: Record<string, unknown>
}

export interface HoveredCard {
  type: string
  title: string
  description: string
  visualization: string
}

// ---------------------------------------------------------------------------
// Helper: wrap technical abbreviations with tooltip components
// ---------------------------------------------------------------------------

/** List of abbreviations to wrap (order matters — longer ones first to avoid partial matches) */
const ABBREVIATIONS = [
  'ConfigMaps', 'ConfigMap', 'CrashLoopBackOff', 'OOMKilled',
  'RBAC', 'CRD', 'PVC', 'GPU', 'CPU', 'OLM', 'MCS', 'Secrets', 'Secret',
]

export function wrapAbbreviations(text: string): ReactNode {
  const pattern = new RegExp(`\\b(${ABBREVIATIONS.join('|')})\\b`, 'g')
  const parts: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined && match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index))
    }
    if (match.index !== undefined) {
      parts.push(
        createElement(TechnicalAcronym, { key: `${match.index}-${match[0]}`, term: match[0] }, match[0]),
      )
      lastIndex = match.index + match[0].length
    }
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

// ---------------------------------------------------------------------------
// CARD_CATALOG — browseable card inventory
// ---------------------------------------------------------------------------

/**
 * ⚠️  IMPORTANT: When you add a new card to the codebase (config + component),
 *     you MUST also add it here, otherwise it won't appear in the Browse Cards
 *     dialog and users won't be able to discover or add it.
 */
export const CARD_CATALOG = {
  'Cluster Admin': [
    { type: 'control_plane_health', title: 'Control Plane Health', description: 'API server, scheduler, controller manager, etcd status per cluster', visualization: 'status' },
    { type: 'predictive_health', title: 'Predictive Health', description: 'AI-powered resource exhaustion predictions and trend analysis', visualization: 'timeseries' },
    { type: 'node_debug', title: 'Node Debug', description: 'Run diagnostics on nodes — disk, memory, network, and process checks', visualization: 'table' },
    { type: 'node_conditions', title: 'Node Conditions', description: 'DiskPressure, MemoryPressure, PIDPressure with cordon/uncordon/drain actions', visualization: 'table' },
    { type: 'admission_webhooks', title: 'Admission Webhooks', description: 'Mutating and validating webhook inventory with failure policies', visualization: 'table' },
    { type: 'coredns_status', title: 'CoreDNS', description: 'CoreDNS pod health, restart counts, and cluster status', visualization: 'status' },
    { type: 'etcd_status', title: 'etcd Status', description: 'etcd member health, version, and restart counts', visualization: 'status' },
    { type: 'network_policies', title: 'Network Policies', description: 'Network policy coverage analysis by namespace', visualization: 'donut' },
    { type: 'rbac_explorer', title: 'RBAC Explorer', description: 'Cross-cluster RBAC risk analysis — find over-privileged accounts', visualization: 'table' },
    { type: 'maintenance_windows', title: 'Maintenance Windows', description: 'Schedule and track cluster maintenance windows', visualization: 'events' },
    { type: 'cluster_changelog', title: 'Cluster Changelog', description: 'Audit trail of changes across clusters from events', visualization: 'events' },
    { type: 'quota_heatmap', title: 'Quota Heatmap', description: 'Resource quota usage heatmap across namespaces', visualization: 'gauge' },
  ],
  'Cluster Health': [
    { type: 'cluster_health', title: 'Cluster Health', description: 'Health status of all clusters', visualization: 'status' },
    { type: 'cluster_metrics', title: 'Cluster Metrics', description: 'CPU, memory, and pod metrics over time', visualization: 'timeseries' },
    { type: 'cluster_locations', title: 'Cluster Locations', description: 'Clusters grouped by region and cloud provider', visualization: 'status' },
    { type: 'cluster_focus', title: 'Cluster Focus', description: 'Single cluster detailed view', visualization: 'status' },
    { type: 'cluster_comparison', title: 'Cluster Comparison', description: 'Side-by-side cluster metrics', visualization: 'bar' },
    { type: 'cluster_costs', title: 'Cluster Costs', description: 'Resource cost estimation', visualization: 'bar' },
    { type: 'upgrade_status', title: 'Cluster Upgrade Status', description: 'Available cluster upgrades', visualization: 'status' },
    { type: 'cluster_resource_tree', title: 'Cluster Resource Tree', description: 'Hierarchical view of cluster resources with search and filters', visualization: 'table' },
    { type: 'provider_health', title: 'Provider Health', description: 'Health and status of AI and cloud infrastructure providers', visualization: 'status' },
  ],
  'Workloads': [
    { type: 'deployment_status', title: 'Deployment Status', description: 'Deployment health across clusters', visualization: 'donut' },
    { type: 'deployment_issues', title: 'Deployment Issues', description: 'Deployments with problems', visualization: 'table' },
    { type: 'deployment_progress', title: 'Deployment Progress', description: 'Rolling update progress', visualization: 'gauge' },
    { type: 'pod_issues', title: 'Pod Issues', description: 'Pods with errors or restarts', visualization: 'table' },
    { type: 'top_pods', title: 'Top Pods', description: 'Highest resource consuming pods', visualization: 'bar' },
    { type: 'app_status', title: 'Workload Status', description: 'Workload health overview', visualization: 'donut' },
    { type: 'workload_deployment', title: 'Workloads', description: 'Multi-cluster workload deployment with status and scaling', visualization: 'table' },
    { type: 'cluster_groups', title: 'Cluster Groups', description: 'Define cluster groups and deploy workloads by dragging onto them', visualization: 'status' },
    { type: 'deployment_missions', title: 'Deployment Missions', description: 'Track deployment missions with per-cluster rollout progress', visualization: 'status' },
    { type: 'resource_marshall', title: 'Resource Marshall', description: 'Explore workload dependency trees — ConfigMaps, Secrets, RBAC, Services, and more', visualization: 'table' },
    { type: 'workload_monitor', title: 'Workload Monitor', description: 'Monitor all resources for a workload with health status, alerts, and AI diagnose/repair', visualization: 'status' },
    { type: 'statefulset_status', title: 'StatefulSet Status', description: 'StatefulSets across clusters with replica counts and update status', visualization: 'table' },
    { type: 'daemonset_status', title: 'DaemonSet Status', description: 'DaemonSets across clusters with scheduling and readiness', visualization: 'table' },
    { type: 'job_status', title: 'Job Status', description: 'Kubernetes Jobs with completion status and duration', visualization: 'table' },
    { type: 'cronjob_status', title: 'CronJob Status', description: 'CronJobs with schedules, last run, and active jobs', visualization: 'table' },
    { type: 'replicaset_status', title: 'ReplicaSet Status', description: 'ReplicaSets with desired vs ready replica counts', visualization: 'table' },
    { type: 'hpa_status', title: 'HPA Status', description: 'Horizontal Pod Autoscalers with scaling targets and metrics', visualization: 'table' },
    { type: 'configmap_status', title: 'ConfigMap Status', description: 'ConfigMaps across clusters with data key counts', visualization: 'table' },
    { type: 'secret_status', title: 'Secret Status', description: 'Secrets across clusters with types and key counts', visualization: 'table' },
    { type: 'kubevela_status', title: 'KubeVela', description: 'KubeVela controller health and OAM application delivery status', visualization: 'status' },
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
    { type: 'gpu_inventory_history', title: 'GPU Inventory History', description: 'Historical GPU allocation trends using metrics snapshots — shows usage over time with peak/min/avg stats', visualization: 'timeseries' },
    { type: 'gpu_node_health', title: 'GPU Node Health Monitor', description: 'Proactive health monitoring for GPU nodes — checks node readiness, GPU operator pods, stuck pods, and GPU reset events', visualization: 'status' },
    { type: 'node_status', title: 'Node Status', description: 'Kubernetes node status with conditions, roles, CPU, and memory capacity', visualization: 'table' },
  ],
  'Storage': [
    { type: 'storage_overview', title: 'Storage Overview', description: 'Total storage capacity and PVC summary', visualization: 'status' },
    { type: 'pvc_status', title: 'PVC Status', description: 'Persistent Volume Claims with status breakdown', visualization: 'table' },
    { type: 'pv_status', title: 'Persistent Volumes', description: 'Persistent Volumes with capacity, access modes, and reclaim policy', visualization: 'table' },
  ],
  'Network': [
    { type: 'network_overview', title: 'Network Overview', description: 'Services breakdown by type and namespace', visualization: 'status' },
    { type: 'service_status', title: 'Service Status', description: 'Service list with type and ports', visualization: 'table' },
    { type: 'cluster_network', title: 'Cluster Network', description: 'API server and network info', visualization: 'status' },
    { type: 'service_exports', title: 'Service Exports (MCS)', description: 'Multi-cluster service exports for cross-cluster discovery', visualization: 'table' },
    { type: 'service_imports', title: 'Service Imports (MCS)', description: 'Multi-cluster service imports receiving cross-cluster traffic', visualization: 'table' },
    { type: 'gateway_status', title: 'Gateway API', description: 'Kubernetes Gateway API resources and HTTPRoutes', visualization: 'status' },
    { type: 'service_topology', title: 'Service Topology', description: 'Animated service mesh visualization with cross-cluster traffic', visualization: 'status' },
    { type: 'ingress_status', title: 'Ingress Status', description: 'Ingress resources with hosts, paths, and backend services', visualization: 'table' },
    { type: 'network_policy_status', title: 'Network Policy Status', description: 'NetworkPolicy resources with pod selectors and rules', visualization: 'table' },
    { type: 'network_trace', title: 'Network Traces', description: 'Live network connection tracing via Inspektor Gadget eBPF', visualization: 'table' },
    { type: 'dns_trace', title: 'DNS Traces', description: 'Live DNS query tracing via Inspektor Gadget eBPF', visualization: 'table' },
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
    { type: 'operator_subscription_status', title: 'Operator Subscription Status', description: 'OLM subscriptions with install plans and approval status', visualization: 'table' },
  ],
  'Namespaces': [
    { type: 'namespace_monitor', title: 'Namespace Monitor', description: 'Real-time resource monitoring with change detection and animations', visualization: 'table' },
    { type: 'namespace_overview', title: 'Namespace Overview', description: 'Namespace resources and health', visualization: 'status' },
    { type: 'namespace_quotas', title: 'Namespace Quotas', description: 'Resource quota usage', visualization: 'gauge' },
    { type: 'namespace_rbac', title: 'Namespace RBAC', description: 'Roles, bindings, service accounts', visualization: 'table' },
    { type: 'namespace_events', title: 'Namespace Events', description: 'Events in namespace', visualization: 'events' },
    { type: 'namespace_status', title: 'Namespace Status', description: 'Namespaces across clusters with status and age', visualization: 'table' },
    { type: 'resource_quota_status', title: 'Resource Quotas', description: 'Resource quota definitions with hard limits per namespace', visualization: 'table' },
    { type: 'limit_range_status', title: 'Limit Ranges', description: 'LimitRange defaults and constraints per namespace', visualization: 'table' },
    { type: 'service_account_status', title: 'Service Accounts', description: 'Service accounts across clusters and namespaces', visualization: 'table' },
  ],
  'Crossplane': [
    { type: 'crossplane_managed_resources', title: 'Crossplane Managed Resources', description: 'View all Crossplane managed resources including status, provider, and sync conditions', visualization: 'table' },
  ],
  'Security & Events': [
    { type: 'security_issues', title: 'Security Issues', description: 'Security findings and vulnerabilities', visualization: 'table' },
    { type: 'event_stream', title: 'Event Stream', description: 'Live Kubernetes event feed', visualization: 'events' },
    { type: 'pod_logs', title: 'Pod Logs', description: 'Tail container logs for any pod across your clusters', visualization: 'events' },
    { type: 'event_summary', title: 'Event Summary', description: 'Aggregated event counts grouped by type and reason', visualization: 'status' },
    { type: 'warning_events', title: 'Warning Events', description: 'Warning-level events that may need attention', visualization: 'events' },
    { type: 'recent_events', title: 'Recent Events', description: 'Most recent events across all clusters', visualization: 'events' },
    { type: 'user_management', title: 'User Management', description: 'Console users and Kubernetes RBAC', visualization: 'table' },
    { type: 'role_status', title: 'Roles', description: 'Kubernetes Roles across clusters and namespaces', visualization: 'table' },
    { type: 'role_binding_status', title: 'Role Bindings', description: 'RoleBindings linking subjects to roles', visualization: 'table' },
    { type: 'process_trace', title: 'Process Traces', description: 'Live process execution tracing via Inspektor Gadget eBPF', visualization: 'table' },
    { type: 'security_audit', title: 'Security Audit', description: 'Security audit using Inspektor Gadget eBPF-based runtime analysis', visualization: 'table' },
  ],
  'Live Trends': [
    { type: 'events_timeline', title: 'Events Timeline', description: 'Warning vs normal events over time with live data', visualization: 'timeseries' },
    { type: 'pod_health_trend', title: 'Pod Health Trend', description: 'Healthy/unhealthy/pending pods over time', visualization: 'timeseries' },
    { type: 'resource_trend', title: 'Resource Trend', description: 'CPU, memory, pods, nodes over time', visualization: 'timeseries' },
    { type: 'gpu_utilization', title: 'GPU Utilization', description: 'GPU allocation trend with donut chart', visualization: 'timeseries' },
  ],
  'AI Agents': [
    { type: 'kagenti_status', title: 'Kagenti Overview', description: 'Agent platform status — agents, tools, builds, and security posture across clusters', visualization: 'status' },
    { type: 'kagenti_agent_fleet', title: 'Agent Fleet', description: 'Full agent management table with status, framework, and replicas', visualization: 'table' },
    { type: 'kagenti_build_pipeline', title: 'Build Pipeline', description: 'Agent build status with source, pipeline, and progress tracking', visualization: 'status' },
    { type: 'kagenti_tool_registry', title: 'MCP Tool Registry', description: 'Centralized view of MCP tools registered through kagenti gateway', visualization: 'table' },
    { type: 'kagenti_agent_discovery', title: 'Agent Discovery', description: 'AgentCard-based A2A discovery with skills, capabilities, and sync status', visualization: 'status' },
    { type: 'kagenti_security', title: 'Security Posture', description: 'SPIFFE identity binding coverage and unbound agent warnings', visualization: 'gauge' },
    { type: 'kagenti_topology', title: 'Agent Topology', description: 'Visual graph of agent-to-agent and agent-to-tool relationships', visualization: 'status' },
  ],
  'AI Assistant': [
    { type: 'console_ai_issues', title: 'AI Issues', description: 'AI-powered issue detection and repair', visualization: 'status' },
    { type: 'console_ai_kubeconfig_audit', title: 'AI Kubeconfig Audit', description: 'Audit kubeconfig for stale contexts', visualization: 'status' },
    { type: 'console_ai_health_check', title: 'AI Health Check', description: 'Comprehensive AI health analysis', visualization: 'gauge' },
    { type: 'console_ai_offline_detection', title: 'Offline Detection', description: 'Detect offline nodes and unavailable GPUs', visualization: 'status' },
    { type: 'hardware_health', title: 'Hardware Health', description: 'Track GPU, NIC, NVMe, InfiniBand disappearances on SuperMicro/HGX nodes', visualization: 'status' },
  ],
  'Alerting': [
    { type: 'alert_rules', title: 'Alert Rules', description: 'Manage alert rules and notification channels', visualization: 'table' },
  ],
  'Cost Management': [
    { type: 'cluster_costs', title: 'Cluster Costs', description: 'Resource cost estimation by cluster with cloud provider pricing', visualization: 'bar' },
    { type: 'opencost_overview', title: 'OpenCost', description: 'Cost allocation by namespace using OpenCost (demo)', visualization: 'bar' },
    { type: 'kubecost_overview', title: 'Kubecost', description: 'Cost optimization and savings recommendations (demo)', visualization: 'bar' },
  ],
  'Security Posture': [
    { type: 'iso27001_audit', title: 'ISO 27001 Audit', description: 'Interactive ISO 27001 compliance checklist with 70 Kubernetes security controls', visualization: 'status' },
    { type: 'opa_policies', title: 'OPA Gatekeeper', description: 'Policy enforcement with OPA Gatekeeper - shows installed status per cluster', visualization: 'status' },
    { type: 'kyverno_policies', title: 'Kyverno Policies', description: 'Kubernetes-native policy management with Kyverno', visualization: 'status' },
    { type: 'falco_alerts', title: 'Falco Alerts', description: 'Runtime security monitoring - syscall anomalies, container escapes, privilege escalation', visualization: 'events' },
    { type: 'trivy_scan', title: 'Trivy Scanner', description: 'Vulnerability scanning for container images, IaC, and secrets', visualization: 'table' },
    { type: 'kubescape_scan', title: 'Kubescape', description: 'Security posture management and NSA/CISA hardening compliance', visualization: 'status' },
    { type: 'policy_violations', title: 'Policy Violations', description: 'Aggregated policy violations across all enforcement tools', visualization: 'table' },
    { type: 'compliance_score', title: 'Compliance Score', description: 'Overall compliance posture with drill-down by framework (CIS, NSA, PCI-DSS)', visualization: 'gauge' },
    { type: 'recommended_policies', title: 'Recommended Policies', description: 'AI-powered policy gap analysis with one-click fleet-wide deployment', visualization: 'status' },
    { type: 'fleet_compliance_heatmap', title: 'Fleet Compliance Heatmap', description: 'Cross-cluster compliance grid showing tool status per cluster', visualization: 'status' },
    { type: 'compliance_drift', title: 'Compliance Drift', description: 'Detect clusters deviating from fleet compliance baseline', visualization: 'status' },
    { type: 'cross_cluster_policy_comparison', title: 'Cross-Cluster Policy Comparison', description: 'Compare Kyverno policy deployment across clusters', visualization: 'table' },
    { type: 'trestle_scan', title: 'Compliance Trestle (OSCAL)', description: 'OSCAL compliance assessment via Compliance Trestle (CNCF Sandbox)', visualization: 'status' },
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
    { type: 'llm_inference', title: 'llm-d inference', description: 'vLLM, llm-d, and TGI inference server status', visualization: 'status' },
    { type: 'llm_models', title: 'llm-d models', description: 'Deployed language models with memory and GPU allocation', visualization: 'table' },
    { type: 'ml_jobs', title: 'ML Training Jobs', description: 'Kubeflow, Ray, or custom ML training job status', visualization: 'table' },
    { type: 'ml_notebooks', title: 'ML Notebooks', description: 'Running Jupyter notebook servers and resource usage', visualization: 'table' },
    { type: 'llmd_stack_monitor', title: 'llm-d Stack Monitor', description: 'Monitor the full llm-d inference stack with AI diagnosis', visualization: 'status' },
    { type: 'prow_ci_monitor', title: 'Prow CI Monitor', description: 'Monitor Prow CI jobs with stats, failure analysis, and AI repair', visualization: 'table' },
    { type: 'github_ci_monitor', title: 'GitHub CI Monitor', description: 'Monitor GitHub Actions workflows across repos', visualization: 'table' },
    { type: 'cluster_health_monitor', title: 'Cluster Health Monitor', description: 'Monitor cluster health with pod/deployment issue tracking', visualization: 'status' },
    { type: 'nightly_e2e_status', title: 'Nightly E2E Status', description: 'llm-d nightly E2E workflow status across OCP and GKE platforms', visualization: 'status' },
  ],
  'Multi-Cluster Insights': [
    { type: 'cross_cluster_event_correlation', title: 'Cross-Cluster Event Correlation', description: 'Unified timeline showing correlated warning events across multiple clusters', visualization: 'events' },
    { type: 'cluster_delta_detector', title: 'Cluster Delta Detector', description: 'Detects differences between clusters sharing the same workloads', visualization: 'table' },
    { type: 'cascade_impact_map', title: 'Cascade Impact Map', description: 'Visualizes how issues cascade across clusters over time', visualization: 'status' },
    { type: 'config_drift_heatmap', title: 'Config Drift Heatmap', description: 'Cluster-pair matrix showing degree of configuration drift', visualization: 'status' },
    { type: 'resource_imbalance_detector', title: 'Resource Imbalance Detector', description: 'Detects CPU/memory utilization skew across the fleet', visualization: 'gauge' },
    { type: 'restart_correlation_matrix', title: 'Restart Correlation Matrix', description: 'Detects horizontal (app bug) vs vertical (infra issue) restart patterns', visualization: 'table' },
    { type: 'deployment_rollout_tracker', title: 'Deployment Rollout Tracker', description: 'Tracks deployment rollout progress across clusters', visualization: 'status' },
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
    { type: 'kube_chess', title: 'AI Chess', description: 'Play chess against an AI opponent with multiple difficulty levels', visualization: 'status' },
    { type: 'solitaire', title: 'Kube Solitaire', description: 'Classic Klondike solitaire with Kubernetes-themed suits', visualization: 'status' },
    { type: 'match_game', title: 'Kube Match', description: 'Memory matching game with Kubernetes-themed cards', visualization: 'status' },
    { type: 'kubedle', title: 'Kubedle', description: 'Wordle-style word guessing game with Kubernetes terms', visualization: 'status' },
    { type: 'sudoku_game', title: 'Sudoku', description: 'Brain-training Sudoku puzzle with multiple difficulty levels, hints, and timer', visualization: 'status' },
    { type: 'pod_brothers', title: 'Pod Brothers', description: 'Mario Bros-style platformer - jump between platforms collecting pods', visualization: 'status' },
    { type: 'kube_kart', title: 'Kube Kart', description: 'Top-down racing game with power-ups and lap times', visualization: 'status' },
    { type: 'kube_pong', title: 'Kube Pong', description: 'Classic Pong game - play against AI with adjustable difficulty', visualization: 'status' },
    { type: 'kube_snake', title: 'Kube Snake', description: 'Classic Snake game - grow by collecting dots without hitting walls', visualization: 'status' },
    { type: 'kube_galaga', title: 'Kube Galaga', description: 'Space shooter with enemy waves and power-ups', visualization: 'status' },
    { type: 'kube_bert', title: 'Kube Bert', description: 'Q*bert-style pyramid hopper — change every tile while dodging enemies', visualization: 'status' },
    { type: 'missile_command', title: 'Missile Command', description: 'Defend your Kubernetes clusters from incoming missiles', visualization: 'status' },
    { type: 'kube_doom', title: 'Kube Doom', description: 'Raycasting FPS - eliminate rogue CrashPods, OOMKillers, and ZombieDeploys', visualization: 'status' },
    { type: 'pod_crosser', title: 'Pod Crosser', description: 'Frogger-style game - guide your pod across traffic and rivers', visualization: 'status' },
  ],
  'Utilities': [
    { type: 'network_utils', title: 'Network Utils', description: 'Ping hosts, check ports, and view network information', visualization: 'status' },
    { type: 'mobile_browser', title: 'Mobile Browser', description: 'iPhone-style mobile web browser with tabs and bookmarks', visualization: 'status' },
    { type: 'rss_feed', title: 'RSS Feed', description: 'Read RSS feeds from Reddit, Hacker News, tech blogs, and more', visualization: 'events' },
    { type: 'iframe_embed', title: 'Iframe Embed', description: 'Embed external dashboards like Grafana, Prometheus, or Kibana', visualization: 'status' },
  ],
  'Misc': [
    { type: 'buildpacks_status', title: 'Buildpacks Status', description: 'Cloud Native Buildpacks detection, builders, and image build status', visualization: 'status' },
    { type: 'flatcar_status', title: 'Flatcar Container Linux', description: 'Flatcar node OS versions, update status, and version distribution', visualization: 'status' },
    { type: 'crio_status', title: 'CRI-O', description: 'CRI-O container runtime metrics, image pulls, and pod sandbox status', visualization: 'status' },
    { type: 'github_activity', title: 'GitHub Activity', description: 'Monitor GitHub repository activity - PRs, issues, releases, and contributors', visualization: 'table' },
    { type: 'kubectl', title: 'Kubectl', description: 'Interactive kubectl terminal with AI assistance, YAML editor, and command history', visualization: 'table' },
  ],
  'Multi-Tenancy': [
    { type: 'tenant_topology', title: 'Tenant Architecture', description: 'Interactive SVG topology of the multi-tenancy architecture with live status', visualization: 'chart' },
    { type: 'tenant_isolation_setup', title: 'Tenant Isolation Setup', description: 'AI-powered multi-tenancy setup wizard', visualization: 'status' },
    { type: 'multi_tenancy_overview', title: 'Multi-Tenancy Overview', description: 'Aggregated tenant isolation status', visualization: 'status' },
    { type: 'ovn_status', title: 'OVN-Kubernetes', description: 'OVN network and UDN status', visualization: 'status' },
    { type: 'kubeflex_status', title: 'KubeFlex', description: 'Control plane management', visualization: 'status' },
    { type: 'k3s_status', title: 'K3s', description: 'Lightweight Kubernetes clusters', visualization: 'status' },
    { type: 'kubevirt_status', title: 'KubeVirt Status', description: 'VM status across clusters with per-cluster breakdown, CPU/memory, and health', visualization: 'status' },
  ],
  'Orchestration': [
    { type: 'keda_status', title: 'KEDA', description: 'KEDA autoscaler status, scaled object metrics, and trigger queue depths', visualization: 'status' },
    { type: 'kubevela_status', title: 'KubeVela', description: 'KubeVela application delivery, component status, and workflow progress', visualization: 'status' },
    { type: 'karmada_status', title: 'Karmada', description: 'Karmada multi-cluster resource propagation status, member clusters, and policy health', visualization: 'status' },
    { type: 'kuberay_fleet', title: 'KubeRay Fleet', description: 'KubeRay fleet monitoring — RayCluster, RayService, and RayJob status across all clusters with GPU allocation tracking', visualization: 'status' },
    { type: 'failover_timeline', title: 'Failover Timeline', description: 'Cross-region failover forensics — Karmada ResourceBinding transitions, cluster outages, and recovery events', visualization: 'timeline' },
    { type: 'trino_gateway', title: 'Trino Gateway', description: 'Trino coordinator/worker fleet status with gateway routing health and per-cluster query metrics', visualization: 'status' },
    { type: 'slo_compliance', title: 'SLO Compliance', description: 'Service Level Objective tracking with error budget burn rate, compliance gauges, and per-cluster SLO status', visualization: 'metrics' },
  ],
  'Serverless': [
    { type: 'cloudevents_status', title: 'CloudEvents', description: 'CloudEvents message flow, event source tracking, and delivery status', visualization: 'status' },
  ],
  'Streaming & Messaging': [
    { type: 'strimzi_status', title: 'Strimzi', description: 'Strimzi Kafka cluster health, topic status, and consumer group lag', visualization: 'status' },
  ],
} as const

// ---------------------------------------------------------------------------
// Recommended cards & i18n category keys
// ---------------------------------------------------------------------------

/**
 * Popularity-ordered card types for the "Recommended for you" section.
 * Based on GA4 data — these are the most useful cards for new users.
 */
export const RECOMMENDED_CARD_TYPES = [
  'cluster_health', 'resource_usage', 'pod_issues',
  'deployment_status', 'event_stream', 'gpu_overview',
  'cluster_metrics', 'security_issues', 'node_status',
  'helm_release_status', 'namespace_monitor', 'active_alerts',
] as const

/** Maximum recommended cards shown in the "Recommended for you" section */
export const MAX_RECOMMENDED_CARDS = 5

/** Maps CARD_CATALOG category names to i18n keys in cards:categories.* */
export const CATEGORY_LOCALE_KEYS: Record<string, string> = {
  'Cluster Admin': 'clusterAdmin',
  'Cluster Health': 'clusterHealth',
  'Workloads': 'workloads',
  'Compute': 'compute',
  'Storage': 'storage',
  'Network': 'network',
  'GitOps': 'gitops',
  'ArgoCD': 'argocd',
  'Operators': 'operators',
  'Namespaces': 'namespaces',
  'Security & Events': 'securityEvents',
  'Live Trends': 'trends',
  'AI Agents': 'aiAgents',
  'AI Assistant': 'aiAssistant',
  'Alerting': 'alerting',
  'Cost Management': 'costManagement',
  'Security Posture': 'securityPosture',
  'Data Compliance': 'dataCompliance',
  'Workload Detection': 'workloadDetection',
  'Multi-Cluster Insights': 'multiClusterInsights',
  'Arcade': 'arcade',
  'Utilities': 'utilities',
  'Misc': 'misc',
  'Runtime': 'runtime',
  'Orchestration': 'orchestration',
  'Serverless': 'serverless',
  'Streaming & Messaging': 'streamingMessaging',
}

// ---------------------------------------------------------------------------
// Visualization icons
// ---------------------------------------------------------------------------

export const visualizationIcons: Record<string, string> = {
  gauge: '\u23F1\uFE0F',
  table: '\uD83D\uDCCB',
  timeseries: '\uD83D\uDCC8',
  events: '\uD83D\uDCDC',
  donut: '\uD83C\uDF69',
  bar: '\uD83D\uDCCA',
  status: '\uD83D\uDEA6',
  sparkline: '\u3030\uFE0F',
}

// ---------------------------------------------------------------------------
// AI card suggestion engine (keyword-based)
// ---------------------------------------------------------------------------

/** Simulated AI response — in production this would call Claude API */
export function generateCardSuggestions(query: string): CardSuggestion[] {
  const lowerQuery = query.toLowerCase()

  if (lowerQuery.includes('provider') || lowerQuery.includes('ai provider') || lowerQuery.includes('cloud provider') || lowerQuery.includes('infrastructure health')) {
    return [
      { type: 'provider_health', title: 'Provider Health', description: 'Health and status of AI and cloud infrastructure providers', visualization: 'status', config: {} },
      { type: 'cluster_health', title: 'Cluster Health', description: 'Health status of all clusters', visualization: 'status', config: {} },
      { type: 'active_alerts', title: 'Active Alerts', description: 'Firing alerts with severity', visualization: 'status', config: {} },
    ]
  }

  if (lowerQuery.includes('hardware') || lowerQuery.includes('supermicro') || lowerQuery.includes('hgx') || lowerQuery.includes('nic') || lowerQuery.includes('nvme') || lowerQuery.includes('infiniband') || lowerQuery.includes('mellanox')) {
    return [
      { type: 'hardware_health', title: 'Hardware Health', description: 'Track GPU, NIC, NVMe, InfiniBand disappearances on SuperMicro/HGX nodes', visualization: 'status', config: {} },
      { type: 'gpu_overview', title: 'GPU Overview', description: 'Total GPUs across all clusters', visualization: 'gauge', config: {} },
      { type: 'console_ai_offline_detection', title: 'Offline Detection', description: 'Detect offline nodes and unavailable GPUs', visualization: 'status', config: {} },
    ]
  }

  if (lowerQuery.includes('gpu')) {
    return [
      { type: 'gpu_overview', title: 'GPU Overview', description: 'Total GPUs across all clusters', visualization: 'gauge', config: { metric: 'gpu_utilization' } },
      { type: 'gpu_status', title: 'GPU Status', description: 'GPUs by state', visualization: 'donut', config: { groupBy: 'status' } },
      { type: 'gpu_list', title: 'GPU Inventory', description: 'Detailed GPU list with status', visualization: 'table', config: { columns: ['node', 'gpu_type', 'memory', 'status', 'utilization'] } },
      { type: 'gpu_issues', title: 'GPU Issues', description: 'GPUs with problems', visualization: 'events', config: { filter: 'gpu_issues' } },
      { type: 'gpu_workloads', title: 'GPU Workloads', description: 'Pods running on GPU nodes', visualization: 'table', config: {} },
      { type: 'gpu_inventory_history', title: 'GPU Inventory History', description: 'Historical GPU allocation trends', visualization: 'timeseries', config: {} },
    ]
  }

  if (lowerQuery.includes('memory') || lowerQuery.includes('ram')) {
    return [
      { type: 'memory_usage', title: 'Memory Usage', description: 'Current memory utilization', visualization: 'gauge', config: { metric: 'memory_usage' } },
      { type: 'memory_trend', title: 'Memory Trend', description: 'Memory usage over time', visualization: 'timeseries', config: { metric: 'memory', period: '1h' } },
    ]
  }

  if (lowerQuery.includes('cpu') || lowerQuery.includes('processor')) {
    return [
      { type: 'cpu_usage', title: 'CPU Usage', description: 'Current CPU utilization', visualization: 'gauge', config: { metric: 'cpu_usage' } },
      { type: 'cpu_trend', title: 'CPU Trend', description: 'CPU usage over time', visualization: 'timeseries', config: { metric: 'cpu', period: '1h' } },
      { type: 'top_cpu_pods', title: 'Top CPU Consumers', description: 'Pods using most CPU', visualization: 'bar', config: { metric: 'cpu', limit: 10 } },
    ]
  }

  if (lowerQuery.includes('pod')) {
    return [
      { type: 'pod_status', title: 'Pod Status', description: 'Pods by state', visualization: 'donut', config: { groupBy: 'status' } },
      { type: 'pod_list', title: 'Pod List', description: 'All pods with details', visualization: 'table', config: { columns: ['name', 'namespace', 'status', 'restarts', 'age'] } },
    ]
  }

  if (lowerQuery.includes('cluster')) {
    return [
      { type: 'cluster_health', title: 'Cluster Health', description: 'Health status of all clusters', visualization: 'status', config: {} },
      { type: 'cluster_focus', title: 'Cluster Focus', description: 'Single cluster detailed view', visualization: 'status', config: {} },
      { type: 'cluster_comparison', title: 'Cluster Comparison', description: 'Side-by-side cluster metrics', visualization: 'bar', config: {} },
      { type: 'cluster_network', title: 'Cluster Network', description: 'API server and network info', visualization: 'status', config: {} },
    ]
  }

  if (lowerQuery.includes('namespace') || lowerQuery.includes('quota') || lowerQuery.includes('rbac')) {
    return [
      { type: 'namespace_overview', title: 'Namespace Overview', description: 'Namespace resources and health', visualization: 'status', config: {} },
      { type: 'namespace_quotas', title: 'Namespace Quotas', description: 'Resource quota usage', visualization: 'gauge', config: {} },
      { type: 'namespace_rbac', title: 'Namespace RBAC', description: 'Roles, bindings, service accounts', visualization: 'table', config: {} },
      { type: 'namespace_events', title: 'Namespace Events', description: 'Events in namespace', visualization: 'events', config: {} },
    ]
  }

  if (lowerQuery.includes('operator') || lowerQuery.includes('olm') || lowerQuery.includes('crd')) {
    return [
      { type: 'operator_status', title: 'Operator Status', description: 'OLM operator health', visualization: 'status', config: {} },
      { type: 'operator_subscriptions', title: 'Operator Subscriptions', description: 'Subscriptions and pending upgrades', visualization: 'table', config: {} },
      { type: 'crd_health', title: 'CRD Health', description: 'Custom resource definitions status', visualization: 'status', config: {} },
    ]
  }

  if (lowerQuery.includes('helm') || lowerQuery.includes('chart') || lowerQuery.includes('release')) {
    return [
      { type: 'helm_release_status', title: 'Helm Releases', description: 'Release status and versions', visualization: 'status', config: {} },
      { type: 'helm_values_diff', title: 'Helm Values Diff', description: 'Compare values vs defaults', visualization: 'table', config: {} },
      { type: 'helm_history', title: 'Helm History', description: 'Release revision history', visualization: 'events', config: {} },
      { type: 'chart_versions', title: 'Helm Chart Versions', description: 'Available chart upgrades', visualization: 'table', config: {} },
    ]
  }

  if (lowerQuery.includes('kustomize') || lowerQuery.includes('flux') || lowerQuery.includes('overlay')) {
    return [
      { type: 'kustomization_status', title: 'Kustomization Status', description: 'Flux kustomizations health', visualization: 'status', config: {} },
      { type: 'overlay_comparison', title: 'Overlay Comparison', description: 'Compare kustomize overlays', visualization: 'table', config: {} },
      { type: 'gitops_drift', title: 'GitOps Drift', description: 'Detect configuration drift', visualization: 'status', config: {} },
    ]
  }

  if (lowerQuery.includes('cost') || lowerQuery.includes('price') || lowerQuery.includes('expense')) {
    return [
      { type: 'cluster_costs', title: 'Cluster Costs', description: 'Resource cost estimation', visualization: 'bar', config: {} },
      { type: 'resource_usage', title: 'Resource Usage', description: 'CPU and memory consumption', visualization: 'gauge', config: {} },
    ]
  }

  if (lowerQuery.includes('policy') || lowerQuery.includes('opa') || lowerQuery.includes('gatekeeper') || lowerQuery.includes('kyverno') || lowerQuery.includes('compliance')) {
    return [
      { type: 'opa_policies', title: 'OPA Gatekeeper', description: 'Policy enforcement with OPA Gatekeeper', visualization: 'status', config: {} },
      { type: 'kyverno_policies', title: 'Kyverno Policies', description: 'Kubernetes-native policy management', visualization: 'status', config: {} },
      { type: 'security_issues', title: 'Security Issues', description: 'Security findings and vulnerabilities', visualization: 'table', config: {} },
    ]
  }

  if (lowerQuery.includes('user') || lowerQuery.includes('service account') || lowerQuery.includes('access') || lowerQuery.includes('permission')) {
    return [
      { type: 'user_management', title: 'User Management', description: 'Console users and Kubernetes RBAC', visualization: 'table', config: {} },
      { type: 'namespace_rbac', title: 'Namespace RBAC', description: 'Roles, bindings, service accounts', visualization: 'table', config: {} },
    ]
  }

  if (lowerQuery.includes('event') || lowerQuery.includes('log') || lowerQuery.includes('error')) {
    return [
      { type: 'pod_logs', title: 'Pod Logs', description: 'Tail container logs for any pod', visualization: 'events', config: {} },
      { type: 'event_stream', title: 'Event Stream', description: 'Live event feed', visualization: 'events', config: { filter: 'all' } },
      { type: 'events_timeline', title: 'Events Timeline', description: 'Warning vs normal events over time', visualization: 'timeseries', config: {} },
      { type: 'error_count', title: 'Errors Over Time', description: 'Error count trend', visualization: 'sparkline', config: { metric: 'errors' } },
    ]
  }

  if (lowerQuery.includes('trend') || lowerQuery.includes('analytics') || lowerQuery.includes('over time') || lowerQuery.includes('history')) {
    return [
      { type: 'events_timeline', title: 'Events Timeline', description: 'Warning vs normal events over time', visualization: 'timeseries', config: {} },
      { type: 'pod_health_trend', title: 'Pod Health Trend', description: 'Healthy/unhealthy/pending pods over time', visualization: 'timeseries', config: {} },
      { type: 'resource_trend', title: 'Resource Trend', description: 'CPU, memory, pods, nodes over time', visualization: 'timeseries', config: {} },
      { type: 'gpu_utilization', title: 'GPU Utilization', description: 'GPU allocation trend with utilization chart', visualization: 'timeseries', config: {} },
    ]
  }

  return [
    { type: 'custom_query', title: 'Custom Metric', description: 'Based on your query', visualization: 'timeseries', config: { query } },
  ]
}
