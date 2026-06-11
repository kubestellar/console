import type { CardComponent } from './cardRegistry.types'
import { safeLazy } from '../../lib/safeLazy'

const ACMMFeedbackLoops = safeLazy(() => import('./ACMMFeedbackLoops'), 'ACMMFeedbackLoops')
const ACMMLevel = safeLazy(() => import('./ACMMLevel'), 'ACMMLevel')
const ACMMRecommendations = safeLazy(() => import('./ACMMRecommendations'), 'ACMMRecommendations')
const _llmdBundle = import('./llmd').catch(() => undefined as never)
const BenchmarkHero = safeLazy(() => _llmdBundle, 'BenchmarkHero')
const ConsoleHealthCheckCard = safeLazy(() => import('./console-missions/ConsoleHealthCheckCard'), 'ConsoleHealthCheckCard')
const ConsoleIssuesCard = safeLazy(() => import('./console-missions/ConsoleIssuesCard'), 'ConsoleIssuesCard')
const ConsoleKubeconfigAuditCard = safeLazy(() => import('./console-missions/ConsoleKubeconfigAuditCard'), 'ConsoleKubeconfigAuditCard')
const ConsoleOfflineDetectionCard = safeLazy(() => import('./console-missions/ConsoleOfflineDetectionCard'), 'ConsoleOfflineDetectionCard')
const EPPRouting = safeLazy(() => _llmdBundle, 'EPPRouting')
const HardwareLeaderboard = safeLazy(() => _llmdBundle, 'HardwareLeaderboard')
const KVCacheMonitor = safeLazy(() => _llmdBundle, 'KVCacheMonitor')
const _kagentBundle = import('./kagent').catch(() => undefined as never)
const KagentAgentDiscovery = safeLazy(() => _kagentBundle, 'KagentAgentDiscovery')
const KagentAgentFleet = safeLazy(() => _kagentBundle, 'KagentAgentFleet')
const KagentModelProviders = safeLazy(() => _kagentBundle, 'KagentModelProviders')
const KagentSecurity = safeLazy(() => _kagentBundle, 'KagentSecurity')
const KagentStatusCard = safeLazy(() => import('./KagentStatusCard'), 'KagentStatusCard')
const KagentToolRegistry = safeLazy(() => _kagentBundle, 'KagentToolRegistry')
const KagentTopology = safeLazy(() => _kagentBundle, 'KagentTopology')
const _kagentiBundle = import('./kagenti').catch(() => undefined as never)
const KagentiAgentDiscovery = safeLazy(() => _kagentiBundle, 'KagentiAgentDiscovery')
const KagentiAgentFleet = safeLazy(() => _kagentiBundle, 'KagentiAgentFleet')
const KagentiBuildPipeline = safeLazy(() => _kagentiBundle, 'KagentiBuildPipeline')
const KagentiSecurity = safeLazy(() => _kagentiBundle, 'KagentiSecurity')
const KagentiSecurityPosture = safeLazy(() => _kagentiBundle, 'KagentiSecurityPosture')
const KagentiStatusCard = safeLazy(() => import('./KagentiStatusCard'), 'KagentiStatusCard')
const KagentiToolRegistry = safeLazy(() => _kagentiBundle, 'KagentiToolRegistry')
const KagentiTopology = safeLazy(() => _kagentiBundle, 'KagentiTopology')
const _workloadDetectionBundle = import('./workload-detection').catch(() => undefined as never)
const LLMInference = safeLazy(() => _workloadDetectionBundle, 'LLMInference')
const LLMModels = safeLazy(() => _workloadDetectionBundle, 'LLMModels')
const LLMdAIInsights = safeLazy(() => _llmdBundle, 'LLMdAIInsights')
const LLMdConfigurator = safeLazy(() => _llmdBundle, 'LLMdConfigurator')
const LLMdFlow = safeLazy(() => _llmdBundle, 'LLMdFlow')
const _workloadMonitorBundle = import('./workload-monitor').catch(() => undefined as never)
const LLMdStackMonitor = safeLazy(() => _workloadMonitorBundle, 'LLMdStackMonitor')
const LatencyBreakdown = safeLazy(() => _llmdBundle, 'LatencyBreakdown')
const MLJobs = safeLazy(() => _workloadDetectionBundle, 'MLJobs')
const MLNotebooks = safeLazy(() => _workloadDetectionBundle, 'MLNotebooks')
const NightlyE2EStatus = safeLazy(() => _llmdBundle, 'NightlyE2EStatus')
const PDDisaggregation = safeLazy(() => _llmdBundle, 'PDDisaggregation')
const ParetoFrontier = safeLazy(() => _llmdBundle, 'ParetoFrontier')
const PerformanceTimeline = safeLazy(() => _llmdBundle, 'PerformanceTimeline')
const ProviderHealth = safeLazy(() => import('./ProviderHealth'), 'ProviderHealth')
const ProwHistory = safeLazy(() => _workloadDetectionBundle, 'ProwHistory')
const ProwJobs = safeLazy(() => _workloadDetectionBundle, 'ProwJobs')
const ProwStatus = safeLazy(() => _workloadDetectionBundle, 'ProwStatus')
const ResourceUtilization = safeLazy(() => _llmdBundle, 'ResourceUtilization')
const ThroughputComparison = safeLazy(() => _llmdBundle, 'ThroughputComparison')

