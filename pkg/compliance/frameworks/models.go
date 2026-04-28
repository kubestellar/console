// Package frameworks provides a compliance framework evaluation engine.
// Each framework (PCI-DSS 4.0, SOC 2, etc.) is a collection of controls,
// each mapped to concrete Kubernetes checks that can be evaluated against
// a live cluster via the console's kubectl proxy.
package frameworks

import "time"

// Severity indicates the impact level of a control.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityHigh     Severity = "high"
	SeverityMedium   Severity = "medium"
	SeverityLow      Severity = "low"
)

// CheckStatus represents the evaluation result of a single check.
type CheckStatus string

const (
	StatusPass    CheckStatus = "pass"
	StatusFail    CheckStatus = "fail"
	StatusPartial CheckStatus = "partial"
	StatusSkipped CheckStatus = "skipped"
	StatusError   CheckStatus = "error"
)

// Framework describes a compliance standard (e.g. PCI-DSS 4.0).
type Framework struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Controls    []Control `json:"controls"`
	BuiltIn     bool      `json:"built_in"`
}

// Control is a single requirement within a framework.
type Control struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Severity    Severity `json:"severity"`
	Category    string   `json:"category"`
	Checks      []Check  `json:"checks"`
}

// Check is an individual verifiable assertion.
type Check struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	// CheckType selects the evaluator: "network_policy", "pod_security",
	// "rbac_least_privilege", "encryption_at_rest", "audit_logging",
	// "image_scanning", "auth_provider", "runtime_security".
	CheckType string `json:"check_type"`
	// Params are type-specific evaluation parameters.
	Params map[string]string `json:"params,omitempty"`
}

// EvaluationResult holds the full evaluation of a framework against a cluster.
type EvaluationResult struct {
	FrameworkID   string          `json:"framework_id"`
	FrameworkName string          `json:"framework_name"`
	ClusterName   string          `json:"cluster"`
	EvaluatedAt   time.Time       `json:"evaluated_at"`
	Score         int             `json:"score"` // 0-100
	TotalChecks   int             `json:"total_checks"`
	Passed        int             `json:"passed"`
	Failed        int             `json:"failed"`
	Partial       int             `json:"partial"`
	Skipped       int             `json:"skipped"`
	Errors        int             `json:"errors"`
	Controls      []ControlResult `json:"controls"`
}

// ControlResult holds the evaluation of a single control.
type ControlResult struct {
	ControlID   string        `json:"id"`
	Title       string        `json:"name"`
	Severity    Severity      `json:"severity"`
	Category    string        `json:"category"`
	Status      CheckStatus   `json:"status"`
	Checks      []CheckResult `json:"checks"`
	Remediation string        `json:"remediation,omitempty"`
}

// CheckResult holds the evaluation of a single check.
type CheckResult struct {
	CheckID   string      `json:"id"`
	Name      string      `json:"name"`
	CheckType string      `json:"type"`
	Status    CheckStatus `json:"status"`
	Evidence  string      `json:"evidence,omitempty"`
	Message   string      `json:"message,omitempty"`
}
