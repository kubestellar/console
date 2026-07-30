/**
 * Kagent CRD TypeScript types
 * Corresponds to kagent.dev CRDs: Agent, ModelConfig, ModelProviderConfig, ToolServer, RemoteMCPServer, Memory
 */

// Agent CRD (kagent.dev/v1alpha2)
export interface KagentCRDAgent {
  name: string
  namespace: string
  cluster: string
  agentType: 'Declarative' | 'BYO'
  runtime: 'python' | 'go' | ''
  status: 'Ready' | 'Accepted' | 'Pending' | 'Failed' | 'Unknown'
  replicas: number
  readyReplicas: number
  modelConfigRef: string
  toolCount: number
  a2aEnabled: boolean
  systemMessage: string
  createdAt: string
  age: string
}

// ToolServer CRD (kagent.dev/v1alpha1)
export interface KagentCRDToolServer {
  name: string
  namespace: string
  cluster: string
  kind: 'ToolServer' | 'RemoteMCPServer'
  protocol: string // stdio, sse, streamableHTTP
  url: string
  discoveredTools: KagentDiscoveredTool[]
  status: 'Ready' | 'Pending' | 'Failed' | 'Unknown'
}

export interface KagentDiscoveredTool {
  name: string
  description: string
}

// ModelConfig CRD (kagent.dev/v1alpha2)
export interface KagentCRDModelConfig {
  name: string
  namespace: string
  cluster: string
  kind: 'ModelConfig' | 'ModelProviderConfig'
  provider: string // Anthropic, OpenAI, AzureOpenAI, Ollama, Gemini, etc.
  model: string
  discoveredModels: string[]
  modelCount: number
  lastDiscoveryTime: string
  status: 'Ready' | 'Pending' | 'Failed' | 'Unknown'
}

// Memory CRD (kagent.dev/v1alpha1)
export interface KagentCRDMemory {
  name: string
  namespace: string
  cluster: string
  provider: string // pinecone, etc.
  status: 'Ready' | 'Pending' | 'Failed' | 'Unknown'
}

// Aggregated summary
export interface KagentCRDSummary {
  agentCount: number
  readyAgents: number
  failedAgents: number
  toolServerCount: number
  totalDiscoveredTools: number
  modelConfigCount: number
  memoryCount: number
  providers: Record<string, number>
  frameworks: Record<string, number>
  runtimes: Record<string, number>
  clusterBreakdown: KagentClusterBreakdown[]
}

export interface KagentClusterBreakdown {
  cluster: string
  agentCount: number
  readyAgents: number
  toolCount: number
  modelCount: number
  kagentInstalled: boolean
}

// API response types
export interface KagentCRDAgentsResponse {
  agents: KagentCRDAgent[]
  source?: string
  error?: string
}

export interface KagentCRDToolsResponse {
  tools: KagentCRDToolServer[]
  source?: string
  error?: string
}

export interface KagentCRDModelsResponse {
  models: KagentCRDModelConfig[]
  source?: string
  error?: string
}

export interface KagentCRDMemoriesResponse {
  memories: KagentCRDMemory[]
  source?: string
  error?: string
}

export interface KagentCRDSummaryResponse {
  summary: KagentCRDSummary
  source?: string
  error?: string
}
