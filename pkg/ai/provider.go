package ai

import "context"

// Provider defines the interface for AI agent providers
type Provider interface {
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
	Role    string `json:"role"`              // "user", "assistant", or "system"
	Content string `json:"content"`           // Message content
	Agent   string `json:"agent,omitempty"`   // Which agent sent this message (for assistant messages)
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

	// ExitCode is populated by CLI-based providers when the child process
	// exits with a non-zero code. A non-zero value signals that the
	// provider's command failed, even if partial output was captured (#7273).
	ExitCode int `json:"exitCode,omitempty"`

	// Truncated is set to true when the CLI output scanner hit an error
	// (e.g. buffer overflow, read error) before the stream completed.
	// Consumers should treat the Content as potentially incomplete (#7278).
	Truncated bool `json:"truncated,omitempty"`

	// ToolsExecuted indicates whether any tools were actually called during
	// the mission execution. Used to detect false-positive completions where
	// the agent claims "task completed" without executing any commands (#13728).
	ToolsExecuted bool `json:"toolsExecuted,omitempty"`
}

// ProviderTokenUsage tracks token consumption for a request
type ProviderTokenUsage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
	TotalTokens  int `json:"totalTokens"`
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

// StreamEvent represents an event during streaming (tool use, thinking, etc.)
type StreamEvent struct {
	Type   string                 `json:"type"`             // "tool_use", "tool_result", "thinking", "text"
	Tool   string                 `json:"tool,omitempty"`   // Tool name (for tool_use)
	Input  map[string]any         `json:"input,omitempty"`  // Tool input
	Output string                 `json:"output,omitempty"` // Tool output (for tool_result)
}

// StreamingProvider is an optional interface for providers that support progress events
type StreamingProvider interface {
	Provider
	// StreamChatWithProgress streams chat with progress events for tool activity
	StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error)
}

// HandshakeProvider is an optional interface for providers that support
// explicit readiness checks beyond simple binary detection.  Providers
// implementing this interface can report prerequisites, detailed error
// messages, and whether they are truly ready to accept requests.
type HandshakeProvider interface {
	Provider
	// Handshake performs a quick connectivity/readiness check and returns
	// a structured result the frontend can render to the user.
	Handshake(ctx context.Context) *HandshakeResult
}

// HandshakeResult contains the outcome of a provider readiness check.
type HandshakeResult struct {
	// Ready is true when the provider responded successfully.
	Ready bool `json:"ready"`
	// State is one of: "starting", "handshake", "connected", "failed".
	State string `json:"state"`
	// Message is a human-readable status or error description.
	Message string `json:"message"`
	// Prerequisites lists things the user needs (desktop app, helper, etc).
	Prerequisites []string `json:"prerequisites,omitempty"`
	// Version is the detected provider version (empty if unknown).
	Version string `json:"version,omitempty"`
	// CliPath is the resolved path to the provider binary (empty if not found).
	CliPath string `json:"cliPath,omitempty"`
}
