// Card title registry — pure data, no runtime deps.

export const CARD_TITLES: Record<string, string> = {
  // ACMM (AI Codebase Maturity Model)
  acmm_level: 'Current Level',
  acmm_feedback_loops: 'Feedback Loop Inventory',
  acmm_recommendations: 'Your Role + Next Steps',
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
  nightly_release_pulse: 'Nightly Release Pulse',
  workflow_matrix: 'Workflow Matrix',
  pipeline_flow: 'Live Runs',
  recent_failures: 'Recent Failures',
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
  pod_logs: 'Pod Logs',

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
  flux_status: 'Flux CD',
  chaos_mesh_status: 'Chaos Mesh',
  buildpacks_status: 'Buildpacks Status',
  overlay_comparison: 'Overlay Comparison',
  chart_versions: 'Helm Chart Versions',

  // ArgoCD cards
  argocd_applications: 'ArgoCD Applications',
  argocd_applicationsets: 'ArgoCD ApplicationSets',
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
  intoto_supply_chain: 'in-toto Supply Chain',
  falco_alerts: 'Falco Alerts',
  trestle_scan: 'Compliance Trestle (OSCAL)',
  trivy_scan: 'Trivy Scan',
  kubescape_scan: 'Kubescape Scan',
  iso27001_audit: 'ISO 27001 Security Audit',
  compliance_score: 'Compliance Score',
  runtime_attestation: 'Runtime Attestation Score',
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
  change_timeline: 'Change Timeline',
  quota_heatmap: 'Quota Heatmap',

  // Kagenti AI Agent Platform
  kagenti_status: 'Kagenti Status',
  kagenti_agent_fleet: 'Kagenti Agent Fleet',
  kagenti_build_pipeline: 'Kagenti Build Pipeline',
  kagenti_lifecycle_manager: 'Kagenti Lifecycle Manager',
  kagenti_tool_registry: 'Kagenti Tool Registry',
  kagenti_agent_discovery: 'Kagenti Agent Discovery',
  kagenti_security: 'Kagenti Security',
  kagenti_security_posture: 'Kagenti Security Posture',
  kagenti_topology: 'Kagenti Topology',

  // Kagent CRD Dashboard
  kagent_status: 'Kagent Status',
  kagent_agent_fleet: 'Kagent Agent Fleet',
  kagent_agent_list: 'Kagent Agent List',
  kagent_lifecycle_state: 'Kagent Lifecycle State',
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
  issue_activity_chart: 'Daily Issues & PRs',
  kubectl: 'Kubectl Terminal',
  quality_dashboard: 'Quality Dashboard',
  // weather — registered via unified descriptor system
  rss_feed: 'RSS Feed',
  iframe_embed: 'Iframe Embed',
  network_utils: 'Network Utils',
  mobile_browser: 'Mobile Browser',

  // AI cards
  console_ai_issues: 'AI Issues',
  console_ai_kubeconfig_audit: 'AI Kubeconfig Audit',
  console_ai_health_check: 'AI Health Check',
  console_ai_offline_detection: 'AI Cluster Issue Predictor',

  // stock_market_ticker — registered via unified descriptor system

  // PROW CI/CD cards
  prow_jobs: 'PROW Jobs',
  prow_status: 'PROW Status',
  prow_history: 'PROW History',

  // ML/AI workload cards
  llm_inference: 'llm-d Inference',
  llm_models: 'llm-d Models',
  model_endpoint_health: 'Model Endpoint Health',
  epp_health: 'EPP Health',
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
  kube_chess: 'Kube Chess',
  missile_command: 'Missile Command',
  kube_bert: 'Kube-BERT',

  // Provider health
  provider_health: 'Provider Health',
  // CoreDNS
  coredns_status: 'CoreDNS',
  // Backstage developer portal (CNCF incubating)
  backstage_status: 'Backstage',
  // Contour ingress proxy
  contour_status: 'Contour',
  // Dapr distributed application runtime
  dapr_status: 'Dapr',
  // Envoy proxy (service mesh / edge)
  envoy_status: 'Envoy Proxy',
  // gRPC services (network / service communication)
  grpc_status: 'gRPC Services',
  // Linkerd service mesh
  linkerd_status: 'Linkerd',
  // Longhorn distributed block storage (CNCF Incubating)
  longhorn_status: 'Longhorn',
  // OpenFGA fine-grained authorization (CNCF Sandbox)
  openfga_status: 'OpenFGA',
  // OpenTelemetry collector (CNCF)
  otel_status: 'OpenTelemetry',
  // Rook cloud-native storage orchestrator
  rook_status: 'Rook',
  // SPIFFE workload identity (CNCF graduated)
  spiffe_status: 'SPIFFE',
  // CNI (Container Network Interface) plugin status
  cni_status: 'CNI',
  // SPIRE (SPIFFE Runtime Environment) — workload identity
  spire_status: 'SPIRE',
  // TiKV distributed key-value store
  tikv_status: 'TiKV',
  // TUF (The Update Framework) repository metadata
  tuf_status: 'TUF',
  // Vitess distributed MySQL
  vitess_status: 'Vitess',
  // wasmCloud WebAssembly lattice (CNCF incubating)
  wasmcloud_status: 'wasmCloud',
  // Volcano batch/HPC scheduler (CNCF Incubating)
  volcano_status: 'Volcano',
  // CRI-O container runtime
  crio_status: 'CRI-O',
  // Cloud Custodian rules engine (CNCF incubating)
  cloud_custodian_status: 'Cloud Custodian',
  // Containerd container runtime
  containerd_status: 'Containerd',
  // Cortex horizontally scalable Prometheus (CNCF incubating — marketplace#35)
  cortex_status: 'Cortex',
  // Dragonfly P2P image/file distribution
  dragonfly_status: 'Dragonfly',
  // Strimzi Kafka operator
  strimzi_status: 'Strimzi',
  // Flatcar Container Linux
  flatcar_status: 'Flatcar',
  // Artifact Hub
  artifact_hub_status: 'Artifact Hub',
  // Fluentd log collector
  fluentd_status: 'Fluentd',
  // Lima VM
  lima_status: 'Lima',
  // OpenFeature feature-flag management
  openfeature_status: 'OpenFeature',
  // OpenKruise advanced workloads
  openkruise_status: 'OpenKruise',
  // Keycloak Identity & Access Management
  keycloak_status: 'Keycloak',
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
  right_size_advisor: 'Right-Size Advisor',
  restart_correlation_matrix: 'Restart Correlation Matrix',
  deployment_rollout_tracker: 'Deployment Rollout Tracker',
  // KEDA
  keda_status: 'KEDA',
  // OpenYurt edge computing
  openyurt_status: 'OpenYurt',
  // KServe model serving
  kserve_status: 'KServe',
  // Knative serverless
  knative_status: 'Knative',
  // Karmada multi-cluster orchestration
  karmada_status: 'Karmada',
  cubefs_status: 'CubeFS',
  harbor_status: 'Harbor Registry',
  deployment_risk_score: 'Deployment Risk Score',
  kuberay_fleet: 'KubeRay Fleet',
  slo_compliance: 'SLO Compliance',
  failover_timeline: 'Failover Timeline',
  trino_gateway: 'Trino Gateway',
  // Fluid dataset caching
  fluid_status: 'Fluid',

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
  vcluster_status: 'vCluster Status',
  multi_tenancy_overview: 'Multi-Tenancy Overview',
  tenant_isolation_setup: 'Tenant Isolation Setup',
  tenant_topology: 'Tenant Architecture',
}