/**
 * AI/ML workload and agent cards.
 * Cards:
 * acmm_feedback_loops, acmm_level, acmm_recommendations, benchmark_hero, console_ai_health_check,
 * console_ai_issues, console_ai_kubeconfig_audit, console_ai_offline_detection, epp_routing,
 * hardware_leaderboard, kagent_agent_discovery, kagent_agent_fleet, kagent_model_providers,
 * kagent_security, kagent_status, kagent_tool_registry, kagent_topology, kagenti_agent_discovery,
 * kagenti_agent_fleet, kagenti_build_pipeline, kagenti_security, kagenti_security_posture,
 * kagenti_status, kagenti_tool_registry, kagenti_topology, kvcache_monitor, latency_breakdown,
 * llm_inference, llm_models, llmd_ai_insights, llmd_configurator, llmd_flow, llmd_stack_monitor,
 * ml_jobs, ml_notebooks, nightly_e2e_status, pareto_frontier, pd_disaggregation,
 * performance_timeline, provider_health, prow_history, prow_jobs, prow_status,
 * resource_utilization, throughput_comparison
 */
export interface CardRegistryDomain {
  components: Record<string, CardComponent>
  demoDataCards: Set<string>
  liveDataCards: Set<string>
  chunkPreloaders: Record<string, () => Promise<unknown>>
  defaultWidths: Record<string, number>
}

const components: Record<string, CardComponent> = {
  acmm_feedback_loops: ACMMFeedbackLoops,
  acmm_level: ACMMLevel,
  acmm_recommendations: ACMMRecommendations,
  benchmark_hero: BenchmarkHero,
  console_ai_health_check: ConsoleHealthCheckCard,
  console_ai_issues: ConsoleIssuesCard,
  console_ai_kubeconfig_audit: ConsoleKubeconfigAuditCard,
  console_ai_offline_detection: ConsoleOfflineDetectionCard,
  epp_routing: EPPRouting,
  hardware_leaderboard: HardwareLeaderboard,
  kagent_agent_discovery: KagentAgentDiscovery,
  kagent_agent_fleet: KagentAgentFleet,
  kagent_model_providers: KagentModelProviders,
  kagent_security: KagentSecurity,
  kagent_status: KagentStatusCard,
  kagent_tool_registry: KagentToolRegistry,
  kagent_topology: KagentTopology,
  kagenti_agent_discovery: KagentiAgentDiscovery,
  kagenti_agent_fleet: KagentiAgentFleet,
  kagenti_build_pipeline: KagentiBuildPipeline,
  kagenti_security: KagentiSecurity,
  kagenti_security_posture: KagentiSecurityPosture,
  kagenti_status: KagentiStatusCard,
  kagenti_tool_registry: KagentiToolRegistry,
  kagenti_topology: KagentiTopology,
  kvcache_monitor: KVCacheMonitor,
  latency_breakdown: LatencyBreakdown,
  llm_inference: LLMInference,
  llm_models: LLMModels,
  llmd_ai_insights: LLMdAIInsights,
  llmd_configurator: LLMdConfigurator,
  llmd_flow: LLMdFlow,
  llmd_stack_monitor: LLMdStackMonitor,
  ml_jobs: MLJobs,
  ml_notebooks: MLNotebooks,
  nightly_e2e_status: NightlyE2EStatus,
  pareto_frontier: ParetoFrontier,
  pd_disaggregation: PDDisaggregation,
  performance_timeline: PerformanceTimeline,
  provider_health: ProviderHealth,
  prow_history: ProwHistory,
  prow_jobs: ProwJobs,
  prow_status: ProwStatus,
  resource_utilization: ResourceUtilization,
  throughput_comparison: ThroughputComparison,
}

