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
  | 'openrouter'      // OpenRouter (https://openrouter.ai) — unified OpenAI-compatible gateway
  | 'groq'            // Groq (https://groq.com) — ultra-low-latency LPU inference, OpenAI-compatible
  | 'bob'             // Bob (discovery-only)
  | 'block'           // Goose (Block Inc)
  | 'github-cli'      // GitHub Copilot CLI
  | 'kagent'          // Kagent (in-cluster)
  | 'kagenti'         // Kagenti (in-cluster)
  | 'ollama'          // Ollama - local LLM runtime
  | 'llamacpp'        // llama.cpp server
  | 'localai'         // LocalAI - self-hosted OpenAI-compatible runtime
  | 'vllm'            // vLLM - high-throughput GPU inference
  | 'lm-studio'       // LM Studio - workstation GUI runner
  | 'rhaiis'          // Red Hat AI Inference Server

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
  model?: string // Current model name (e.g. "gpt-4o", "claude-3.5-sonnet")
  installUrl?: string // shown when agent is not available
  installMissionId?: string // AI mission ID for automated install
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
  model?: string // Model name used for this response
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

// Provider connection lifecycle states
export type ProviderConnectionPhase =
  | 'idle'          // No connection attempt in progress
  | 'starting'      // Provider selection initiated
  | 'handshake'     // Waiting for provider handshake/confirmation
  | 'connected'     // Provider successfully connected
  | 'failed'        // Connection failed with a reason

export interface ProviderConnectionState {
  phase: ProviderConnectionPhase
  provider: string | null       // Provider name being connected
  startedAt: number | null      // Timestamp when connection attempt started
  error: string | null          // Error message on failure
  retryCount: number            // Number of retry attempts
  prerequisite: string | null   // Missing prerequisite description (e.g. extension not installed)
  prerequisites: string[]       // Detailed prerequisites from backend handshake
}

export const INITIAL_PROVIDER_CONNECTION_STATE: ProviderConnectionState = {
  phase: 'idle',
  provider: null,
  startedAt: null,
  error: null,
  retryCount: 0,
  prerequisite: null,
  prerequisites: [],
}

// Providers that require a desktop extension or bridge for the connection flow
export const PROVIDER_PREREQUISITES: Record<string, { label: string; description: string; installUrl: string }> = {
  vscode: {
    label: 'VS Code + Copilot Extension',
    description: 'VS Code must be running with the GitHub Copilot extension installed and signed in.',
    installUrl: 'https://marketplace.visualstudio.com/items?itemName=GitHub.copilot',
  },
  antigravity: {
    label: 'Antigravity CLI',
    description: 'The Antigravity CLI must be installed and in your PATH. It also requires authentication to be configured.',
    installUrl: 'https://github.com/anthropics/antigravity',
  },
}

// Mixed-mode configuration for dual-agent missions
export interface MixedModeState {
  enabled: boolean
  thinkingAgent: string    // Primary agent for analysis
  executionAgent: string   // CLI agent for CRUD
  autoExecutionAgent: boolean // Auto-select best available CLI agent
}
