package handlers

// ClusterError represents a per-cluster failure in a multi-cluster request (#4758).
// Included in the response so the frontend can distinguish "no resources" from
// "cluster failed" and display an appropriate degraded-state indicator.
// Defined here (parent handlers package) so it can be referenced by both
// handlers and the handlers/mcp sub-package without creating an import cycle.
type ClusterError struct {
	Cluster   string `json:"cluster"`
	ErrorType string `json:"errorType"`
	Message   string `json:"message"`
}
