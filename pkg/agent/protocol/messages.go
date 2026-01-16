package protocol

type MessageType string

const (
	TypeHealth    MessageType = "health"
	TypeClusters  MessageType = "clusters"
	TypeKubectl   MessageType = "kubectl"
	TypeClaude    MessageType = "claude"
	TypeResult    MessageType = "result"
	TypeError     MessageType = "error"
	TypeStream    MessageType = "stream"
)

type Message struct {
	ID      string      `json:"id"`
	Type    MessageType `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

type HealthPayload struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	Clusters  int    `json:"clusters"`
	HasClaude bool   `json:"hasClaude"`
}

type ClustersPayload struct {
	Clusters []ClusterInfo `json:"clusters"`
	Current  string        `json:"current"`
}

type ClusterInfo struct {
	Name      string `json:"name"`
	Context   string `json:"context"`
	Server    string `json:"server"`
	Namespace string `json:"namespace,omitempty"`
	IsCurrent bool   `json:"isCurrent"`
}

type KubectlRequest struct {
	Context   string   `json:"context,omitempty"`
	Namespace string   `json:"namespace,omitempty"`
	Args      []string `json:"args"`
}

type KubectlResponse struct {
	Output   string `json:"output"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}

type ClaudeRequest struct {
	Prompt    string `json:"prompt"`
	SessionID string `json:"sessionId,omitempty"`
}

type ClaudeResponse struct {
	Content   string `json:"content"`
	SessionID string `json:"sessionId"`
	Done      bool   `json:"done"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
