// Card title and description registries
// Pure data — no runtime dependencies

export const CARD_TITLES: Record<string, string> = {
  // Core cluster cards
  cluster_health: 'Cluster Health',
  cluster_focus: 'Cluster Focus',
  cluster_network: 'Cluster Network',
  cluster_comparison: 'Cluster Comparison',
  cluster_costs: 'Cluster Costs',
  cluster_metrics: 'Cluster Metrics',
  cluster_locations: 'Cluster Locations',
  cluster_resource_tree: 'Cluster Resource Tree',

  // Workload and deployment cards
  app_status: 'Workload Status',
  workload_deployment: 'Workloads',
  deployment_missions: 'Deployment Missions',
  deployment_progress: 'Deployment Progress',
  deployment_status: 'Deployment Status',
  deployment_issues: 'Deployment Issues',
  statefulset_status: 'StatefulSet Status',
  daemonset_status: 'DaemonSet Status',
  replicaset_status: 'ReplicaSet Status',
  job_status: 'Job Status',
  cronjob_status: 'CronJob Status',
  hpa_status: 'HPA Status',
  cluster_groups: 'Cluster Groups',
  resource_marshall: 'Resource Marshall',
  workload_monitor: 'Workload Monitor',
  llmd_stack_monitor: 'llm-d Stack Monitor',
  prow_ci_monitor: 'PROW CI Monitor',
  github_ci_monitor: 'GitHub CI Monitor',
  cluster_health_monitor: 'Cluster Health Monitor',

  // Pod and resource cards
  pod_issues: 'Pod Issues',
  top_pods: 'Top Pods',
  resource_capacity: 'Resource Capacity',
  resource_usage: 'Resource Allocation',
  compute_overview: 'Compute Overview',
  node_status: 'Node Status',

  // Events
  event_stream: 'Event Stream',
  event_summary: 'Event Summary',
  warning_events: 'Warning Events',
  recent_events: 'Recent Events',
  events_timeline: 'Events Timeline',

  // Trend cards
  pod_health_trend: 'Pod Health Trend',
  resource_trend: 'Resource Trend',

  // Storage and network
  storage_overview: 'Storage Overview',
  pvc_status: 'PVC Status',
  pv_status: 'PV Status',
  resource_quota_status: 'Resource Quota Status',
  network_overview: 'Network Overview',
  service_status: 'Service Status',
  ingress_status: 'Ingress Status',
  network_policy_status: 'Network Policy Status',

  // Namespace cards
  namespace_overview: 'Namespace Overview',
  namespace_analysis: 'Namespace Analysis',
  namespace_rbac: 'Namespace RBAC',
  namespace_quotas: 'Namespace Quotas',
  namespace_events: 'Namespace Events',
  namespace_monitor: 'Namespace Monitor',

  // Operator cards
  operator_status: 'Operator Status',
  operator_subscriptions: 'Operator Subscriptions',
  operator_subscription_status: 'Operator Subscription Status',
  crd_health: 'CRD Health',
  configmap_status: 'ConfigMap Status',

  // Helm/GitOps cards
  gitops_drift: 'GitOps Drift',
  helm_release_status: 'Helm Release Status',
  helm_releases: 'Helm Releases',
  helm_history: 'Helm History',
  helm_values_diff: 'Helm Values Diff',
  kustomization_status: 'Kustomization Status',
  buildpacks_status: 'Buildpacks Status',
  overlay_comparison: 'Overlay Comparison',
  chart_versions: 'Helm Chart Versions',

  // ArgoCD cards
  argocd_applications: 'ArgoCD Applications',
  argocd_sync_status: 'ArgoCD Sync Status',
  argocd_health: 'ArgoCD Health',

  // GPU and hardware cards
  gpu_overview: 'GPU Overview',
  gpu_status: 'GPU Status',
  gpu_inventory: 'GPU Inventory',
  gpu_workloads: 'GPU Workloads',
  gpu_utilization: 'GPU Utilization',
  gpu_usage_trend: 'GPU Usage Trend',
  gpu_namespace_allocations: 'GPU Namespace Allocations',
  gpu_inventory_history: 'GPU Inventory History',
  gpu_node_health: 'GPU Node Health',
  hardware_health: 'Hardware Health',

  // Security, RBAC, and compliance
  security_issues: 'Security Issues',
  rbac_overview: 'RBAC Overview',
  policy_violations: 'Policy Violations',
  opa_policies: 'OPA Policies',
  kyverno_policies: 'Kyverno Policies',
  falco_alerts: 'Falco Alerts',
  trestle_scan: 'Compliance Trestle (OSCAL)',
  trivy_scan: 'Trivy Scan',
  kubescape_scan: 'Kubescape Scan',
  iso27001_audit: 'ISO 27001 Security Audit',
  compliance_score: 'Compliance Score',
  vault_secrets: 'Vault Secrets',
  external_secrets: 'External Secrets',
  cert_manager: 'Cert Manager',

  // Compliance cross-cluster cards
  fleet_compliance_heatmap: 'Fleet Compliance Heatmap',
  compliance_drift: 'Compliance Drift',
  cross_cluster_policy_comparison: 'Cross-Cluster Policy Comparison',
  recommended_policies: 'Recommended Policies',

  // Alerting cards — active_alerts registered via unified descriptor system
  alert_rules: 'Alert Rules',

  // Cost management
  opencost_overview: 'OpenCost Overview',
  kubecost_overview: 'Kubecost Overview',

  // MCS (Multi-Cluster Service) cards
  service_exports: 'Service Exports',
  service_imports: 'Service Imports',
  gateway_status: 'Gateway Status',
  service_topology: 'Service Topology',

  // Cluster admin cards
  predictive_health: 'Predictive Health',
  node_debug: 'Node Debug',
  control_plane_health: 'Control Plane Health',
  node_conditions: 'Node Conditions',
  admission_webhooks: 'Admission Webhooks',
  dns_health: 'DNS Health',
  etcd_status: 'Etcd Status',
  network_policies: 'Network Policies',
  rbac_explorer: 'RBAC Explorer',
  maintenance_windows: 'Maintenance Windows',
  cluster_changelog: 'Cluster Changelog',
  quota_heatmap: 'Quota Heatmap',

  // Kagenti AI Agent Platform
  kagenti_status: 'Kagenti Status',
  kagenti_agent_fleet: 'Kagenti Agent Fleet',
  kagenti_build_pipeline: 'Kagenti Build Pipeline',
  kagenti_tool_registry: 'Kagenti Tool Registry',
  kagenti_agent_discovery: 'Kagenti Agent Discovery',
  kagenti_security: 'Kagenti Security',
  kagenti_security_posture: 'Kagenti Security Posture',
  kagenti_topology: 'Kagenti Topology',

  // Kagent CRD Dashboard
  kagent_status: 'Kagent Status',
  kagent_agent_fleet: 'Kagent Agent Fleet',
  kagent_tool_registry: 'Kagent Tool Registry',
  kagent_model_providers: 'Kagent Model Providers',
  kagent_agent_discovery: 'Kagent Agent Discovery',
  kagent_security: 'Kagent Security',
  kagent_topology: 'Kagent Topology',

  // Crossplane
  crossplane_managed_resources: 'Crossplane Managed Resources',

  // Other
  upgrade_status: 'Cluster Upgrade Status',
  user_management: 'User Management',
  github_activity: 'GitHub Activity',
  kubectl: 'Kubectl Terminal',
  // weather — registered via unified descriptor system
  rss_feed: 'RSS Feed',
  iframe_embed: 'Iframe Embed',
  network_utils: 'Network Utils',
  mobile_browser: 'Mobile Browser',

  // AI cards
  console_ai_issues: 'AI Issues',
  console_ai_kubeconfig_audit: 'AI Kubeconfig Audit',
  console_ai_health_check: 'AI Health Check',
  console_ai_offline_detection: 'Predictive Health Monitor',

  // stock_market_ticker — registered via unified descriptor system

  // PROW CI/CD cards
  prow_jobs: 'PROW Jobs',
  prow_status: 'PROW Status',
  prow_history: 'PROW History',

  // ML/AI workload cards
  llm_inference: 'llm-d Inference',
  llm_models: 'llm-d Models',
  llmd_flow: 'llm-d Request Flow',
  llmd_ai_insights: 'llm-d AI Insights',
  llmd_configurator: 'llm-d Configurator',
  kvcache_monitor: 'KV Cache Monitor',
  epp_routing: 'EPP Routing',
  pd_disaggregation: 'P/D Disaggregation',
  ml_jobs: 'ML Jobs',
  ml_notebooks: 'ML Notebooks',

  // Benchmark cards
  nightly_e2e_status: 'Nightly E2E Status',
  benchmark_hero: 'Latest Benchmark',
  pareto_frontier: 'Performance Explorer',
  hardware_leaderboard: 'Hardware Leaderboard',
  latency_breakdown: 'Latency Breakdown',
  throughput_comparison: 'Throughput Comparison',
  performance_timeline: 'Performance Timeline',
  resource_utilization: 'Resource Utilization',

  // Games
  sudoku_game: 'Sudoku Game',
  match_game: 'Kube Match',
  solitaire: 'Kube Solitaire',
  checkers: 'AI Checkers',
  game_2048: 'Kube 2048',
  kubedle: 'Kubedle',
  pod_sweeper: 'Pod Sweeper',
  container_tetris: 'Container Tetris',
  flappy_pod: 'Flappy Pod',
  kube_man: 'Kube-Man',
  kube_kong: 'Kube Kong',
  pod_pitfall: 'Pod Pitfall',
  node_invaders: 'Node Invaders',
  pod_crosser: 'Pod Crosser',
  pod_brothers: 'Pod Brothers',
  kube_kart: 'Kube Kart',
  kube_pong: 'Kube Pong',
  kube_snake: 'Kube Snake',
  kube_galaga: 'Kube Galaga',
  kube_doom: 'Kube Doom',
  kube_craft: 'Kube Craft',
  kube_chess: 'Kube Chess',
  missile_command: 'Missile Command',
  kube_bert: 'Kube-BERT',

  // Provider health
  provider_health: 'Provider Health',
  // CoreDNS
  coredns_status: 'CoreDNS',
  // CRI-O container runtime
  crio_status: 'CRI-O',
  // Strimzi Kafka operator
  strimzi_status: 'Strimzi',
  // Flatcar Container Linux
  flatcar_status: 'Flatcar',
  // Fluentd log collector
  fluentd_status: 'Fluentd',
  // Lima VM
  lima_status: 'Lima',
  // Thanos distributed metrics
  thanos_status: 'Thanos',
  // OpenFeature feature-flag management
  openfeature_status: 'OpenFeature',

  // KubeVela application delivery
  kubevela_status: 'KubeVela',
  // CloudEvents monitoring
  cloudevents_status: 'CloudEvents',

  // Multi-cluster insights cards
  cross_cluster_event_correlation: 'Cross-Cluster Event Correlation',
  cluster_delta_detector: 'Cluster Delta Detector',
  cascade_impact_map: 'Cascade Impact Map',
  config_drift_heatmap: 'Config Drift Heatmap',
  resource_imbalance_detector: 'Resource Imbalance Detector',
  restart_correlation_matrix: 'Restart Correlation Matrix',
  deployment_rollout_tracker: 'Deployment Rollout Tracker',
  // KEDA
  keda_status: 'KEDA',
  // Karmada multi-cluster orchestration
  karmada_status: 'Karmada',
  kuberay_fleet: 'KubeRay Fleet',
  slo_compliance: 'SLO Compliance',
  failover_timeline: 'Failover Timeline',
  trino_gateway: 'Trino Gateway',

  // Inspektor Gadget
  network_trace: 'Network Traces',
  dns_trace: 'DNS Traces',
  process_trace: 'Process Traces',
  security_audit: 'Security Audit',

  // Multi-tenancy
  ovn_status: 'OVN-Kubernetes',
  kubeflex_status: 'KubeFlex',
  k3s_status: 'K3s',
  kubevirt_status: 'KubeVirt',
  multi_tenancy_overview: 'Multi-Tenancy Overview',
  tenant_isolation_setup: 'Tenant Isolation Setup',
  tenant_topology: 'Tenant Architecture',
}

