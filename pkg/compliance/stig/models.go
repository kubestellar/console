// Package stig implements DISA STIG compliance checks for Kubernetes.
package stig

// Finding represents a single STIG finding (vulnerability).
type Finding struct {
	ID          string `json:"id"`          // V-number, e.g., V-242381
	RuleID      string `json:"rule_id"`     // SV-number
	Title       string `json:"title"`
	Description string `json:"description"`
	Severity    string `json:"severity"` // CAT I, CAT II, CAT III
	Status      string `json:"status"`   // open, not_a_finding, not_applicable, not_reviewed
	CheckResult string `json:"check_result"`
	FixText     string `json:"fix_text"`
}

// Benchmark represents a STIG benchmark (e.g., Kubernetes STIG).
type Benchmark struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Version     string    `json:"version"`
	ReleaseDate string    `json:"release_date"`
	Findings    []Finding `json:"findings"`
}

// Summary is the overall STIG compliance summary.
type Summary struct {
	TotalFindings   int    `json:"total_findings"`
	Open            int    `json:"open"`
	NotAFinding     int    `json:"not_a_finding"`
	NotApplicable   int    `json:"not_applicable"`
	NotReviewed     int    `json:"not_reviewed"`
	CatIOpen        int    `json:"cat_i_open"`
	CatIIOpen       int    `json:"cat_ii_open"`
	CatIIIOpen      int    `json:"cat_iii_open"`
	ComplianceScore int    `json:"compliance_score"` // 0-100
	BenchmarkID     string `json:"benchmark_id"`
	EvaluatedAt     string `json:"evaluated_at"`
}
