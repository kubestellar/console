package protocol

// MessageType represents the type of message
type MessageType string

const (
	// Request types
	TypeHealth        MessageType = "health"
	TypeClusters      MessageType = "clusters"
	TypeKubectl       MessageType = "kubectl"
	TypeClaude        MessageType = "claude"        // Legacy - routes to selected agent
	TypeChat          MessageType = "chat"          // Generic chat with selected agent
	TypeListAgents    MessageType = "list_agents"   // List available AI agents
	TypeSelectAgent   MessageType = "select_agent"  // Select an AI agent
	TypeRenameContext MessageType = "rename_context"

	// Response types
	TypeResult        MessageType = "result"
	TypeError         MessageType = "error"
	TypeStream        MessageType = "stream"
	TypeProgress      MessageType = "progress"       // Tool activity/progress events
	TypeAgentSelected MessageType = "agent_selected" // Agent selection confirmed
	TypeAgentsList    MessageType = "agents_list"    // List of available agents
)

// Message is the base message structure for WebSocket communication
type Message struct {
	ID      string          `json:"id"`
	Type    MessageType     `json:"type"`
	Payload interface{}     `json:"payload,omitempty"`
}

// HealthPayload is the response for health checks
type HealthPayload struct {
	Status        string      `json:"status"`
	Version       string      `json:"version"`
	Clusters      int         `json:"clusters"`
	HasClaude     bool        `json:"hasClaude"`
	Claude        *ClaudeInfo `json:"claude,omitempty"`
	InstallMethod string      `json:"install_method,omitempty"`
}

// ClaudeInfo contains information about the local Claude Code installation
type ClaudeInfo struct {
	Installed  bool       `json:"installed"`
	Path       string     `json:"path,omitempty"`
	Version    string     `json:"version,omitempty"`
	TokenUsage TokenUsage `json:"tokenUsage"`
}

// TokenUsage contains token consumption statistics
type TokenUsage struct {
	Session   TokenCount `json:"session"`
	Today     TokenCount `json:"today"`
	ThisMonth TokenCount `json:"thisMonth"`
}

// TokenCount represents input/output token counts
type TokenCount struct {
	Input  int64 `json:"input"`
	Output int64 `json:"output"`
}

// ClustersPayload is the response for cluster listing
type ClustersPayload struct {
	Clusters []ClusterInfo `json:"clusters"`
	Current  string        `json:"current"`
}

// ClusterInfo represents a kubeconfig context
type ClusterInfo struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server"`
	User      string `json:"user,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

// KubectlRequest is the payload for kubectl commands
type KubectlRequest struct {
	Context   string   `json:"context,omitempty"`
	Namespace string   `json:"namespace,omitempty"`
	Args      []string `json:"args"`
}

// KubectlResponse is the response from kubectl commands
type KubectlResponse struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}

// ClaudeRequest is the payload for Claude Code requests
type ClaudeRequest struct {
	Prompt    string `json:"prompt"`
	SessionID string `json:"sessionId,omitempty"`
}

// ClaudeResponse is the response from Claude Code
type ClaudeResponse struct {
	Content   string `json:"content"`
	SessionID string `json:"sessionId"`
	Done      bool   `json:"done"`
}

// ErrorPayload represents an error response
type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// RenameContextRequest is the payload for renaming a kubeconfig context
type RenameContextRequest struct {
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
}

// RenameContextResponse is the response from renaming a context
type RenameContextResponse struct {
	Success bool   `json:"success"`
	OldName string `json:"oldName"`
	NewName string `json:"newName"`
}

// AgentInfo contains information about an AI agent
type AgentInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Description string `json:"description"`
	Provider    string `json:"provider"`
	Available   bool   `json:"available"`
}

// AgentsListPayload is the response for listing available agents
type AgentsListPayload struct {
	Agents       []AgentInfo `json:"agents"`
	DefaultAgent string      `json:"defaultAgent"`
	Selected     string      `json:"selected"`
}

// SelectAgentRequest is the payload for selecting an AI agent
type SelectAgentRequest struct {
	Agent           string `json:"agent"`
	PreserveHistory bool   `json:"preserveHistory,omitempty"`
}

// AgentSelectedPayload is the response after selecting an agent
type AgentSelectedPayload struct {
	Agent    string `json:"agent"`
	Previous string `json:"previous,omitempty"`
}

// ChatMessage represents a message in conversation history
type ChatMessage struct {
	Role    string `json:"role"`    // "user" or "assistant"
	Content string `json:"content"`
}

// ChatRequest is the payload for chat messages (multi-agent)
type ChatRequest struct {
	Agent     string        `json:"agent,omitempty"`   // Optional - uses selected agent if empty
	Prompt    string        `json:"prompt"`
	SessionID string        `json:"sessionId,omitempty"`
	History   []ChatMessage `json:"history,omitempty"` // Previous messages for context
}

// ChatStreamPayload is a streaming response chunk from chat
type ChatStreamPayload struct {
	Content   string           `json:"content"`
	Agent     string           `json:"agent"`
	SessionID string           `json:"sessionId"`
	Done      bool             `json:"done"`
	Usage     *ChatTokenUsage  `json:"usage,omitempty"`
}

// ChatTokenUsage tracks token usage for a chat response
type ChatTokenUsage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
	TotalTokens  int `json:"totalTokens"`
}

// ProgressPayload represents tool activity or progress events during streaming
type ProgressPayload struct {
	Step   string         `json:"step"`             // Human-readable step description
	Tool   string         `json:"tool,omitempty"`   // Tool being used
	Input  map[string]any `json:"input,omitempty"`  // Tool input (truncated)
	Output string         `json:"output,omitempty"` // Tool output (truncated)
}