// Short descriptions shown via info icon tooltip in the card header
export const CARD_DESCRIPTIONS: Record<string, string> = {
  cluster_health: 'Overall health status of all connected Kubernetes clusters.',
  cluster_focus: 'Deep-dive view of a single cluster with key metrics and resources.',
  cluster_network: 'Network connectivity and traffic flow between clusters.',
  cluster_comparison: 'Side-by-side comparison of clusters by resource usage and health.',
  cluster_costs: 'Estimated infrastructure costs broken down by cluster.',
  cluster_metrics: 'Real-time CPU, memory, and pod metrics across clusters.',
  cluster_locations: 'Geographic map of cluster locations worldwide.',
  cluster_resource_tree: 'Hierarchical tree view of all resources in a cluster.',
  app_status: 'Status of workloads across clusters with health indicators.',
  workload_deployment: 'Deploy workloads to clusters using drag-and-drop.',
  deployment_missions: 'Track multi-cluster deployment missions and their progress.',
  deployment_progress: 'Real-time deployment rollout progress and status.',
  deployment_status: 'Detailed status of deployments including replicas and conditions.',
  deployment_issues: 'Active deployment problems such as failed rollouts or image pull errors.',
  statefulset_status: 'Status of StatefulSets including replicas and volume claims.',
  daemonset_status: 'Status of DaemonSets including node coverage and update progress.',
  replicaset_status: 'Status of ReplicaSets including replica counts and conditions.',
  job_status: 'Status of Jobs including completion, duration, and failures.',
  cronjob_status: 'Status of CronJobs including schedules and recent runs.',
  hpa_status: 'Horizontal Pod Autoscalers (HPA) automatically adjust the number of pod replicas based on CPU, memory, or custom metrics. This card shows which workloads have autoscaling configured and whether they are currently scaling up or down.',
  cluster_groups: 'Organize clusters into logical groups for targeted deployments.',
  resource_marshall: 'Explore resource dependency trees and ownership chains.',
  workload_monitor: 'Monitor all resources for a workload with health status, alerts, and AI diagnose/repair.',
  llmd_stack_monitor: 'Monitor the llm-d inference stack: model serving, EPP, gateways, and autoscalers.',
  prow_ci_monitor: 'Monitor PROW CI jobs with success rates, failure analysis, and AI repair.',
  github_ci_monitor: 'Monitor GitHub Actions workflows across repos with pass rates and alerts.',
  cluster_health_monitor: 'Monitor cluster health across all connected clusters with pod and deployment issues.',
  pod_issues: 'Pods with errors, restarts, or scheduling problems.',
  top_pods: 'Top resource-consuming pods ranked by CPU or memory usage.',
  resource_capacity: 'Cluster resource capacity vs. current allocation.',
  resource_usage: 'CPU and memory allocation breakdown across clusters.',
  node_status: 'Status of Kubernetes nodes including conditions and capacity.',
  compute_overview: 'Summary of compute resources: nodes, CPUs, and memory.',
  event_stream: 'Live stream of Kubernetes events from all clusters.',
  event_summary: 'Aggregated event counts grouped by type and reason.',
  warning_events: 'Warning-level events that may need attention.',
  recent_events: 'Most recent events across all clusters.',
  events_timeline: 'Timeline chart of event frequency over time.',
  pod_health_trend: 'Historical trend of pod health status over time.',
  resource_trend: 'Resource usage trends showing CPU and memory over time.',
  storage_overview: 'Persistent volume and storage class overview.',
  pvc_status: 'Status of Persistent Volume Claims across clusters.',
  pv_status: 'Status of Persistent Volumes including capacity and binding.',
  resource_quota_status: 'Resource quota utilization and limits across namespaces.',
  network_overview: 'Network policies, services, and ingress summary.',
  service_status: 'Status of Kubernetes services and their endpoints.',
  ingress_status: 'Status of Ingress resources including hosts and backends.',
  network_policy_status: 'Status of Network Policies and affected pods.',
  namespace_overview: 'Summary of resources within a namespace.',
  namespace_analysis: 'Detailed analysis of namespace health and resource usage.',
  namespace_rbac: 'RBAC roles and bindings within a namespace.',
  namespace_quotas: 'Resource quota utilization within a namespace.',
  namespace_events: 'Events filtered to a specific namespace.',
  namespace_monitor: 'Real-time monitoring of namespace resource trends.',
  operator_status: 'Status of installed Kubernetes operators.',
  operator_subscriptions: 'Operator subscriptions and update channels.',
  operator_subscription_status: 'Detailed status of Operator Lifecycle Manager subscriptions.',
  crd_health: 'Custom Resource Definitions (CRDs) extend Kubernetes with new resource types. This card shows which CRDs are installed, whether they are serving correctly, and if any have version conflicts or schema issues.',
  configmap_status: 'Status of ConfigMaps including size and update times.',
  gitops_drift: 'Detects when your live cluster state has drifted from what is defined in Git. GitOps tools like Flux or ArgoCD should keep clusters in sync with Git — this card highlights any discrepancies that may indicate manual changes or sync failures.',
  helm_release_status: 'Status of Helm releases across clusters.',
  helm_releases: 'List of all deployed Helm releases.',
  helm_history: 'Revision history and rollback options for Helm releases.',
  helm_values_diff: 'Diff of Helm values between revisions.',
  kustomization_status: 'Status of Kustomize overlays and their resources.',
  overlay_comparison: 'Compare Kustomize overlays across environments.',
  chart_versions: 'Available Helm chart versions and update status.',
  argocd_applications: 'ArgoCD application inventory and sync status.',
  argocd_sync_status: 'Sync status of ArgoCD-managed applications.',
  argocd_health: 'Health of ArgoCD applications and components.',
  gpu_overview: 'Summary of GPU resources across all clusters. Use this to see how many GPUs are available, allocated, and idle across your fleet — essential for AI/ML workload planning.',
  gpu_status: 'Current GPU utilization and health status. Shows real-time metrics for each GPU device so you can spot overloaded or underused GPUs.',
  gpu_inventory: 'Inventory of GPU nodes with model, memory, and driver info. Helps you understand what GPU hardware is available (e.g., A100, H100) and whether drivers are up to date.',
  gpu_workloads: 'Workloads running on GPU-enabled nodes. See which pods and jobs are consuming GPU resources and how much each is using.',
  gpu_utilization: 'Real-time GPU utilization percentage and temperature. Monitor whether GPUs are being fully utilized or sitting idle, and catch thermal issues early.',
  gpu_usage_trend: 'Historical GPU usage trends over time. Identify usage patterns and plan capacity by seeing how GPU demand changes throughout the day or week.',
  gpu_namespace_allocations: 'GPU allocation breakdown by namespace across clusters. Understand which teams or projects are consuming GPU resources to optimize sharing and cost.',
  gpu_inventory_history: 'Historical view of GPU allocation over time. Uses metrics snapshots captured every 10 minutes to show trends in GPU usage, helping you plan capacity and spot usage patterns.',
  gpu_node_health: 'Proactive GPU node health monitoring with device disappearance detection. Alerts you when GPUs vanish from nodes — a common hardware issue that requires power cycling to fix.',
  hardware_health: 'Detects hardware device disappearances (GPUs, NICs, NVMe, InfiniBand) that often require a power cycle to recover. Common with SuperMicro/HGX systems. Also shows full device inventory per node.',
  security_issues: 'Security vulnerabilities and misconfigurations detected.',
  rbac_overview: 'Overview of RBAC roles, bindings, and permissions.',
  policy_violations: 'Active policy violations from OPA, Kyverno, or other engines.',
  opa_policies: 'OPA (Open Policy Agent) Gatekeeper enforces policies on Kubernetes resources — for example, blocking containers running as root or requiring resource limits. This card shows which policies are active and whether any are being violated.',
  kyverno_policies: 'Kyverno is a Kubernetes-native policy engine that can validate, mutate, and generate resources. This card shows active policies, their enforcement mode (audit vs enforce), and violation counts.',
  falco_alerts: 'Falco is a runtime security tool that detects unexpected behavior in your containers (e.g., shell access, file modifications, network connections). This card shows recent alerts and their severity.',
  trestle_scan: 'Compliance Trestle (CNCF Sandbox) performs OSCAL-based compliance assessments against standards like NIST 800-53 and FedRAMP. This card shows which security controls pass or fail across your clusters.',
  trivy_scan: 'Trivy scans container images for known vulnerabilities (CVEs), misconfigurations, and exposed secrets. This card shows scan results with severity levels so you can prioritize fixes.',
  kubescape_scan: 'Kubescape scans your Kubernetes clusters against security frameworks like NSA/CISA and MITRE ATT&CK. This card shows your security posture score and highlights areas that need hardening.',
  iso27001_audit: 'Interactive ISO 27001 compliance checklist with 70 security controls for Kubernetes clusters. Walk through each control to assess your organization\'s information security management practices.',
  compliance_score: 'Overall compliance score across security frameworks. Aggregates results from tools like OPA, Kyverno, Trivy, and Kubescape to give you a single score showing how well your clusters meet security and compliance standards.',
  vault_secrets: 'HashiCorp Vault is an external secrets manager that securely stores API keys, passwords, and certificates. This card shows which Vault secrets are synced into Kubernetes and whether any are failing to sync.',
  external_secrets: 'External Secrets Operator syncs secrets from external providers (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) into Kubernetes Secrets. This card shows sync status and any errors.',
  cert_manager: 'cert-manager automates TLS certificate provisioning and renewal using providers like Let\'s Encrypt. This card shows certificate status, expiry dates, and whether renewals are succeeding.',
  // Cross-cluster compliance cards
  fleet_compliance_heatmap: 'Grid view of compliance status across clusters by tool category.',
  compliance_drift: 'Detects clusters deviating from fleet compliance baseline.',
  cross_cluster_policy_comparison: 'Side-by-side policy comparison across selected clusters.',
  recommended_policies: 'AI-powered policy gap analysis with one-click deployment.',
  // active_alerts — registered via unified descriptor system
  alert_rules: 'Configured alert rules and their evaluation status.',
  opencost_overview: 'Cost allocation data from OpenCost.',
  kubecost_overview: 'Cost breakdown and optimization from Kubecost.',
  service_exports: 'Service exports make a Kubernetes service available for discovery by other clusters in a multi-cluster federation. This card shows which services are exported and their readiness status.',
  service_imports: 'Service imports bring remote services from other clusters into the local cluster, enabling cross-cluster communication. This card shows imported services and whether they are resolving correctly.',
  gateway_status: 'Gateway API resource status and routing.',
  service_topology: 'Visual topology of service-to-service communication.',
  // Cluster admin cards
  predictive_health: 'Predictive health analysis using historical trends to forecast issues.',
  node_debug: 'Interactive node debugging with logs, events, and resource inspection.',
  control_plane_health: 'Health status of Kubernetes control plane components.',
  node_conditions: 'Detailed node conditions including disk pressure, memory, and network.',
  admission_webhooks: 'Status of admission webhooks and their configurations.',
  dns_health: 'DNS resolution health and CoreDNS pod status.',
  etcd_status: 'Etcd cluster health, leader status, and database size.',
  network_policies: 'Network policy coverage and affected pods.',
  rbac_explorer: 'Interactive RBAC role and binding explorer.',
  maintenance_windows: 'Scheduled maintenance windows and their status.',
  cluster_changelog: 'Recent changes to cluster resources and configurations.',
  quota_heatmap: 'Resource quota utilization heatmap across namespaces.',

  // Kagenti AI Agent Platform
  kagenti_status: 'Overall Kagenti AI agent platform status.',
  kagenti_agent_fleet: 'Fleet view of all deployed Kagenti AI agents.',
  kagenti_build_pipeline: 'Kagenti agent build pipeline status and history.',
  kagenti_tool_registry: 'Registry of tools available to Kagenti agents.',
  kagenti_agent_discovery: 'Discover and browse available Kagenti agents.',
  kagenti_security: 'Security status and access controls for Kagenti agents.',
  kagenti_security_posture: 'Overall security posture of the Kagenti platform.',
  kagenti_topology: 'Topology view of Kagenti agent connections and dependencies.',

  // Kagent CRD Dashboard
  kagent_status: 'Overview of kagent agents, tools, and models.',
  kagent_agent_fleet: 'All kagent agents across clusters.',
  kagent_tool_registry: 'ToolServer and RemoteMCPServer resources.',
  kagent_model_providers: 'ModelConfig and ModelProviderConfig resources.',
  kagent_agent_discovery: 'Agent A2A config, tools, and skills.',
  kagent_security: 'Agent approval settings and tool permissions.',
  kagent_topology: 'Agent-Tool-Model dependency graph.',

  // Crossplane
  crossplane_managed_resources: 'Crossplane lets you provision and manage cloud infrastructure (databases, buckets, networks) using Kubernetes APIs. This card shows your managed resources and whether they are in sync with the desired state.',

  // Cloud Native Buildpacks
  buildpacks_status: 'Cloud Native Buildpacks automatically detect your app language and build OCI container images without writing a Dockerfile. This card shows build status, image history, and builder versions.',

  upgrade_status: 'Kubernetes version upgrade status and available upgrades.',
  user_management: 'Manage console users and their roles.',
  github_activity: 'Recent GitHub activity: commits, PRs, and issues.',
  kubectl: 'Interactive kubectl terminal for running commands.',
  // weather — registered via unified descriptor system
  rss_feed: 'RSS feed reader for Kubernetes news and blogs.',
  iframe_embed: 'Embed an external web page inside a card.',
  network_utils: 'Network diagnostic utilities: ping, DNS, traceroute.',
  mobile_browser: 'Embedded mobile-sized browser for testing.',
  console_ai_issues: 'AI-detected issues and recommended fixes.',
  console_ai_kubeconfig_audit: 'AI audit of kubeconfig files for security and cleanup.',
  console_ai_health_check: 'AI-powered cluster health analysis.',
  console_ai_offline_detection: 'Monitors cluster health and predicts failures before they happen. Detects offline nodes, GPU exhaustion, resource pressure, and groups issues by root cause for efficient remediation.',
  // stock_market_ticker — registered via unified descriptor system
  prow_jobs: 'PROW CI/CD job status and results.',
  prow_status: 'Overall PROW system health and queue depth.',
  prow_history: 'Historical PROW job runs and success rates.',
  llm_inference: 'llm-d is a Kubernetes-native platform for serving Large Language Models. This card shows inference endpoint health, request throughput, and latency metrics for your LLM deployments.',
  llm_models: 'LLM models deployed via llm-d with version info. See which models are loaded, their parameter sizes, and which pods are serving them.',
  llmd_flow: 'Animated visualization showing how an inference request flows through the llm-d stack: from the load balancer, to the Endpoint Picker Pod (EPP), to prefill and decode pods. Helps you understand the request lifecycle.',
  llmd_ai_insights: 'AI-generated insights about llm-d performance, bottlenecks, and optimization recommendations. Uses your cluster metrics to suggest improvements like adjusting batch sizes or scaling pods.',
  llmd_configurator: 'Configure llm-d deployment parameters interactively: replicas, autoscaling thresholds, model variants, and GPU resource limits. Changes can be applied directly to your cluster.',
  kvcache_monitor: 'KV cache stores attention key-value pairs to avoid recomputation during LLM inference. This card monitors cache utilization, hit rates, and memory usage across inference pods to help optimize throughput.',
  epp_routing: 'The Endpoint Picker Pod (EPP) routes inference requests to the optimal pod based on KV cache affinity — sending requests to pods that already have relevant context cached. This card visualizes routing decisions.',
  pd_disaggregation: 'Prefill/Decode disaggregation separates LLM inference into two phases: prefill (processing the full prompt) and decode (generating tokens one at a time). This architecture uses separate pod pools optimized for each phase.',
  ml_jobs: 'Machine learning training and batch job status.',
  ml_notebooks: 'Jupyter notebook server status and resource usage.',
  provider_health: 'Health and status of AI and cloud infrastructure providers.',
  strimzi_status: 'Strimzi runs Apache Kafka on Kubernetes for event streaming and messaging. This card shows Kafka cluster health, topic status, and consumer group lag — helping you spot message backlogs before they cause issues.',
  // Flatcar Container Linux
  flatcar_status: 'Flatcar Container Linux node status, version info, and update readiness.',
  // Fluentd log collector
  fluentd_status: 'Fluentd log collector pod health, buffer status, and throughput.',
  // Lima VM
  lima_status: 'Lima VM instance status, resource usage, and configuration.',
  // Thanos distributed metrics
  thanos_status: 'Thanos distributed metrics store, compactor, and query health.',
  // OpenFeature feature-flag management
  openfeature_status: 'OpenFeature feature flag provider status and flag evaluation metrics.',

  // Benchmark cards
  nightly_e2e_status: 'Nightly end-to-end test results and pass/fail trends.',
  benchmark_hero: 'Latest benchmark results with key performance metrics.',
  pareto_frontier: 'Performance vs cost Pareto frontier for hardware configurations.',
  hardware_leaderboard: 'Hardware configuration rankings by throughput and latency.',
  latency_breakdown: 'Latency breakdown by stage: prefill, decode, and network.',
  throughput_comparison: 'Throughput comparison across hardware and model configurations.',
  performance_timeline: 'Performance metrics over time with regression detection.',
  resource_utilization: 'Resource utilization efficiency across benchmark runs.',

  // Games
  sudoku_game: 'Classic Sudoku puzzle game with multiple difficulty levels.',
  match_game: 'Memory matching game with Kubernetes resource icons.',
  solitaire: 'Classic Klondike solitaire card game.',
  checkers: 'Play checkers against an AI opponent.',
  game_2048: 'Slide and merge tiles to reach 2048.',
  kubedle: 'Wordle-style game with Kubernetes terminology.',
  pod_sweeper: 'Minesweeper clone with a Kubernetes pod theme.',
  container_tetris: 'Classic Tetris with container-shaped blocks.',
  flappy_pod: 'Navigate a pod through cluster obstacles.',
  kube_man: 'Pac-Man style game collecting resources in a cluster maze.',
  kube_kong: 'Donkey Kong inspired platformer with Kubernetes theme.',
  pod_pitfall: 'Pitfall-style adventure game as a pod.',
  node_invaders: 'Space Invaders clone defending your cluster.',
  pod_crosser: 'Frogger-style game crossing cluster traffic.',
  pod_brothers: 'Super Mario Bros inspired platformer.',
  kube_kart: 'Racing game through Kubernetes infrastructure.',
  kube_pong: 'Classic Pong game with cluster theming.',
  kube_snake: 'Snake game collecting Kubernetes resources.',
  kube_galaga: 'Galaga-style shooter defending against threats.',
  kube_doom: 'First-person debugging adventure.',
  kube_craft: 'Build and manage your cluster world.',
  kube_chess: 'Chess game with Kubernetes-themed pieces.',
  missile_command: 'Missile Command arcade game defending your cluster.',
  kube_bert: 'Q*bert style platformer navigating Kubernetes pyramids.',
  // CoreDNS
  coredns_status: 'CoreDNS pod health, restart counts, and cluster status across clusters.',
  // CRI-O container runtime
  crio_status: 'CRI-O container runtime metrics, image pulls, and pod sandbox status.',

  // KubeVela application delivery
  kubevela_status: 'KubeVela application delivery, component status, and workflow progress.',
  // CloudEvents monitoring
  cloudevents_status: 'CloudEvents message flow, event source tracking, and delivery status.',

  // Multi-cluster insights cards
  cross_cluster_event_correlation: 'Unified timeline showing correlated warning events across multiple clusters.',
  cluster_delta_detector: 'Detects differences between clusters sharing the same workloads.',
  cascade_impact_map: 'Visualizes how issues cascade across clusters over time.',
  config_drift_heatmap: 'Cluster-pair matrix showing degree of configuration drift.',
  resource_imbalance_detector: 'Detects CPU/memory utilization skew across the fleet.',
  restart_correlation_matrix: 'Detects horizontal (app bug) vs vertical (infra issue) restart patterns.',
  deployment_rollout_tracker: 'Tracks deployment rollout progress across clusters.',
  // KEDA
  keda_status: 'KEDA (Kubernetes Event-Driven Autoscaling) automatically scales workloads based on external event sources like message queues, databases, or custom metrics. This card shows which workloads are being autoscaled, their current triggers, and queue depths.',
  // Karmada multi-cluster orchestration
  karmada_status: 'Karmada is a multi-cluster orchestration tool that propagates resources (Deployments, Services, etc.) across multiple clusters using placement policies. This card shows propagation status, member cluster health, and policy compliance.',
  kuberay_fleet: 'Discovers RayCluster, RayService, and RayJob CRDs across all connected clusters. Shows fleet-level Ray workload status including GPU allocations, serving endpoints, and job progress.',
  slo_compliance: 'Tracks SLO compliance with configurable targets for latency, error rate, and availability. Shows error budget burn rate and per-cluster compliance indicators.',
  failover_timeline: 'Forensic timeline of cross-region failover events detected from Karmada ResourceBinding status transitions. Shows cluster outages, binding rescheduling, and recovery events.',
  trino_gateway: 'Discovers Trino coordinator, worker, and Trino Gateway pods across clusters. Shows per-cluster query health, gateway routing status, and worker distribution.',

  // Inspektor Gadget
  network_trace: 'Live network connection tracing via Inspektor Gadget eBPF.',
  dns_trace: 'Live DNS query tracing via Inspektor Gadget eBPF.',
  process_trace: 'Live process execution tracing via Inspektor Gadget eBPF.',
  security_audit: 'Security audit using Inspektor Gadget eBPF-based runtime analysis.',

  // Multi-tenancy
  ovn_status: 'OVN-Kubernetes network status, User Defined Networks, and tenant isolation.',
  kubeflex_status: 'KubeFlex controller status, control planes per tenant, and CP health.',
  k3s_status: 'K3s lightweight Kubernetes server pods, agent connections, and cluster health.',
  kubevirt_status: 'KubeVirt VM status, running/stopped/migrating VMs, and data-plane isolation.',
  multi_tenancy_overview: 'Aggregated view of tenant isolation across OVN, KubeFlex, K3s, and KubeVirt.',
  tenant_isolation_setup: 'AI-powered multi-tenancy setup wizard with component detection and one-click configuration.',
  tenant_topology: 'Interactive SVG topology of the KubeCon multi-tenancy architecture: KubeVirt VMs, K3s control planes, Layer-2/3 UDN networks, and KubeFlex controller with live status indicators.',
}

/**
 * Cards that never show demo/offline skeletons — arcade games and admin-only cards.
 * Moved here from cardRegistry.ts to avoid pulling the heavy card config
 * barrel (~195 KB) into the main chunk via CardWrapper.
 */
export const DEMO_EXEMPT_CARDS = new Set([
  // All arcade games - never show skeleton, always show game content
  'sudoku_game',
  'checkers',
  'container_tetris',
  'kube_kong',
  'pod_crosser',
  'kube_kart',
  'kube_snake',
  'kube_chess',
  'kube_man',
  'node_invaders',
  'flappy_pod',
  'pod_pitfall',
  'pod_brothers',
  'match_game',
  'solitaire',
  'game_2048',
  'kubedle',
  'pod_sweeper',
  'kube_pong',
  'kube_galaga',
  'kube_craft',
  'kube_doom',
  'dynamic_card',
  // Cluster admin cards - no demo/live concept
  'maintenance_windows',
  'node_debug',
])
