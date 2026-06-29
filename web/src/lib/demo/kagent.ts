/**
 * Kagent Status — Demo Data & Type Definitions
 *
 * Models kagent agent status data for the kagent monitoring card.
 * Shown when no cluster is connected or in demo mode.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KagentAgentStatus = 'running' | 'stopped' | 'error'

export interface KagentStatusData {
  agentName: string
  namespace: string
  status: KagentAgentStatus
  activeMissions: number
  lastHeartbeatAt: string
  providerName: string
}

// ---------------------------------------------------------------------------
// Demo rows — realistic but synthetic
// ---------------------------------------------------------------------------

const DEMO_AGENTS: KagentStatusData[] = [
  {
    agentName: 'policy-agent',
    namespace: 'kagent-system',
    status: 'running',
    activeMissions: 3,
    lastHeartbeatAt: new Date(Date.now() - 15_000).toISOString(),
    providerName: 'openai',
  },
  {
    agentName: 'diagnostics-agent',
    namespace: 'kagent-system',
    status: 'running',
    activeMissions: 1,
    lastHeartbeatAt: new Date(Date.now() - 42_000).toISOString(),
    providerName: 'anthropic',
  },
  {
    agentName: 'remediation-agent',
    namespace: 'kagent-ops',
    status: 'stopped',
    activeMissions: 0,
    lastHeartbeatAt: new Date(Date.now() - 300_000).toISOString(),
    providerName: 'openai',
  },
  {
    agentName: 'audit-agent',
    namespace: 'kagent-ops',
    status: 'error',
    activeMissions: 0,
    lastHeartbeatAt: new Date(Date.now() - 900_000).toISOString(),
    providerName: 'azure-openai',
  },
]

export function generateKagentStatus(): KagentStatusData[] {
  return DEMO_AGENTS.map(agent => ({
    ...agent,
    lastHeartbeatAt: new Date(Date.now() - Math.floor(Math.random() * 600_000)).toISOString(),
  }))
}

export const KAGENT_DEMO_DATA: KagentStatusData[] = DEMO_AGENTS
