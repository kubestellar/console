// Agent-related TypeScript types for multi-agent support

export type AgentProvider =
  | 'anthropic'       // Claude.ai, Claude Desktop
  | 'anthropic-local' // Claude Code
  | 'openai'          // ChatGPT
  | 'openai-cli'      // Codex
  | 'google'          // Gemini API
  | 'google-cli'      // Gemini CLI
  | 'google-ag'       // Antigravity
  | 'github'          // GitHub Copilot
  | 'anysphere'       // Cursor
  | 'microsoft'       // VS Code
  | 'codeium'         // Windsurf
  | 'cline'           // Cline
  | 'jetbrains'       // JetBrains IDEs
  | 'zed'             // Zed
  | 'continue'        // Continue.dev
  | 'raycast'         // Raycast
  | 'open-webui'      // Open WebUI
  | 'bob'             // Bob (discovery-only)

// Capability flags matching backend ProviderCapability
export const AgentCapabilityChat = 1
export const AgentCapabilityToolExec = 2

export interface AgentInfo {
  name: string
  displayName: string
  description: string
  provider: AgentProvider
  available: boolean
  capabilities?: number // bitmask of capabilities
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
  | 'mixed_mode_thinking'
  | 'mixed_mode_executing'

// Mixed-mode configuration for dual-agent missions
export interface MixedModeState {
  enabled: boolean
  thinkingAgent: string    // Primary agent for analysis
  executionAgent: string   // CLI agent for CRUD
  autoExecutionAgent: boolean // Auto-select best available CLI agent
}
