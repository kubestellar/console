package protocol

// MessageType represents the type of message
type MessageType string

const (
	// Request types
	TypeHealth    MessageType = "health"
	TypeClusters  MessageType = "clusters"
	TypeKubectl   MessageType = "kubectl"
	TypeClaude    MessageType = "claude"

	// Response types
	TypeResult    MessageType = "result"
	TypeError     MessageType = "error"
	TypeStream    MessageType = "stream"
)

// Message is the base message structure for WebSocket communication
type Message struct {
	ID      string          `json:"id"`
	Type    MessageType     `json:"type"`
	Payload interface{}     `json:"payload,omitempty"`
}

// HealthPayload is the response for health checks
type HealthPayload struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Clusters  int    `json:"clusters"`
	HasClaude bool   `json:"hasClaude"`
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
