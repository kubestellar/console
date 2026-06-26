// Package airgap implements air-gap readiness assessment for Kubernetes clusters.
package airgap

// Requirement represents an air-gap readiness requirement.
type Requirement struct {
	ID          string `json:"id"`
	Category    string `json:"category"` // registry, dns, ntp, updates, telemetry
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"` // ready, not_ready, partial, not_applicable
	Evidence    string `json:"evidence"`
	Remediation string `json:"remediation"`
}

// ClusterReadiness shows air-gap readiness per cluster.
type ClusterReadiness struct {
	Cluster       string `json:"cluster"`
	Ready         bool   `json:"ready"`
	Score         int    `json:"score"` // 0-100
	Requirements  int    `json:"total_requirements"`
	ReadyCount    int    `json:"ready_count"`
	NotReadyCount int    `json:"not_ready_count"`
}

// Summary is the overall air-gap readiness summary.
type Summary struct {
	TotalClusters    int    `json:"total_clusters"`
	ReadyClusters    int    `json:"ready_clusters"`
	NotReadyClusters int    `json:"not_ready_clusters"`
	OverallScore     int    `json:"overall_score"` // 0-100
	TotalRequirements int   `json:"total_requirements"`
	MetRequirements  int    `json:"met_requirements"`
	EvaluatedAt      string `json:"evaluated_at"`
}
