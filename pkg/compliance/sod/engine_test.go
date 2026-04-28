package sod

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if len(e.rules) == 0 {
		t.Fatal("expected builtin rules")
	}
	if len(e.principals) == 0 {
		t.Fatal("expected demo principals")
	}
	if len(e.violations) == 0 {
		t.Fatal("expected violations from demo data")
	}
}

func TestRules(t *testing.T) {
	e := NewEngine()
	rules := e.Rules()
	if len(rules) != 5 {
		t.Fatalf("expected 5 rules, got %d", len(rules))
	}
}

func TestDeployerApproverConflict(t *testing.T) {
	e := NewEngine()
	// bob has both deployer and approver roles
	found := false
	for _, v := range e.Violations() {
		if v.Principal == "bob@acme.com" && v.RuleID == "sod-deployer-approver" {
			found = true
			if v.Severity != SeverityCritical {
				t.Errorf("expected critical severity, got %s", v.Severity)
			}
			break
		}
	}
	if !found {
		t.Error("expected deployer-approver violation for bob@acme.com")
	}
}

func TestAdminAuditorConflict(t *testing.T) {
	e := NewEngine()
	// charlie has both cluster-admin and auditor
	found := false
	for _, v := range e.Violations() {
		if v.Principal == "charlie@acme.com" && v.RuleID == "sod-admin-auditor" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected admin-auditor violation for charlie@acme.com")
	}
}

func TestDevProdConflict(t *testing.T) {
	e := NewEngine()
	// diana has both developer and prod-operator
	found := false
	for _, v := range e.Violations() {
		if v.Principal == "diana@acme.com" && v.RuleID == "sod-dev-prod" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected dev-prod violation for diana@acme.com")
	}
}

func TestCleanPrincipal(t *testing.T) {
	e := NewEngine()
	// eve has auditor+viewer — no conflicts
	for _, v := range e.Violations() {
		if v.Principal == "eve@acme.com" {
			t.Errorf("unexpected violation for clean principal eve: %s", v.Description)
		}
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalRules != 5 {
		t.Errorf("expected 5 rules, got %d", s.TotalRules)
	}
	if s.TotalPrincipals != 10 {
		t.Errorf("expected 10 principals, got %d", s.TotalPrincipals)
	}
	if s.TotalViolations == 0 {
		t.Error("expected violations")
	}
	if s.ComplianceScore == 0 || s.ComplianceScore == 100 {
		t.Errorf("expected compliance score between 0-100 exclusive, got %d", s.ComplianceScore)
	}
	if s.CleanPrincipals+s.ConflictedPrincipals != s.TotalPrincipals {
		t.Error("clean + conflicted should equal total principals")
	}
}

func TestToSet(t *testing.T) {
	s := toSet([]string{"a", "b", "c", "a"})
	if len(s) != 3 {
		t.Errorf("expected 3 unique, got %d", len(s))
	}
	if !s["a"] || !s["b"] || !s["c"] {
		t.Error("missing expected values")
	}
}
