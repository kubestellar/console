package sod

import (
	"fmt"
	"sync"
)

// Engine evaluates SoD rules against principals to find conflicting assignments.
type Engine struct {
	mu         sync.RWMutex
	rules      []SoDRule
	principals []Principal
	violations []SoDViolation
}

// NewEngine creates an engine pre-loaded with demo rules, principals, and violations.
func NewEngine() *Engine {
	e := &Engine{
		rules:      builtinRules(),
		principals: demoPrincipals(),
	}
	e.violations = e.evaluate()
	return e
}

// Rules returns the configured SoD rules.
func (e *Engine) Rules() []SoDRule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]SoDRule, len(e.rules))
	copy(out, e.rules)
	return out
}

// Principals returns tracked principals with their role assignments.
func (e *Engine) Principals() []Principal {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Principal, len(e.principals))
	copy(out, e.principals)
	return out
}

// Violations returns detected SoD violations.
func (e *Engine) Violations() []SoDViolation {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]SoDViolation, len(e.violations))
	copy(out, e.violations)
	return out
}

// Summary returns aggregated SoD metrics.
func (e *Engine) Summary() SoDSummary {
	e.mu.RLock()
	defer e.mu.RUnlock()

	s := SoDSummary{
		TotalRules:      len(e.rules),
		TotalPrincipals: len(e.principals),
		TotalViolations: len(e.violations),
		BySeverity:      make(map[string]int),
		ByConflictType:  make(map[string]int),
	}

	// Build a rule-ID → conflict-type lookup so we can count violations by
	// conflict type (not rules, which would always count 1 per rule regardless
	// of how many actual violations were detected).
	ruleConflict := make(map[string]ConflictType, len(e.rules))
	for _, r := range e.rules {
		ruleConflict[r.ID] = r.Conflict
	}

	conflicted := map[string]bool{}
	for _, v := range e.violations {
		s.BySeverity[string(v.Severity)]++
		conflicted[v.Principal] = true
		if ct, ok := ruleConflict[v.RuleID]; ok {
			s.ByConflictType[string(ct)]++
		}
	}

	s.ConflictedPrincipals = len(conflicted)
	s.CleanPrincipals = s.TotalPrincipals - s.ConflictedPrincipals

	if s.TotalPrincipals > 0 {
		s.ComplianceScore = 100 - int(float64(s.ConflictedPrincipals)/float64(s.TotalPrincipals)*100)
		if s.ComplianceScore < 0 {
			s.ComplianceScore = 0
		}
	}

	return s
}

// evaluate checks all principals against all rules.
func (e *Engine) evaluate() []SoDViolation {
	var violations []SoDViolation
	vid := 0

	for _, p := range e.principals {
		roleSet := toSet(p.Roles)
		for _, rule := range e.rules {
			if roleSet[rule.RoleA] && roleSet[rule.RoleB] {
				vid++
				violations = append(violations, SoDViolation{
					ID:        fmt.Sprintf("sod-%03d", vid),
					RuleID:    rule.ID,
					Principal: p.Name,
					Type:      p.Type,
					RoleA:     rule.RoleA,
					RoleB:     rule.RoleB,
					Clusters:  p.Clusters,
					Severity:  rule.Severity,
					Description: fmt.Sprintf("%s has conflicting roles: %s + %s (%s)",
						p.Name, rule.RoleA, rule.RoleB, rule.Name),
				})
			}
		}
	}

	return violations
}

func toSet(ss []string) map[string]bool {
	m := make(map[string]bool, len(ss))
	for _, s := range ss {
		m[s] = true
	}
	return m
}

// ─── Built-in rules ───

func builtinRules() []SoDRule {
	return []SoDRule{
		{
			ID: "sod-deployer-approver", Name: "Deployer ≠ Approver",
			Description: "The person who deploys code must not be the same person who approves it",
			RoleA: "deployer", RoleB: "approver", Conflict: ConflictDeployerApprover,
			Severity: SeverityCritical, Regulation: "SOX ITGC / PCI-DSS 6.5",
		},
		{
			ID: "sod-admin-auditor", Name: "Admin ≠ Auditor",
			Description: "System administrators must not have audit/compliance review privileges",
			RoleA: "cluster-admin", RoleB: "auditor", Conflict: ConflictAdminAuditor,
			Severity: SeverityCritical, Regulation: "SOX Section 404",
		},
		{
			ID: "sod-dev-prod", Name: "Dev ≠ Prod Access",
			Description: "Developers should not have direct production access",
			RoleA: "developer", RoleB: "prod-operator", Conflict: ConflictDevProdAccess,
			Severity: SeverityHigh, Regulation: "PCI-DSS 7.1 / SOX",
		},
		{
			ID: "sod-secret-admin", Name: "Secret Manager ≠ Admin",
			Description: "Secret management and cluster admin roles create excessive privilege concentration",
			RoleA: "secret-manager", RoleB: "cluster-admin", Conflict: ConflictSecretAdmin,
			Severity: SeverityHigh, Regulation: "PCI-DSS 3.4",
		},
		{
			ID: "sod-network-rbac", Name: "Network Admin ≠ RBAC Admin",
			Description: "Network policy and RBAC management should be separate to prevent lateral movement",
			RoleA: "network-admin", RoleB: "rbac-admin", Conflict: ConflictNetworkRBAC,
			Severity: SeverityMedium, Regulation: "NIST 800-53 AC-5",
		},
	}
}

// ─── Demo principals ───

func demoPrincipals() []Principal {
	return []Principal{
		{Name: "alice@acme.com", Type: "user", Roles: []string{"developer", "deployer"}, Clusters: []string{"prod-us-east", "staging-us"}},
		{Name: "bob@acme.com", Type: "user", Roles: []string{"deployer", "approver"}, Clusters: []string{"prod-us-east", "prod-eu-west"}},
		{Name: "charlie@acme.com", Type: "user", Roles: []string{"cluster-admin", "auditor", "secret-manager"}, Clusters: []string{"prod-us-east", "prod-eu-west", "staging-us"}},
		{Name: "diana@acme.com", Type: "user", Roles: []string{"developer", "prod-operator"}, Clusters: []string{"prod-us-east", "staging-us"}},
		{Name: "eve@acme.com", Type: "user", Roles: []string{"auditor", "viewer"}, Clusters: []string{"prod-us-east", "prod-eu-west"}},
		{Name: "frank@acme.com", Type: "user", Roles: []string{"network-admin", "rbac-admin"}, Clusters: []string{"prod-us-east"}},
		{Name: "ci-pipeline", Type: "serviceaccount", Roles: []string{"deployer"}, Clusters: []string{"prod-us-east", "prod-eu-west", "staging-us"}},
		{Name: "ops-team", Type: "group", Roles: []string{"prod-operator", "viewer"}, Clusters: []string{"prod-us-east", "prod-eu-west"}},
		{Name: "security-team", Type: "group", Roles: []string{"auditor", "network-admin"}, Clusters: []string{"prod-us-east", "prod-eu-west", "pci-cardholder"}},
		{Name: "grace@acme.com", Type: "user", Roles: []string{"approver", "viewer"}, Clusters: []string{"prod-us-east"}},
	}
}
