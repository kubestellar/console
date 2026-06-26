package k8s

// SecurityIssue represents a security misconfiguration
type SecurityIssue struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Cluster   string `json:"cluster,omitempty"`
	Issue     string `json:"issue"`
	Severity  string `json:"severity"` // high, medium, low
	Details   string `json:"details,omitempty"`
}
