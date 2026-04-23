// Package sod provides a Segregation of Duties (SoD) analysis engine.
// It detects conflicting privilege assignments that violate SOX, PCI-DSS,
// and general least-privilege security principles.
package sod

// ConflictType classifies the SoD violation pattern.
type ConflictType string

const (
	ConflictDeployerApprover ConflictType = "deployer-approver"
	ConflictAdminAuditor     ConflictType = "admin-auditor"
	ConflictDevProdAccess    ConflictType = "dev-prod-access"
	ConflictSecretAdmin      ConflictType = "secret-admin"
	ConflictNetworkRBAC      ConflictType = "network-rbac"
)

// Severity of a detected SoD conflict.
type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityHigh     Severity = "high"
	SeverityMedium   Severity = "medium"
	SeverityLow      Severity = "low"
)

// SoDRule defines a pair of roles/privileges that should not be held by
// the same principal.
type SoDRule struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	RoleA       string       `json:"role_a"`
	RoleB       string       `json:"role_b"`
	Conflict    ConflictType `json:"conflict_type"`
	Severity    Severity     `json:"severity"`
	Regulation  string       `json:"regulation"`
}

// Principal represents a user or service account with assigned roles.
type Principal struct {
	Name     string   `json:"name"`
	Type     string   `json:"type"` // "user", "group", "serviceaccount"
	Roles    []string `json:"roles"`
	Clusters []string `json:"clusters"`
}

// SoDViolation records a detected SoD conflict for a specific principal.
type SoDViolation struct {
	ID          string   `json:"id"`
	RuleID      string   `json:"rule_id"`
	Principal   string   `json:"principal"`
	Type        string   `json:"principal_type"`
	RoleA       string   `json:"role_a"`
	RoleB       string   `json:"role_b"`
	Clusters    []string `json:"clusters"`
	Severity    Severity `json:"severity"`
	Description string   `json:"description"`
}

// SoDSummary aggregates SoD analysis metrics.
type SoDSummary struct {
	TotalRules       int            `json:"total_rules"`
	TotalPrincipals  int            `json:"total_principals"`
	TotalViolations  int            `json:"total_violations"`
	BySeverity       map[string]int `json:"by_severity"`
	ByConflictType   map[string]int `json:"by_conflict_type"`
	ComplianceScore  int            `json:"compliance_score"` // 0-100, higher = better
	CleanPrincipals  int            `json:"clean_principals"`
	ConflictedPrincipals int        `json:"conflicted_principals"`
}
