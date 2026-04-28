// Package hipaa implements HIPAA Security Rule compliance checks
// mapped to Kubernetes infrastructure controls.
package hipaa

// Safeguard represents a HIPAA Security Rule technical safeguard.
type Safeguard struct {
	ID          string  `json:"id"`
	Section     string  `json:"section"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Status      string  `json:"status"` // pass, fail, partial, skipped
	Checks      []Check `json:"checks"`
}

// Check is an individual verification within a safeguard.
type Check struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"` // pass, fail, partial
	Evidence    string `json:"evidence"`
	Remediation string `json:"remediation"`
}

// PHINamespace represents a namespace handling Protected Health Information.
type PHINamespace struct {
	Name          string   `json:"name"`
	Cluster       string   `json:"cluster"`
	Labels        []string `json:"labels"`
	Encrypted     bool     `json:"encrypted"`
	AuditEnabled  bool     `json:"audit_enabled"`
	RBACRestricted bool   `json:"rbac_restricted"`
	Compliant     bool     `json:"compliant"`
}

// DataFlow represents a PHI data flow between components.
type DataFlow struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Protocol    string `json:"protocol"`
	Encrypted   bool   `json:"encrypted"`
	MutualTLS   bool   `json:"mutual_tls"`
}

// Summary is the overall HIPAA compliance summary.
type Summary struct {
	OverallScore     int            `json:"overall_score"`
	SafeguardsPassed int            `json:"safeguards_passed"`
	SafeguardsFailed int            `json:"safeguards_failed"`
	SafeguardsPartial int           `json:"safeguards_partial"`
	TotalSafeguards  int            `json:"total_safeguards"`
	PHINamespaces    int            `json:"phi_namespaces"`
	CompliantNS      int            `json:"compliant_namespaces"`
	DataFlows        int            `json:"data_flows"`
	EncryptedFlows   int            `json:"encrypted_flows"`
	EvaluatedAt      string         `json:"evaluated_at"`
}
