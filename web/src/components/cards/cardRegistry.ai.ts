import { safeLazy } from '../../lib/safeLazy'
import type { CardRegistryCategory } from './cardRegistry.types'

const ConsoleOfflineDetectionCard = safeLazy(() => import('./console-missions/ConsoleOfflineDetectionCard'), 'ConsoleOfflineDetectionCard')
const ConsoleIssuesCard = safeLazy(() => import('./console-missions/ConsoleIssuesCard'), 'ConsoleIssuesCard')
const ConsoleKubeconfigAuditCard = safeLazy(() => import('./console-missions/ConsoleKubeconfigAuditCard'), 'ConsoleKubeconfigAuditCard')
const ConsoleHealthCheckCard = safeLazy(() => import('./console-missions/ConsoleHealthCheckCard'), 'ConsoleHealthCheckCard')
const _workloadDetectionBundle = import('./workload-detection').catch(() => undefined as never)
const ProwJobs = safeLazy(() => _workloadDetectionBundle, 'ProwJobs')
const ProwStatus = safeLazy(() => _workloadDetectionBundle, 'ProwStatus')
const ProwHistory = safeLazy(() => _workloadDetectionBundle, 'ProwHistory')
const LLMInference = safeLazy(() => _workloadDetectionBundle, 'LLMInference')
const LLMModels = safeLazy(() => _workloadDetectionBundle, 'LLMModels')
const MLJobs = safeLazy(() => _workloadDetectionBundle, 'MLJobs')
const MLNotebooks = safeLazy(() => _workloadDetectionBundle, 'MLNotebooks')
const _workloadMonitorBundle = import('./workload-monitor').catch(() => undefined as never)
const WorkloadMonitor = safeLazy(() => _workloadMonitorBundle, 'WorkloadMonitor')
const ACMMLevel = safeLazy(() => import('./ACMMLevel'), 'ACMMLevel')
const ACMMFeedbackLoops = safeLazy(() => import('./ACMMFeedbackLoops'), 'ACMMFeedbackLoops')
const ACMMRecommendations = safeLazy(() => import('./ACMMRecommendations'), 'ACMMRecommendations')
const LLMdStackMonitor = safeLazy(() => _workloadMonitorBundle, 'LLMdStackMonitor')
const ProwCIMonitor = safeLazy(() => _workloadMonitorBundle, 'ProwCIMonitor')
const GitHubCIMonitor = safeLazy(() => _workloadMonitorBundle, 'GitHubCIMonitor')
const ClusterHealthMonitor = safeLazy(() => _workloadMonitorBundle, 'ClusterHealthMonitor')
const _llmdBundle = import('./llmd').catch(() => undefined as never)
const LLMdFlow = safeLazy(() => _llmdBundle, 'LLMdFlow')
const KVCacheMonitor = safeLazy(() => _llmdBundle, 'KVCacheMonitor')
const EPPRouting = safeLazy(() => _llmdBundle, 'EPPRouting')
const PDDisaggregation = safeLazy(() => _llmdBundle, 'PDDisaggregation')
const LLMdAIInsights = safeLazy(() => _llmdBundle, 'LLMdAIInsights')
const LLMdConfigurator = safeLazy(() => _llmdBundle, 'LLMdConfigurator')
const NightlyE2EStatus = safeLazy(() => _llmdBundle, 'NightlyE2EStatus')
const BenchmarkHero = safeLazy(() => _llmdBundle, 'BenchmarkHero')
const ParetoFrontier = safeLazy(() => _llmdBundle, 'ParetoFrontier')
const HardwareLeaderboard = safeLazy(() => _llmdBundle, 'HardwareLeaderboard')
const LatencyBreakdown = safeLazy(() => _llmdBundle, 'LatencyBreakdown')
const ThroughputComparison = safeLazy(() => _llmdBundle, 'ThroughputComparison')
const PerformanceTimeline = safeLazy(() => _llmdBundle, 'PerformanceTimeline')
const ResourceUtilization = safeLazy(() => _llmdBundle, 'ResourceUtilization')
const _pipelinesBundle = import('./pipelines').catch(() => undefined as never)
const NightlyReleasePulse = safeLazy(() => _pipelinesBundle, 'NightlyReleasePulse')
const WorkflowMatrix = safeLazy(() => _pipelinesBundle, 'WorkflowMatrix')
const PipelineFlow = safeLazy(() => _pipelinesBundle, 'PipelineFlow')
const RecentFailures = safeLazy(() => _pipelinesBundle, 'RecentFailures')
const ProviderHealth = safeLazy(() => import('./ProviderHealth'), 'ProviderHealth')
const KagentiStatusCard = safeLazy(() => import('./KagentiStatusCard'), 'KagentiStatusCard')
const _kagentiBundle = import('./kagenti').catch(() => undefined as never)
const KagentiAgentFleet = safeLazy(() => _kagentiBundle, 'KagentiAgentFleet')
const KagentiBuildPipeline = safeLazy(() => _kagentiBundle, 'KagentiBuildPipeline')
const KagentiToolRegistry = safeLazy(() => _kagentiBundle, 'KagentiToolRegistry')
const KagentiAgentDiscovery = safeLazy(() => _kagentiBundle, 'KagentiAgentDiscovery')
const KagentiSecurity = safeLazy(() => _kagentiBundle, 'KagentiSecurity')
const KagentiSecurityPosture = safeLazy(() => _kagentiBundle, 'KagentiSecurityPosture')
const KagentiTopology = safeLazy(() => _kagentiBundle, 'KagentiTopology')
const KagentStatusCard = safeLazy(() => import('./KagentStatusCard'), 'KagentStatusCard')
const _kagentBundle = import('./kagent').catch(() => undefined as never)
const KagentAgentFleet = safeLazy(() => _kagentBundle, 'KagentAgentFleet')
const KagentToolRegistry = safeLazy(() => _kagentBundle, 'KagentToolRegistry')
const KagentModelProviders = safeLazy(() => _kagentBundle, 'KagentModelProviders')
const KagentAgentDiscovery = safeLazy(() => _kagentBundle, 'KagentAgentDiscovery')
const KagentSecurity = safeLazy(() => _kagentBundle, 'KagentSecurity')
const KagentTopology = safeLazy(() => _kagentBundle, 'KagentTopology')

