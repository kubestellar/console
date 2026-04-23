// Package nist80053 implements NIST 800-53 control mapping and assessment
// for Kubernetes infrastructure.
package nist80053

// ControlFamily represents a NIST 800-53 control family (e.g., AC, AU, SC).
type ControlFamily struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Controls    []Control `json:"controls"`
	PassRate    int       `json:"pass_rate"` // 0-100
}

// Control represents an individual NIST 800-53 control.
type Control struct {
	ID          string `json:"id"`          // e.g., AC-2, SC-7
	Name        string `json:"name"`
	Description string `json:"description"`
	Priority    string `json:"priority"` // P1, P2, P3
	Baseline    string `json:"baseline"`  // low, moderate, high
	Status      string `json:"status"`   // implemented, partial, planned, not_applicable
	Evidence    string `json:"evidence"`
	Remediation string `json:"remediation"`
}

// ControlMapping maps a NIST control to specific Kubernetes resources.
type ControlMapping struct {
	ControlID    string   `json:"control_id"`
	Resources    []string `json:"resources"`    // k8s resource types
	Namespaces   []string `json:"namespaces"`   // affected namespaces
	Clusters     []string `json:"clusters"`     // affected clusters
	Automated    bool     `json:"automated"`    // auto-verified or manual
	LastAssessed string   `json:"last_assessed"`
}

// Summary is the overall NIST 800-53 compliance summary.
type Summary struct {
	TotalControls       int    `json:"total_controls"`
	ImplementedControls int    `json:"implemented_controls"`
	PartialControls     int    `json:"partial_controls"`
	PlannedControls     int    `json:"planned_controls"`
	NotApplicable       int    `json:"not_applicable"`
	OverallScore        int    `json:"overall_score"` // 0-100
	Baseline            string `json:"baseline"`      // low, moderate, high
	EvaluatedAt         string `json:"evaluated_at"`
}
