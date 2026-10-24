/**
 * Project tags for cards that only exist in the component registry (no config file).
 * Cards with config files use the `projects` field on their UnifiedCardConfig instead.
 * Cards not listed here and without a config `projects` field are universal.
 */
export const CARD_PROJECT_TAGS: Record<string, string[]> = {
  // LLM-d benchmark cards (component-only, no config files)
  benchmark_hero: ['kubestellar'],
  pareto_frontier: ['kubestellar'],
  hardware_leaderboard: ['kubestellar'],
  latency_breakdown: ['kubestellar'],
  throughput_comparison: ['kubestellar'],
  performance_timeline: ['kubestellar'],
  resource_utilization: ['kubestellar'],
  // LLM-d monitoring cards
  epp_health: ['kubestellar'],
  model_endpoint_health: ['kubestellar'],
  // LLM-d architecture cards (component-only)
  llmd_flow: ['kubestellar'],
  kvcache_monitor: ['kubestellar'],
  epp_routing: ['kubestellar'],
  pd_disaggregation: ['kubestellar'],
  llmd_ai_insights: ['kubestellar'],
  llmd_configurator: ['kubestellar'],
  // Kagenti cards (component-only, shared with kagenti project)
  kagenti_status: ['kubestellar', 'kagenti'],
  kagenti_agent_fleet: ['kubestellar', 'kagenti'],
  kagenti_build_pipeline: ['kubestellar', 'kagenti'],
  kagenti_tool_registry: ['kubestellar', 'kagenti'],
  kagenti_agent_discovery: ['kubestellar', 'kagenti'],
  kagenti_security: ['kubestellar', 'kagenti'],
  kagenti_security_posture: ['kubestellar', 'kagenti'],
  kagenti_topology: ['kubestellar', 'kagenti'],
  // Kagent CRD cards (component-only, shared with kagent project)
  kagent_status: ['kubestellar', 'kagent'],
  kagent_agent_fleet: ['kubestellar', 'kagent'],
  kagent_tool_registry: ['kubestellar', 'kagent'],
  kagent_model_providers: ['kubestellar', 'kagent'],
  kagent_agent_discovery: ['kubestellar', 'kagent'],
  kagent_security: ['kubestellar', 'kagent'],
  kagent_topology: ['kubestellar', 'kagent'],
}
