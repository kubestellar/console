// Agent-related TypeScript types for multi-agent support

export type AgentProvider = 'anthropic' | 'openai' | 'google' | 'bob' | 'anthropic-local'

export interface AgentInfo {
  name: string
  displayName: string
  description: string
  provider: AgentProvider
  available: boolean
}

export interface AgentState {
  agents: AgentInfo[]
  selectedAgent: string | null
  defaultAgent: string | null
  loading: boolean
  error: string | null
}

export interface AgentsListPayload {
  agents: AgentInfo[]
  defaultAgent: string
  selected: string
}

export interface SelectAgentRequest {
  agent: string
  preserveHistory?: boolean
}

export interface AgentSelectedPayload {
  agent: string
  previous?: string
}

export interface ChatRequest {
  agent?: string
  prompt: string
  sessionId?: string
}

export interface ChatTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ChatStreamPayload {
  content: string
  agent: string
  sessionId: string
  done: boolean
  usage?: ChatTokenUsage
}

// Message types for WebSocket communication
export type AgentMessageType =
  | 'list_agents'
  | 'select_agent'
  | 'agents_list'
  | 'agent_selected'
  | 'chat'
