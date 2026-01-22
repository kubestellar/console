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
