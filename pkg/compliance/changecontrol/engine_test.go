package changecontrol

import (
	"testing"
	"time"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if len(e.policies) == 0 {
		t.Fatal("expected builtin policies")
	}
	if len(e.changes) == 0 {
		t.Fatal("expected demo changes")
	}
	if len(e.violations) == 0 {
		t.Fatal("expected policy violations from demo data")
	}
}

func TestPolicies(t *testing.T) {
	e := NewEngine()
	policies := e.Policies()
	if len(policies) != 5 {
		t.Fatalf("expected 5 policies, got %d", len(policies))
	}
	ids := map[string]bool{}
	for _, p := range policies {
		ids[p.ID] = true
	}
	for _, want := range []string{"sox-prod-approval", "pci-change-window", "prod-secret-block", "rbac-dual-control", "staging-approval"} {
		if !ids[want] {
			t.Errorf("missing policy %s", want)
		}
	}
}

func TestChangesNewestFirst(t *testing.T) {
	e := NewEngine()
	changes := e.Changes()
	for i := 1; i < len(changes); i++ {
		if changes[i].Timestamp.After(changes[i-1].Timestamp) {
			t.Errorf("changes not sorted newest first at index %d", i)
		}
	}
}

func TestViolationsDetected(t *testing.T) {
	e := NewEngine()
	violations := e.Violations()
	found := false
	for _, v := range violations {
		if v.ChangeID == "chg-002" && v.Policy == "sox-prod-approval" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected violation for unapproved prod change chg-002")
	}
	found = false
	for _, v := range violations {
		if v.ChangeID == "chg-003" && v.Policy == "prod-secret-block" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected violation for secret change chg-003")
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalChanges != 8 {
		t.Errorf("expected 8 total changes, got %d", s.TotalChanges)
	}
	if s.UnapprovedChanges < 2 {
		t.Errorf("expected at least 2 unapproved changes, got %d", s.UnapprovedChanges)
	}
	if s.PolicyViolations == 0 {
		t.Error("expected policy violations")
	}
	if s.RiskScore == 0 {
		t.Error("expected non-zero risk score")
	}
}

func TestIsProdCluster(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"prod-us-east", true}, {"production-eu", true}, {"pci-cardholder", true},
		{"staging-us", false}, {"dev-local", false},
	}
	for _, tc := range tests {
		if got := isProdCluster(tc.name); got != tc.want {
			t.Errorf("isProdCluster(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestInWindow(t *testing.T) {
	wed10 := time.Date(2026, 4, 22, 10, 0, 0, 0, time.UTC)
	windows := []Window{{DayOfWeek: "weekday", StartHour: 6, EndHour: 22}}
	if !inWindow(wed10, windows) {
		t.Error("expected Wednesday 10:00 UTC to be in weekday 6-22 window")
	}
	sat10 := time.Date(2026, 4, 25, 10, 0, 0, 0, time.UTC)
	if inWindow(sat10, windows) {
		t.Error("expected Saturday to be outside weekday window")
	}
	wed3 := time.Date(2026, 4, 22, 3, 0, 0, 0, time.UTC)
	if inWindow(wed3, windows) {
		t.Error("expected 03:00 UTC to be outside 6-22 window")
	}
}
