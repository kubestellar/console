import type { AgentInfo, AgentProvider } from '../../types/agent'

// Providers that are cluster-based (rendered in bottom section)
export const CLUSTER_PROVIDER_KEYS: AgentProvider[] = ['kagent', 'kagenti']

// Local LLM runners. Each is registered in the backend agent registry but only
// reports Available=true when its URL env var is set (or a loopback default
// applies for Ollama / LM Studio). When they are NOT available, we still want
// the dropdown to surface them with a link to their install mission so the
// operator can get from "not set up" to "chatting with a local LLM" without
// leaving the Console. Keep this map in sync with the provider keys in
// pkg/agent/provider_local_openai_compat.go.
export const LOCAL_LLM_INSTALL_MISSIONS: Readonly<Record<string, string>> = Object.freeze({
  ollama: 'install-ollama',
  llamacpp: 'install-llama-cpp',
  localai: 'install-localai',
  vllm: 'install-vllm',
  'lm-studio': 'install-lm-studio',
  rhaiis: 'install-rhaiis',
  'open-webui': 'install-open-webui',
  'claude-desktop': 'install-claude-desktop',
})

export interface KagentBackendInfo {
  kagentAvailable: boolean
  kagentiAvailable: boolean
  selectedKagentAgent: { name: string } | null
  selectedKagentiAgent: { name: string } | null
}

/**
 * Merges backend agents with always-show CLI stubs and in-cluster backends.
 * Bob is hidden unless detected (available === true).
 * Always-show CLI stubs are injected if not already returned by the backend.
 */
export function buildVisibleAgents(
  agents: AgentInfo[],
  alwaysShowCli: AgentInfo[],
  backend: KagentBackendInfo,
): AgentInfo[] {
  const merged = agents
    .filter(a => a.name !== 'bob' || a.available)
    // Enrich local LLM providers with their install mission IDs so the
    // dropdown can link to install missions when the runner is not yet
    // configured. Real install missions live in kubestellar/console-kb.
    .map(a => {
      if (a.available || a.installMissionId) return a
      const missionId = LOCAL_LLM_INSTALL_MISSIONS[a.name]
      return missionId ? { ...a, installMissionId: missionId } : a
    })

  for (const stub of alwaysShowCli) {
    if (!merged.some(a => a.name === stub.name || a.provider === stub.provider)) {
      merged.push(stub)
    }
  }

  const { kagentAvailable, kagentiAvailable, selectedKagentAgent, selectedKagentiAgent } = backend
  const inCluster: AgentInfo[] = []

  // Only add kagenti/kagent if not already present from the backend agent list
  if (!merged.some(a => a.provider === 'kagenti')) {
    inCluster.push({
      name: 'kagenti',
      displayName: selectedKagentiAgent ? `Kagenti (${selectedKagentiAgent.name})` : 'Kagenti',
      description: kagentiAvailable ? 'In-cluster AI agent via kagenti' : 'Install kagenti for in-cluster AI agents',
      provider: 'kagenti',
      available: kagentiAvailable,
      installMissionId: kagentiAvailable ? undefined : 'install-kagenti',
    })
  }
  if (!merged.some(a => a.provider === 'kagent')) {
    inCluster.push({
      name: 'kagent',
      displayName: selectedKagentAgent ? `Kagent (${selectedKagentAgent.name})` : 'Kagent',
      description: kagentAvailable ? 'In-cluster AI agent via kagent' : 'Install kagent for in-cluster AI agents',
      provider: 'kagent',
      available: kagentAvailable,
      installMissionId: kagentAvailable ? undefined : 'install-kagent',
    })
  }

  return [...merged, ...inCluster]
}

/**
 * Splits a flat agent list into three sections: the currently selected agent
 * (pinned to top), CLI agents, and cluster agents.  Within each section,
 * available agents sort before unavailable ones, then alphabetically.
 */
export function sectionAgents(
  visibleAgents: AgentInfo[],
  selectedAgent: string | null,
  clusterProviders: Set<AgentProvider>,
): { selectedAgentInfo: AgentInfo | null; cliAgents: AgentInfo[]; clusterAgents: AgentInfo[] } {
  const sectionSort = (a: AgentInfo, b: AgentInfo) => {
    if (a.available && !b.available) return -1
    if (!a.available && b.available) return 1
    return a.displayName.localeCompare(b.displayName)
  }

  const selected = visibleAgents.find(a => a.name === selectedAgent) || null
  const rest = visibleAgents.filter(a => a.name !== selectedAgent)

  const cli = rest.filter(a => !clusterProviders.has(a.provider as AgentProvider)).sort(sectionSort)
  const cluster = rest.filter(a => clusterProviders.has(a.provider as AgentProvider)).sort((a, b) => {
    if (a.available && !b.available) return -1
    if (!a.available && b.available) return 1
    if (a.provider === 'kagenti' && b.provider === 'kagent') return -1
    if (a.provider === 'kagent' && b.provider === 'kagenti') return 1
    return a.displayName.localeCompare(b.displayName)
  })

  return { selectedAgentInfo: selected, cliAgents: cli, clusterAgents: cluster }
}