export const aimlCardRegistry: CardRegistryDomain = {
  components,
  demoDataCards: new Set([
    'kagent_agent_discovery',
    'kagent_agent_fleet',
    'kagent_model_providers',
    'kagent_security',
    'kagent_status',
    'kagent_tool_registry',
    'kagent_topology',
    'kagenti_agent_discovery',
    'kagenti_agent_fleet',
    'kagenti_build_pipeline',
    'kagenti_security',
    'kagenti_security_posture',
    'kagenti_status',
    'kagenti_tool_registry',
    'kagenti_topology',
    'llmd_configurator',
    'ml_jobs',
    'ml_notebooks',
  ]),
  liveDataCards: new Set([
    'kagent_agent_discovery',
    'kagent_agent_fleet',
    'kagent_model_providers',
    'kagent_security',
    'kagent_status',
    'kagent_tool_registry',
    'kagent_topology',
    'kagenti_agent_discovery',
    'kagenti_agent_fleet',
    'kagenti_build_pipeline',
    'kagenti_security',
    'kagenti_status',
    'kagenti_tool_registry',
    'kagenti_topology',
    'llm_inference',
    'llm_models',
    'llmd_stack_monitor',
    'nightly_e2e_status',
    'prow_history',
    'prow_jobs',
    'prow_status',
  ]),
  chunkPreloaders: {
    benchmark_hero: () => import('./llmd'),
    console_ai_health_check: () => import('./console-missions/ConsoleHealthCheckCard'),
    console_ai_issues: () => import('./console-missions/ConsoleIssuesCard'),
    console_ai_kubeconfig_audit: () => import('./console-missions/ConsoleKubeconfigAuditCard'),
    console_ai_offline_detection: () => import('./console-missions/ConsoleOfflineDetectionCard'),
    epp_routing: () => import('./llmd'),
    hardware_leaderboard: () => import('./llmd'),
    kagent_agent_discovery: () => import('./kagent'),
    kagent_agent_fleet: () => import('./kagent'),
    kagent_model_providers: () => import('./kagent'),
    kagent_security: () => import('./kagent'),
    kagent_status: () => import('./KagentStatusCard'),
    kagent_tool_registry: () => import('./kagent'),
    kagent_topology: () => import('./kagent'),
    kagenti_agent_discovery: () => import('./kagenti'),
    kagenti_agent_fleet: () => import('./kagenti'),
    kagenti_build_pipeline: () => import('./kagenti'),
    kagenti_security: () => import('./kagenti'),
    kagenti_security_posture: () => import('./kagenti'),
    kagenti_status: () => import('./KagentiStatusCard'),
    kagenti_tool_registry: () => import('./kagenti'),
    kagenti_topology: () => import('./kagenti'),
    kvcache_monitor: () => import('./llmd'),
    latency_breakdown: () => import('./llmd'),
    llm_inference: () => import('./workload-detection'),
    llm_models: () => import('./workload-detection'),
    llmd_ai_insights: () => import('./llmd'),
    llmd_configurator: () => import('./llmd'),
    llmd_flow: () => import('./llmd'),
    llmd_stack_monitor: () => import('./workload-monitor'),
    ml_jobs: () => import('./workload-detection'),
    ml_notebooks: () => import('./workload-detection'),
    nightly_e2e_status: () => import('./llmd'),
    pareto_frontier: () => import('./llmd'),
    pd_disaggregation: () => import('./llmd'),
    performance_timeline: () => import('./llmd'),
    provider_health: () => import('./ProviderHealth'),
    prow_history: () => import('./workload-detection'),
    prow_jobs: () => import('./workload-detection'),
    prow_status: () => import('./workload-detection'),
    resource_utilization: () => import('./llmd'),
    throughput_comparison: () => import('./llmd'),
  },
  defaultWidths: {
    benchmark_hero: 12,
    console_ai_health_check: 6,
    console_ai_issues: 6,
    console_ai_kubeconfig_audit: 6,
    console_ai_offline_detection: 6,
    epp_routing: 6,
    hardware_leaderboard: 12,
    kagent_agent_discovery: 4,
    kagent_agent_fleet: 8,
    kagent_model_providers: 4,
    kagent_security: 4,
    kagent_status: 4,
    kagent_tool_registry: 4,
    kagent_topology: 8,
    kagenti_agent_discovery: 4,
    kagenti_agent_fleet: 8,
    kagenti_build_pipeline: 4,
    kagenti_security: 4,
    kagenti_security_posture: 4,
    kagenti_status: 4,
    kagenti_tool_registry: 4,
    kagenti_topology: 8,
    kvcache_monitor: 4,
    latency_breakdown: 12,
    llm_inference: 6,
    llm_models: 6,
    llmd_ai_insights: 6,
    llmd_configurator: 4,
    llmd_flow: 8,
    llmd_stack_monitor: 6,
    ml_jobs: 6,
    ml_notebooks: 6,
    nightly_e2e_status: 12,
    pareto_frontier: 12,
    pd_disaggregation: 6,
    performance_timeline: 12,
    provider_health: 6,
    prow_history: 6,
    prow_jobs: 6,
    prow_status: 4,
    resource_utilization: 12,
    throughput_comparison: 12,
  },
}
