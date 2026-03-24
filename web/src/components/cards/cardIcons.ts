// Card icon registry — maps card types to their header icons and colors
import type { ComponentType } from 'react'
import {
  AlertTriangle, Box, Activity, Database, Server, Cpu, Network, Shield, Package, GitBranch,
  FileCode, Gauge, AlertCircle, Layers, HardDrive, Globe, Users, Terminal, TrendingUp,
  Gamepad2, Puzzle, Target, Zap, Crown, Ghost, Bird, Rocket, Wand2, Stethoscope,
  MonitorCheck, Monitor, Workflow, Split, Router, BookOpen, Cloudy, Rss, Frame, Wrench, Phone,
  Clock, Settings,
} from 'lucide-react'

export const CARD_ICONS: Record<string, { icon: ComponentType<{ className?: string }>, color: string }> = {
  // Core cluster cards
  cluster_health: { icon: Activity, color: 'text-green-400' },
  cluster_focus: { icon: Server, color: 'text-purple-400' },
  cluster_network: { icon: Network, color: 'text-cyan-400' },
  cluster_comparison: { icon: Layers, color: 'text-blue-400' },
  cluster_costs: { icon: TrendingUp, color: 'text-green-400' },
  cluster_metrics: { icon: Activity, color: 'text-purple-400' },
  cluster_locations: { icon: Globe, color: 'text-blue-400' },
  cluster_resource_tree: { icon: GitBranch, color: 'text-purple-400' },
  cluster_groups: { icon: Layers, color: 'text-blue-400' },

  // Workload and deployment cards
  app_status: { icon: Box, color: 'text-purple-400' },
  deployment_missions: { icon: Rocket, color: 'text-blue-400' },
  deployment_progress: { icon: Clock, color: 'text-blue-400' },
  deployment_status: { icon: Box, color: 'text-purple-400' },
  deployment_issues: { icon: AlertTriangle, color: 'text-red-400' },
  statefulset_status: { icon: Database, color: 'text-purple-400' },
  daemonset_status: { icon: Server, color: 'text-blue-400' },
  replicaset_status: { icon: Box, color: 'text-cyan-400' },
  job_status: { icon: Clock, color: 'text-green-400' },
  cronjob_status: { icon: Clock, color: 'text-orange-400' },
  hpa_status: { icon: TrendingUp, color: 'text-purple-400' },
  resource_marshall: { icon: GitBranch, color: 'text-blue-400' },

  // Pod and resource cards
  pod_issues: { icon: AlertTriangle, color: 'text-red-400' },
  top_pods: { icon: Box, color: 'text-purple-400' },
  resource_capacity: { icon: Gauge, color: 'text-blue-400' },
  resource_usage: { icon: Gauge, color: 'text-purple-400' },
  pod_health_trend: { icon: Box, color: 'text-purple-400' },
  resource_trend: { icon: TrendingUp, color: 'text-blue-400' },
  node_status: { icon: Server, color: 'text-purple-400' },

  // Events
  event_stream: { icon: Activity, color: 'text-blue-400' },
  events_timeline: { icon: Clock, color: 'text-purple-400' },
  event_summary: { icon: Activity, color: 'text-purple-400' },
  warning_events: { icon: AlertTriangle, color: 'text-orange-400' },
  recent_events: { icon: Clock, color: 'text-blue-400' },

  // Namespace cards
  namespace_overview: { icon: Layers, color: 'text-purple-400' },
  namespace_analysis: { icon: Layers, color: 'text-purple-400' },
  namespace_rbac: { icon: Shield, color: 'text-yellow-400' },
  namespace_quotas: { icon: Gauge, color: 'text-yellow-400' },
  namespace_events: { icon: Activity, color: 'text-blue-400' },
  namespace_monitor: { icon: Activity, color: 'text-purple-400' },

  // Operator cards
  operator_status: { icon: Package, color: 'text-purple-400' },
  operator_subscriptions: { icon: Package, color: 'text-purple-400' },
  operator_subscription_status: { icon: Package, color: 'text-blue-400' },
  crd_health: { icon: Database, color: 'text-cyan-400' },
  configmap_status: { icon: FileCode, color: 'text-blue-400' },

  // Helm/GitOps cards
  gitops_drift: { icon: GitBranch, color: 'text-purple-400' },
  helm_release_status: { icon: Package, color: 'text-blue-400' },
  helm_releases: { icon: Package, color: 'text-blue-400' },
  helm_history: { icon: Clock, color: 'text-purple-400' },
  helm_values_diff: { icon: FileCode, color: 'text-yellow-400' },
  kustomization_status: { icon: Layers, color: 'text-purple-400' },
  buildpacks_status: { icon: Package, color: 'text-purple-400' },
  overlay_comparison: { icon: Layers, color: 'text-blue-400' },
  chart_versions: { icon: Package, color: 'text-green-400' },

  // ArgoCD cards
  argocd_applications: { icon: GitBranch, color: 'text-orange-400' },
  argocd_sync_status: { icon: GitBranch, color: 'text-orange-400' },
  argocd_health: { icon: Activity, color: 'text-orange-400' },

  // GPU cards
  gpu_overview: { icon: Cpu, color: 'text-green-400' },
  gpu_status: { icon: Cpu, color: 'text-green-400' },
  gpu_inventory: { icon: Cpu, color: 'text-green-400' },
  gpu_workloads: { icon: Cpu, color: 'text-green-400' },
  gpu_usage_trend: { icon: Cpu, color: 'text-green-400' },
  gpu_utilization: { icon: Cpu, color: 'text-green-400' },

  // Security and RBAC
  security_issues: { icon: Shield, color: 'text-red-400' },
  rbac_overview: { icon: Shield, color: 'text-yellow-400' },
  policy_violations: { icon: AlertTriangle, color: 'text-red-400' },
  opa_policies: { icon: Shield, color: 'text-purple-400' },
  kyverno_policies: { icon: Shield, color: 'text-blue-400' },
  alert_rules: { icon: AlertCircle, color: 'text-orange-400' },
  active_alerts: { icon: AlertTriangle, color: 'text-red-400' },

  // Storage
  pvc_status: { icon: HardDrive, color: 'text-blue-400' },
  pv_status: { icon: HardDrive, color: 'text-purple-400' },
  storage_overview: { icon: Database, color: 'text-purple-400' },
  resource_quota_status: { icon: Gauge, color: 'text-orange-400' },

  // Network
  network_overview: { icon: Network, color: 'text-cyan-400' },
  service_status: { icon: Server, color: 'text-purple-400' },
  service_topology: { icon: Network, color: 'text-blue-400' },
  service_exports: { icon: Server, color: 'text-green-400' },
  service_imports: { icon: Server, color: 'text-blue-400' },
  gateway_status: { icon: Network, color: 'text-purple-400' },
  ingress_status: { icon: Network, color: 'text-blue-400' },
  network_policy_status: { icon: Shield, color: 'text-cyan-400' },

  // Compute
  compute_overview: { icon: Cpu, color: 'text-purple-400' },

  // Other
  upgrade_status: { icon: TrendingUp, color: 'text-blue-400' },
  user_management: { icon: Users, color: 'text-purple-400' },
  github_activity: { icon: Activity, color: 'text-purple-400' },
  kubectl: { icon: Terminal, color: 'text-green-400' },
  weather: { icon: Cloudy, color: 'text-blue-400' },
  stock_market_ticker: { icon: TrendingUp, color: 'text-green-400' },
  rss_feed: { icon: Rss, color: 'text-orange-400' },
  iframe_embed: { icon: Frame, color: 'text-blue-400' },
  network_utils: { icon: Wrench, color: 'text-cyan-400' },
  mobile_browser: { icon: Phone, color: 'text-purple-400' },
  hardware_health: { icon: MonitorCheck, color: 'text-green-400' },

  // AI cards
  console_ai_issues: { icon: Wand2, color: 'text-purple-400' },
  console_ai_kubeconfig_audit: { icon: Wand2, color: 'text-purple-400' },
  console_ai_health_check: { icon: Wand2, color: 'text-purple-400' },
  console_ai_offline_detection: { icon: Stethoscope, color: 'text-green-400' },

  // Cost cards
  opencost_overview: { icon: TrendingUp, color: 'text-green-400' },
  kubecost_overview: { icon: TrendingUp, color: 'text-green-400' },

  // Compliance and security tools
  falco_alerts: { icon: AlertTriangle, color: 'text-red-400' },
  trivy_scan: { icon: Shield, color: 'text-blue-400' },
  kubescape_scan: { icon: Shield, color: 'text-purple-400' },
  compliance_score: { icon: Shield, color: 'text-green-400' },

  // Data compliance
  vault_secrets: { icon: Shield, color: 'text-yellow-400' },
  external_secrets: { icon: Shield, color: 'text-blue-400' },
  cert_manager: { icon: Shield, color: 'text-green-400' },

  // Prow CI cards
  prow_jobs: { icon: Activity, color: 'text-blue-400' },
  prow_status: { icon: Activity, color: 'text-green-400' },
  prow_history: { icon: Clock, color: 'text-purple-400' },

  // ML/AI workload cards
  llm_inference: { icon: Cpu, color: 'text-purple-400' },
  llm_models: { icon: Database, color: 'text-blue-400' },
  llmd_flow: { icon: Workflow, color: 'text-cyan-400' },
  llmd_ai_insights: { icon: Wand2, color: 'text-purple-400' },
  llmd_configurator: { icon: Settings, color: 'text-blue-400' },
  kvcache_monitor: { icon: Database, color: 'text-cyan-400' },
  epp_routing: { icon: Router, color: 'text-green-400' },
  pd_disaggregation: { icon: Split, color: 'text-purple-400' },
  ml_jobs: { icon: Activity, color: 'text-orange-400' },
  ml_notebooks: { icon: BookOpen, color: 'text-purple-400' },

  // Workload deployment
  workload_deployment: { icon: Box, color: 'text-blue-400' },

  // Workload Monitor cards
  workload_monitor: { icon: Package, color: 'text-purple-400' },
  llmd_stack_monitor: { icon: Cpu, color: 'text-purple-400' },
  prow_ci_monitor: { icon: Activity, color: 'text-blue-400' },
  github_ci_monitor: { icon: GitBranch, color: 'text-purple-400' },
  cluster_health_monitor: { icon: Server, color: 'text-green-400' },

  // Provider health
  provider_health: { icon: Activity, color: 'text-green-400' },
  // CoreDNS
  coredns_status: { icon: Network, color: 'text-cyan-400' },
  // CRI-O
  crio_status: { icon: Box, color: 'text-blue-400' },

  // Games
  sudoku_game: { icon: Puzzle, color: 'text-purple-400' },
  match_game: { icon: Puzzle, color: 'text-purple-400' },
  solitaire: { icon: Gamepad2, color: 'text-red-400' },
  checkers: { icon: Crown, color: 'text-yellow-400' },
  game_2048: { icon: Gamepad2, color: 'text-orange-400' },
  kubedle: { icon: Target, color: 'text-green-400' },
  pod_sweeper: { icon: Zap, color: 'text-red-400' },
  container_tetris: { icon: Gamepad2, color: 'text-cyan-400' },
  flappy_pod: { icon: Bird, color: 'text-yellow-400' },
  kube_man: { icon: Ghost, color: 'text-yellow-400' },
  kube_kong: { icon: Gamepad2, color: 'text-red-400' },
  pod_pitfall: { icon: Rocket, color: 'text-green-400' },
  node_invaders: { icon: Rocket, color: 'text-purple-400' },
  pod_brothers: { icon: Gamepad2, color: 'text-red-400' },
  pod_crosser: { icon: Gamepad2, color: 'text-green-400' },
  kube_kart: { icon: Gamepad2, color: 'text-green-400' },
  kube_pong: { icon: Gamepad2, color: 'text-cyan-400' },
  kube_snake: { icon: Gamepad2, color: 'text-green-400' },
  kube_galaga: { icon: Rocket, color: 'text-blue-400' },
  kube_doom: { icon: Gamepad2, color: 'text-red-400' },
  kube_craft: { icon: Puzzle, color: 'text-brown-400' },
  kube_chess: { icon: Crown, color: 'text-yellow-400' },
  kube_craft_3d: { icon: Puzzle, color: 'text-green-400' },

  // Kagenti (kagenti-operator) cards
  kagenti_status: { icon: Activity, color: 'text-purple-400' },
  kagenti_agent_fleet: { icon: Users, color: 'text-purple-400' },
  kagenti_build_pipeline: { icon: Workflow, color: 'text-blue-400' },
  kagenti_tool_registry: { icon: Wrench, color: 'text-cyan-400' },
  kagenti_agent_discovery: { icon: Target, color: 'text-green-400' },
  kagenti_security: { icon: Shield, color: 'text-yellow-400' },
  kagenti_security_posture: { icon: Shield, color: 'text-orange-400' },
  kagenti_topology: { icon: Network, color: 'text-blue-400' },

  // Kagent (kagent CRD) cards
  kagent_status: { icon: Activity, color: 'text-purple-400' },
  kagent_agent_fleet: { icon: Users, color: 'text-purple-400' },
  kagent_tool_registry: { icon: Wrench, color: 'text-cyan-400' },
  kagent_model_providers: { icon: Cpu, color: 'text-blue-400' },
  kagent_agent_discovery: { icon: Target, color: 'text-green-400' },
  kagent_security: { icon: Shield, color: 'text-yellow-400' },
  kagent_topology: { icon: Network, color: 'text-blue-400' },

  // Multi-tenancy
  ovn_status: { icon: Network, color: 'text-blue-400' },
  kubeflex_status: { icon: Layers, color: 'text-purple-400' },
  k3s_status: { icon: Box, color: 'text-green-400' },
  kubevirt_status: { icon: Monitor, color: 'text-orange-400' },
  multi_tenancy_overview: { icon: Shield, color: 'text-cyan-400' },
  tenant_isolation_setup: { icon: Settings, color: 'text-yellow-400' },
  tenant_topology: { icon: GitBranch, color: 'text-emerald-400' },
}
