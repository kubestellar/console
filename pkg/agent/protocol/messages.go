package protocol

// MessageType represents the type of message
type MessageType string

const (
	// Request types
	TypeHealth        MessageType = "health"
	TypeClusters      MessageType = "clusters"
	TypeKubectl       MessageType = "kubectl"
	TypeClaude        MessageType = "claude"
	TypeRenameContext MessageType = "rename_context"
	TypeDeploy        MessageType = "deploy"

	// Response types
	TypeResult MessageType = "result"
	TypeError  MessageType = "error"
	TypeStream MessageType = "stream"
)

// Message is the base message structure for WebSocket communication
type Message struct {
	ID      string          `json:"id"`
	Type    MessageType     `json:"type"`
	Payload interface{}     `json:"payload,omitempty"`
}

// HealthPayload is the response for health checks
type HealthPayload struct {
	Status    string      `json:"status"`
	Version   string      `json:"version"`
	Clusters  int         `json:"clusters"`
	HasClaude bool        `json:"hasClaude"`
	Claude    *ClaudeInfo `json:"claude,omitempty"`
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

// DeployRequest is the payload for helm deploy commands
type DeployRequest struct {
	Context     string            `json:"context,omitempty"`     // kubeconfig context to use
	Namespace   string            `json:"namespace"`             // target namespace
	ReleaseName string            `json:"releaseName"`           // helm release name
	ChartPath   string            `json:"chartPath"`             // path to helm chart
	ImageRepo   string            `json:"imageRepo,omitempty"`   // image repository
	ImageTag    string            `json:"imageTag,omitempty"`    // image tag
	Values      map[string]string `json:"values,omitempty"`      // additional --set values
	Wait        bool              `json:"wait,omitempty"`        // wait for deployment
	Timeout     string            `json:"timeout,omitempty"`     // timeout duration
	AuthToken   string            `json:"authToken,omitempty"`   // authorization token
}

// DeployResponse is the response from a helm deploy command
type DeployResponse struct {
	Success     bool   `json:"success"`
	ReleaseName string `json:"releaseName"`
	Namespace   string `json:"namespace"`
	Output      string `json:"output"`
	Error       string `json:"error,omitempty"`
}
