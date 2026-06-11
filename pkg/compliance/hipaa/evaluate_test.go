package hipaa

import (
	"testing"
)

// TestSummaryScoreCalculation verifies the HIPAA score formula:
// score = ((passed * 100) + (partial * 50)) / total
func TestSummaryScoreCalculation(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	// Demo data: 2 pass, 2 partial, 1 fail = 5 total
	// Score: (2*100 + 2*50) / 5 = 300/5 = 60
	expectedScore := ((2 * 100) + (2 * 50)) / 5
	if s.OverallScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.OverallScore)
	}
}

// TestSummaryDataFlowCounts verifies encrypted flow counting.
func TestSummaryDataFlowCounts(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.DataFlows != 6 {
		t.Errorf("expected 6 data flows, got %d", s.DataFlows)
	}
	// 5 out of 6 flows are encrypted (claims-export SFTP is not)
	if s.EncryptedFlows != 5 {
		t.Errorf("expected 5 encrypted flows, got %d", s.EncryptedFlows)
	}
}

// TestSummaryWithAllPassing verifies score is 100 when all safeguards pass.
func TestSummaryWithAllPassing(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "pass"},
			{ID: "s2", Status: "pass"},
			{ID: "s3", Status: "pass"},
		},
		phiNamespaces: []PHINamespace{
			{Name: "ns1", Compliant: true},
		},
		dataFlows: []DataFlow{
			{Source: "a", Destination: "b", Encrypted: true},
		},
	}
	s := e.Summary()
	if s.OverallScore != 100 {
		t.Errorf("all-pass score: expected 100, got %d", s.OverallScore)
	}
	if s.SafeguardsPassed != 3 {
		t.Errorf("expected 3 passed, got %d", s.SafeguardsPassed)
	}
	if s.SafeguardsFailed != 0 {
		t.Errorf("expected 0 failed, got %d", s.SafeguardsFailed)
	}
}

// TestSummaryWithAllFailing verifies score is 0 when all safeguards fail.
func TestSummaryWithAllFailing(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "fail"},
			{ID: "s2", Status: "fail"},
		},
		phiNamespaces: nil,
		dataFlows:     nil,
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("all-fail score: expected 0, got %d", s.OverallScore)
	}
	if s.SafeguardsFailed != 2 {
		t.Errorf("expected 2 failed, got %d", s.SafeguardsFailed)
	}
}

// TestSummaryWithEmptySafeguards verifies no panic on empty input.
func TestSummaryWithEmptySafeguards(t *testing.T) {
	e := &Engine{
		safeguards:    nil,
		phiNamespaces: nil,
		dataFlows:     nil,
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("empty safeguards score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalSafeguards != 0 {
		t.Errorf("expected 0 total safeguards, got %d", s.TotalSafeguards)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt even for empty input")
	}
}

// TestSummaryPartialOnly_FourSafeguards verifies score is 50 when all safeguards are partial.
func TestSummaryPartialOnly_FourSafeguards(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "partial"},
			{ID: "s2", Status: "partial"},
			{ID: "s3", Status: "partial"},
			{ID: "s4", Status: "partial"},
		},
		phiNamespaces: nil,
		dataFlows:     nil,
	}
	s := e.Summary()
	// (0*100 + 4*50) / 4 = 50
	if s.OverallScore != 50 {
		t.Errorf("all-partial score: expected 50, got %d", s.OverallScore)
	}
}

// TestPHINamespaceComplianceCount verifies compliant namespace counting.
func TestPHINamespaceComplianceCount(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{{ID: "s1", Status: "pass"}},
		phiNamespaces: []PHINamespace{
			{Name: "ns1", Compliant: true},
			{Name: "ns2", Compliant: false},
			{Name: "ns3", Compliant: true},
			{Name: "ns4", Compliant: true},
			{Name: "ns5", Compliant: false},
		},
		dataFlows: nil,
	}
	s := e.Summary()
	if s.PHINamespaces != 5 {
		t.Errorf("expected 5 PHI namespaces, got %d", s.PHINamespaces)
	}
	if s.CompliantNS != 3 {
		t.Errorf("expected 3 compliant namespaces, got %d", s.CompliantNS)
	}
}

// TestDataFlowEncryptionCount verifies encrypted flow counting.
func TestDataFlowEncryptionCount(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{{ID: "s1", Status: "pass"}},
		phiNamespaces: nil,
		dataFlows: []DataFlow{
			{Source: "a", Destination: "b", Encrypted: true},
			{Source: "c", Destination: "d", Encrypted: false},
			{Source: "e", Destination: "f", Encrypted: true},
		},
	}
	s := e.Summary()
	if s.DataFlows != 3 {
		t.Errorf("expected 3 data flows, got %d", s.DataFlows)
	}
	if s.EncryptedFlows != 2 {
		t.Errorf("expected 2 encrypted flows, got %d", s.EncryptedFlows)
	}
}

// TestFailingChecksMustHaveRemediation verifies that checks with "fail" status
// provide actionable remediation guidance.
func TestFailingChecksMustHaveRemediation(t *testing.T) {
	e := NewEngine()
	for _, sg := range e.Safeguards() {
		for _, c := range sg.Checks {
			if c.Status == "fail" && c.Remediation == "" {
				t.Errorf("failing check %s (safeguard %s) has no remediation", c.ID, sg.ID)
			}
		}
	}
}

// TestSafeguardStatusDerivedFromChecks verifies that safeguard status
// is consistent with the underlying check statuses.
func TestSafeguardStatusDerivedFromChecks(t *testing.T) {
	e := NewEngine()
	for _, sg := range e.Safeguards() {
		hasFail := false
		hasPartial := false
		allPass := true
		for _, c := range sg.Checks {
			switch c.Status {
			case "fail":
				hasFail = true
				allPass = false
			case "partial":
				hasPartial = true
				allPass = false
			case "pass":
				// ok
			default:
				allPass = false
			}
		}

		switch {
		case sg.Status == "pass" && !allPass:
			t.Errorf("safeguard %s is 'pass' but not all checks pass", sg.ID)
		case sg.Status == "fail" && !hasFail:
			t.Errorf("safeguard %s is 'fail' but no check has 'fail' status", sg.ID)
		case sg.Status == "partial" && !hasPartial && !hasFail:
			t.Errorf("safeguard %s is 'partial' but no check is partial or failing", sg.ID)
		}
	}
}

// TestNonCompliantNamespaceProperties verifies that non-compliant namespaces
// have at least one failing property.
func TestNonCompliantNamespaceProperties(t *testing.T) {
	e := NewEngine()
	for _, ns := range e.PHINamespaces() {
		if ns.Compliant {
			// Compliant namespaces should have all protections enabled
			if !ns.Encrypted || !ns.AuditEnabled || !ns.RBACRestricted {
				t.Errorf("compliant namespace %s has a protection disabled", ns.Name)
			}
		} else {
			// Non-compliant namespaces should have at least one gap
			if ns.Encrypted && ns.AuditEnabled && ns.RBACRestricted {
				t.Errorf("non-compliant namespace %s has all protections enabled", ns.Name)
			}
		}
	}
}
