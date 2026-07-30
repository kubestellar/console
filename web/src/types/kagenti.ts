/**
 * Kagenti CRD TypeScript types
 * Corresponds to kagenti-operator CRDs: Agent, AgentCard, AgentBuild, MCPServer
 */

// Agent CRD (agent.kagenti.dev/v1alpha1)
export interface KagentiAgent {
  name: string
  namespace: string
  cluster: string
  status: 'Ready' | 'Deploying' | 'Failed' | 'Unknown'
  replicas: number
  readyReplicas: number
  image: string
  framework: string // langgraph, crewai, ag2, generic
  protocol: string  // a2a, mcp
  labels: Record<string, string>
  createdAt: string
  age: string
}

// AgentCard CRD (agent.kagenti.dev/v1alpha1)
export interface KagentiAgentCard {
  name: string
  namespace: string
  cluster: string
  agentName: string
  skills: KagentiSkill[]
  capabilities: string[]
  syncPeriod: string
  identityBinding: 'strict' | 'permissive' | 'none'
  lastSyncTime: string
}

export interface KagentiSkill {
  name: string
  description: string
  inputModes: string[]
  outputModes: string[]
}

// AgentBuild CRD (agent.kagenti.dev/v1alpha1)
export interface KagentiBuild {
  name: string
  namespace: string
  cluster: string
  status: 'Building' | 'Succeeded' | 'Failed' | 'Pending'
  source: string
  pipeline: string
  mode: string // dev, buildpack-dev, preprod, prod
  framework: string
  startTime: string
  completionTime: string
  age: string
}

// MCPServer CRD (mcp.kagenti.com/v1alpha1)
export interface KagentiTool {
  name: string
  namespace: string
  cluster: string
  toolPrefix: string
  targetRef: string
  hasCredential: boolean
  route: string
}

// Aggregated summary across clusters
export interface KagentiSummary {
  agentCount: number
  readyAgents: number
  failedAgents: number
  buildCount: number
  activeBuilds: number
  succeededBuilds: number
  failedBuilds: number
  toolCount: number
  cardCount: number
  frameworks: Record<string, number>
  protocols: Record<string, number>
  spiffeBound: number
  spiffeTotal: number
  clusterBreakdown: KagentiClusterBreakdown[]
}

export interface KagentiClusterBreakdown {
  cluster: string
  agentCount: number
  readyAgents: number
  toolCount: number
  buildCount: number
  kagentiInstalled: boolean
}

// API response types
export interface KagentiAgentsResponse {
  agents: KagentiAgent[]
  source?: string
  error?: string
}

export interface KagentiBuildsResponse {
  builds: KagentiBuild[]
  source?: string
  error?: string
}

export interface KagentiToolsResponse {
  tools: KagentiTool[]
  source?: string
  error?: string
}

export interface KagentiCardsResponse {
  cards: KagentiAgentCard[]
  source?: string
  error?: string
}

export interface KagentiSummaryResponse {
  summary: KagentiSummary
  source?: string
  error?: string
}
