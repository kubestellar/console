package hipaa

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("NewEngine returned nil")
	}
}

func TestSafeguards(t *testing.T) {
	e := NewEngine()
	safeguards := e.Safeguards()
	if len(safeguards) != 5 {
		t.Fatalf("expected 5 safeguards, got %d", len(safeguards))
	}

	expectedIDs := []string{"164.312(a)", "164.312(b)", "164.312(c)", "164.312(d)", "164.312(e)"}
	for i, s := range safeguards {
		if s.ID != expectedIDs[i] {
			t.Errorf("safeguard %d: expected ID %s, got %s", i, expectedIDs[i], s.ID)
		}
		if len(s.Checks) == 0 {
			t.Errorf("safeguard %s has no checks", s.ID)
		}
	}
}

func TestSafeguardStatuses(t *testing.T) {
	e := NewEngine()
	statusCount := map[string]int{}
	for _, s := range e.Safeguards() {
		statusCount[s.Status]++
	}
	if statusCount["pass"] != 2 {
		t.Errorf("expected 2 passing safeguards, got %d", statusCount["pass"])
	}
	if statusCount["partial"] != 2 {
		t.Errorf("expected 2 partial safeguards, got %d", statusCount["partial"])
	}
	if statusCount["fail"] != 1 {
		t.Errorf("expected 1 failing safeguard, got %d", statusCount["fail"])
	}
}

func TestPHINamespaces(t *testing.T) {
	e := NewEngine()
	ns := e.PHINamespaces()
	if len(ns) != 4 {
		t.Fatalf("expected 4 PHI namespaces, got %d", len(ns))
	}
	compliant := 0
	for _, n := range ns {
		if n.Compliant {
			compliant++
		}
	}
	if compliant != 2 {
		t.Errorf("expected 2 compliant namespaces, got %d", compliant)
	}
}

func TestDataFlows(t *testing.T) {
	e := NewEngine()
	flows := e.DataFlows()
	if len(flows) != 6 {
		t.Fatalf("expected 6 data flows, got %d", len(flows))
	}
	encrypted := 0
	mtls := 0
	for _, f := range flows {
		if f.Encrypted {
			encrypted++
		}
		if f.MutualTLS {
			mtls++
		}
	}
	if encrypted != 5 {
		t.Errorf("expected 5 encrypted flows, got %d", encrypted)
	}
	if mtls != 3 {
		t.Errorf("expected 3 mTLS flows, got %d", mtls)
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.TotalSafeguards != 5 {
		t.Errorf("expected 5 total safeguards, got %d", s.TotalSafeguards)
	}
	if s.SafeguardsPassed != 2 {
		t.Errorf("expected 2 passed, got %d", s.SafeguardsPassed)
	}
	if s.SafeguardsFailed != 1 {
		t.Errorf("expected 1 failed, got %d", s.SafeguardsFailed)
	}
	if s.PHINamespaces != 4 {
		t.Errorf("expected 4 PHI namespaces, got %d", s.PHINamespaces)
	}
	if s.CompliantNS != 2 {
		t.Errorf("expected 2 compliant NS, got %d", s.CompliantNS)
	}
	if s.OverallScore != 60 {
		t.Errorf("expected score 60, got %d", s.OverallScore)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt")
	}
}

func TestCheckEvidence(t *testing.T) {
	e := NewEngine()
	for _, s := range e.Safeguards() {
		for _, c := range s.Checks {
			if c.Evidence == "" {
				t.Errorf("check %s in safeguard %s has empty evidence", c.ID, s.ID)
			}
			if c.Status == "fail" && c.Remediation == "" {
				t.Errorf("failing check %s has no remediation", c.ID)
			}
		}
	}
}