export const aiCardRegistry: CardRegistryCategory = {
  components: {
    acmm_level: ACMMLevel, acmm_feedback_loops: ACMMFeedbackLoops, acmm_recommendations: ACMMRecommendations,
    console_ai_issues: ConsoleIssuesCard, console_ai_kubeconfig_audit: ConsoleKubeconfigAuditCard,
    console_ai_health_check: ConsoleHealthCheckCard, console_ai_offline_detection: ConsoleOfflineDetectionCard,
    prow_jobs: ProwJobs, prow_status: ProwStatus, prow_history: ProwHistory, llm_inference: LLMInference,
    llm_models: LLMModels, ml_jobs: MLJobs, ml_notebooks: MLNotebooks, workload_monitor: WorkloadMonitor,
    workload_status: WorkloadMonitor, llmd_stack_monitor: LLMdStackMonitor, prow_ci_monitor: ProwCIMonitor,
    github_ci_monitor: GitHubCIMonitor, cluster_health_monitor: ClusterHealthMonitor, llmd_flow: LLMdFlow,
    kvcache_monitor: KVCacheMonitor, epp_routing: EPPRouting, pd_disaggregation: PDDisaggregation,
    llmd_ai_insights: LLMdAIInsights, llmd_configurator: LLMdConfigurator, nightly_e2e_status: NightlyE2EStatus,
    benchmark_hero: BenchmarkHero, pareto_frontier: ParetoFrontier, hardware_leaderboard: HardwareLeaderboard,
    latency_breakdown: LatencyBreakdown, throughput_comparison: ThroughputComparison,
    performance_timeline: PerformanceTimeline, resource_utilization: ResourceUtilization,
    nightly_release_pulse: NightlyReleasePulse, workflow_matrix: WorkflowMatrix, pipeline_flow: PipelineFlow,
    recent_failures: RecentFailures, provider_health: ProviderHealth, kagenti_status: KagentiStatusCard,
    kagenti_agent_fleet: KagentiAgentFleet, kagenti_build_pipeline: KagentiBuildPipeline,
    kagenti_tool_registry: KagentiToolRegistry, kagenti_agent_discovery: KagentiAgentDiscovery,
    kagenti_security: KagentiSecurity, kagenti_security_posture: KagentiSecurityPosture,
    kagenti_topology: KagentiTopology, kagent_status: KagentStatusCard, kagent_agent_fleet: KagentAgentFleet,
    kagent_tool_registry: KagentToolRegistry, kagent_model_providers: KagentModelProviders,
    kagent_agent_discovery: KagentAgentDiscovery, kagent_security: KagentSecurity, kagent_topology: KagentTopology,
  },
  preloaders: {
    acmm_level: () => import('./ACMMLevel'), acmm_feedback_loops: () => import('./ACMMFeedbackLoops'), acmm_recommendations: () => import('./ACMMRecommendations'),
    console_ai_issues: () => import('./console-missions/ConsoleIssuesCard'), console_ai_kubeconfig_audit: () => import('./console-missions/ConsoleKubeconfigAuditCard'),
    console_ai_health_check: () => import('./console-missions/ConsoleHealthCheckCard'), console_ai_offline_detection: () => import('./console-missions/ConsoleOfflineDetectionCard'),
    prow_jobs: () => import('./workload-detection'), prow_status: () => import('./workload-detection'), prow_history: () => import('./workload-detection'),
    llm_inference: () => import('./workload-detection'), llm_models: () => import('./workload-detection'), ml_jobs: () => import('./workload-detection'),
    ml_notebooks: () => import('./workload-detection'), workload_monitor: () => import('./workload-monitor'), workload_status: () => import('./workload-monitor'),
    llmd_stack_monitor: () => import('./workload-monitor'), prow_ci_monitor: () => import('./workload-monitor'), github_ci_monitor: () => import('./workload-monitor'),
    cluster_health_monitor: () => import('./workload-monitor'), llmd_flow: () => import('./llmd'), kvcache_monitor: () => import('./llmd'),
    epp_routing: () => import('./llmd'), pd_disaggregation: () => import('./llmd'), llmd_ai_insights: () => import('./llmd'),
    llmd_configurator: () => import('./llmd'), nightly_e2e_status: () => import('./llmd'), benchmark_hero: () => import('./llmd'),
    pareto_frontier: () => import('./llmd'), hardware_leaderboard: () => import('./llmd'), latency_breakdown: () => import('./llmd'),
    throughput_comparison: () => import('./llmd'), performance_timeline: () => import('./llmd'), resource_utilization: () => import('./llmd'),
    nightly_release_pulse: () => import('./pipelines'), workflow_matrix: () => import('./pipelines'), pipeline_flow: () => import('./pipelines'),
    recent_failures: () => import('./pipelines'), provider_health: () => import('./ProviderHealth'), kagenti_status: () => import('./KagentiStatusCard'),
    kagenti_agent_fleet: () => import('./kagenti'), kagenti_build_pipeline: () => import('./kagenti'), kagenti_tool_registry: () => import('./kagenti'),
    kagenti_agent_discovery: () => import('./kagenti'), kagenti_security: () => import('./kagenti'), kagenti_security_posture: () => import('./kagenti'),
    kagenti_topology: () => import('./kagenti'), kagent_status: () => import('./KagentStatusCard'), kagent_agent_fleet: () => import('./kagent'),
    kagent_tool_registry: () => import('./kagent'), kagent_model_providers: () => import('./kagent'), kagent_agent_discovery: () => import('./kagent'),
    kagent_security: () => import('./kagent'), kagent_topology: () => import('./kagent'),
  },
  defaultWidths: {
    acmm_level: 6, acmm_feedback_loops: 6, acmm_recommendations: 6, prow_jobs: 6, prow_status: 4, prow_history: 6,
    llm_inference: 6, llm_models: 6, ml_jobs: 6, ml_notebooks: 6, console_ai_issues: 6, console_ai_kubeconfig_audit: 6,
    console_ai_health_check: 6, console_ai_offline_detection: 6, workload_monitor: 8, workload_status: 8,
    llmd_stack_monitor: 6, prow_ci_monitor: 6, github_ci_monitor: 8, cluster_health_monitor: 6, provider_health: 6,
    kagenti_status: 4, kagenti_agent_fleet: 8, kagenti_build_pipeline: 4, kagenti_tool_registry: 4, kagenti_agent_discovery: 4,
    kagenti_security: 4, kagenti_security_posture: 4, kagenti_topology: 8, kagent_status: 4, kagent_agent_fleet: 8,
    kagent_tool_registry: 4, kagent_model_providers: 4, kagent_agent_discovery: 4, kagent_security: 4, kagent_topology: 8,
    llmd_flow: 8, kvcache_monitor: 4, epp_routing: 6, pd_disaggregation: 6, llmd_ai_insights: 6, llmd_configurator: 4,
    nightly_e2e_status: 12, benchmark_hero: 12, pareto_frontier: 12, hardware_leaderboard: 12, latency_breakdown: 12,
    throughput_comparison: 12, performance_timeline: 12, resource_utilization: 12, nightly_release_pulse: 6,
    workflow_matrix: 6, pipeline_flow: 12, recent_failures: 6,
  },
  demoDataCards: ['ml_jobs', 'ml_notebooks', 'llmd_configurator', 'kagenti_status', 'kagenti_agent_fleet', 'kagenti_build_pipeline', 'kagenti_tool_registry', 'kagenti_agent_discovery', 'kagenti_security', 'kagenti_security_posture', 'kagenti_topology', 'kagent_status', 'kagent_agent_fleet', 'kagent_tool_registry', 'kagent_model_providers', 'kagent_agent_discovery', 'kagent_security', 'kagent_topology'],
  liveDataCards: ['prow_jobs', 'prow_status', 'prow_history', 'llm_inference', 'llm_models', 'workload_monitor', 'workload_status', 'llmd_stack_monitor', 'prow_ci_monitor', 'github_ci_monitor', 'nightly_release_pulse', 'workflow_matrix', 'pipeline_flow', 'recent_failures', 'cluster_health_monitor', 'nightly_e2e_status', 'kagenti_status', 'kagenti_agent_fleet', 'kagenti_build_pipeline', 'kagenti_tool_registry', 'kagenti_agent_discovery', 'kagenti_security', 'kagenti_topology', 'kagent_status', 'kagent_agent_fleet', 'kagent_tool_registry', 'kagent_model_providers', 'kagent_agent_discovery', 'kagent_security', 'kagent_topology'],
  demoStartupPreloaders: [
    () => import('./workload-detection/MLJobs'), () => import('./workload-detection/MLNotebooks'), () => import('./llmd'),
    () => import('./KagentiStatusCard'), () => import('./kagenti/KagentiAgentFleet'), () => import('./kagenti/KagentiBuildPipeline'),
    () => import('./kagenti/KagentiToolRegistry'), () => import('./kagenti/KagentiAgentDiscovery'), () => import('./kagenti/KagentiSecurity'),
    () => import('./kagenti/KagentiTopology'), () => import('./KagentStatusCard'), () => import('./kagent/KagentAgentFleet'),
    () => import('./kagent/KagentToolRegistry'), () => import('./kagent/KagentModelProviders'),
    () => import('./kagent/KagentAgentDiscovery'), () => import('./kagent/KagentSecurity'), () => import('./kagent/KagentTopology'),
  ],
}
