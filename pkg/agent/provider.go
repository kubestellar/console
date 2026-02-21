package agent

import (
	"context"
)

// AIProvider defines the interface for AI agent providers
type AIProvider interface {
	// Name returns the unique identifier for this provider (e.g., "claude", "openai", "gemini")
	Name() string

	// DisplayName returns a human-readable name (e.g., "Claude (Anthropic)")
	DisplayName() string

	// Description returns a brief description of the provider's capabilities
	Description() string

	// Provider returns the provider company name (e.g., "anthropic", "openai", "google")
	Provider() string

	// IsAvailable returns true if the provider is configured with valid credentials
	IsAvailable() bool

	// Capabilities returns what this provider can do (chat, tool execution, or both)
	Capabilities() ProviderCapability

	// Chat sends a message and returns the complete response (blocking)
	Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error)

	// StreamChat sends a message and streams the response via callback
	// The onChunk callback is called for each chunk of the response
	// Returns the final complete response when done
	StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error)
}

// ChatRequest represents a request to an AI provider
type ChatRequest struct {
	// SessionID identifies the conversation session
	SessionID string `json:"sessionId"`

	// Prompt is the user's message
	Prompt string `json:"prompt"`

	// History contains previous messages in the conversation
	History []ChatMessage `json:"history,omitempty"`

	// SystemPrompt is an optional system message to guide the AI's behavior
	SystemPrompt string `json:"systemPrompt,omitempty"`

	// Context contains additional context (e.g., cluster info, namespace)
	Context map[string]string `json:"context,omitempty"`
}

// ChatMessage represents a single message in the conversation history
type ChatMessage struct {
	Role      string `json:"role"`      // "user", "assistant", or "system"
	Content   string `json:"content"`   // Message content
	Agent     string `json:"agent,omitempty"` // Which agent sent this message (for assistant messages)
}

// ChatResponse represents the response from an AI provider
type ChatResponse struct {
	// Content is the AI's response text
	Content string `json:"content"`

	// Agent is the name of the provider that generated this response
	Agent string `json:"agent"`

	// TokenUsage contains token consumption statistics
	TokenUsage *ProviderTokenUsage `json:"tokenUsage,omitempty"`

	// Done indicates if the response is complete (for streaming)
	Done bool `json:"done"`
}

// ProviderTokenUsage tracks token consumption for a request
type ProviderTokenUsage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
	TotalTokens  int `json:"totalTokens"`
}

// StreamEvent represents an event during streaming (tool use, thinking, etc.)
type StreamEvent struct {
	Type   string                 `json:"type"`            // "tool_use", "tool_result", "thinking", "text"
	Tool   string                 `json:"tool,omitempty"`  // Tool name (for tool_use)
	Input  map[string]any         `json:"input,omitempty"` // Tool input
	Output string                 `json:"output,omitempty"` // Tool output (for tool_result)
}

// StreamingProvider is an optional interface for providers that support progress events
type StreamingProvider interface {
	AIProvider
	// StreamChatWithProgress streams chat with progress events for tool activity
	StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error)
}

// ProviderCapability flags what a provider can do
type ProviderCapability int

const (
	// CapabilityChat indicates the provider can do text chat/analysis
	CapabilityChat ProviderCapability = 1 << iota
	// CapabilityToolExec indicates the provider can execute CLI tools/commands
	CapabilityToolExec
)

// HasCapability checks if a capability set includes a specific capability
func (c ProviderCapability) HasCapability(cap ProviderCapability) bool {
	return c&cap != 0
}

// MixedModeConfig configures dual-agent missions (thinking + execution)
type MixedModeConfig struct {
	// ThinkingAgent is the API agent for analysis (user-selected primary)
	ThinkingAgent string `json:"thinkingAgent"`
	// ExecutionAgent is the CLI agent for CRUD (auto-selected or user-configured)
	ExecutionAgent string `json:"executionAgent"`
	// Enabled indicates whether mixed mode is active for this session
	Enabled bool `json:"enabled"`
}

// DefaultSystemPrompt is the default system prompt for KubeStellar console
const DefaultSystemPrompt = `You are a helpful AI assistant embedded in the KubeStellar Console.
Your job is to help users with:
- Managing Kubernetes clusters and workloads
- Creating and managing BindingPolicies for multi-cluster deployments
- Troubleshooting cluster issues and analyzing logs
- Understanding KubeStellar concepts and best practices
- Executing kubectl commands and interpreting their output

Be concise but thorough. When dealing with Kubernetes resources, provide YAML examples when helpful.
Format your responses using markdown for better readability.`
