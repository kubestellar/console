package agent

import (

	"github.com/kubestellar/console/pkg/ai"
)

// maxStderrBytes is the maximum amount of stderr to capture from CLI subprocesses
// to prevent OOM when a provider emits unlimited stderr output.
const maxStderrBytes int64 = 1 << 20 // 1 MB

// AIProvider is an alias for the ai.Provider interface for backward compatibility
type AIProvider = ai.Provider

// ChatRequest is an alias for the ai.ChatRequest type for backward compatibility
type ChatRequest = ai.ChatRequest

// ChatMessage is an alias for the ai.ChatMessage type for backward compatibility
type ChatMessage = ai.ChatMessage

// ChatResponse is an alias for the ai.ChatResponse type for backward compatibility
type ChatResponse = ai.ChatResponse

// ProviderTokenUsage is an alias for the ai.ProviderTokenUsage type for backward compatibility
type ProviderTokenUsage = ai.ProviderTokenUsage

// ProviderCapability is an alias for the ai.ProviderCapability type for backward compatibility
type ProviderCapability = ai.ProviderCapability

// StreamEvent is an alias for the ai.StreamEvent type for backward compatibility
type StreamEvent = ai.StreamEvent

// StreamingProvider is an alias for the ai.StreamingProvider interface for backward compatibility
type StreamingProvider = ai.StreamingProvider

// HandshakeProvider is an alias for the ai.HandshakeProvider interface for backward compatibility
type HandshakeProvider = ai.HandshakeProvider

// HandshakeResult is an alias for the ai.HandshakeResult type for backward compatibility
type HandshakeResult = ai.HandshakeResult

// Re-export capability constants for backward compatibility
const (
	CapabilityChat     = ai.CapabilityChat
	CapabilityToolExec = ai.CapabilityToolExec
)

// MixedModeConfig configures dual-agent missions (thinking + execution)
type MixedModeConfig struct {
	// ThinkingAgent is the API agent for analysis (user-selected primary)
	ThinkingAgent string `json:"thinkingAgent"`
	// ExecutionAgent is the CLI agent for CRUD (auto-selected or user-configured)
	ExecutionAgent string `json:"executionAgent"`
	// Enabled indicates whether mixed mode is active for this session
	Enabled bool `json:"enabled"`
}

