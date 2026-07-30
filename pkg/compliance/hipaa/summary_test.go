package hipaa

import (
	"testing"
)

func TestSummaryAllPass(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "pass"},
			{ID: "s2", Status: "pass"},
			{ID: "s3", Status: "pass"},
		},
		phiNamespaces: []PHINamespace{
			{Name: "ns1", Compliant: true},
			{Name: "ns2", Compliant: true},
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
	if s.CompliantNS != 2 {
		t.Errorf("expected 2 compliant, got %d", s.CompliantNS)
	}
	if s.EncryptedFlows != 1 {
		t.Errorf("expected 1 encrypted flow, got %d", s.EncryptedFlows)
	}
}

func TestSummaryAllFail(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "fail"},
			{ID: "s2", Status: "fail"},
		},
		phiNamespaces: []PHINamespace{
			{Name: "ns1", Compliant: false},
		},
		dataFlows: []DataFlow{
			{Source: "a", Destination: "b", Encrypted: false},
		},
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("all-fail score: expected 0, got %d", s.OverallScore)
	}
	if s.SafeguardsFailed != 2 {
		t.Errorf("expected 2 failed, got %d", s.SafeguardsFailed)
	}
	if s.CompliantNS != 0 {
		t.Errorf("expected 0 compliant, got %d", s.CompliantNS)
	}
	if s.EncryptedFlows != 0 {
		t.Errorf("expected 0 encrypted flows, got %d", s.EncryptedFlows)
	}
}

func TestSummaryMixed(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "pass"},
			{ID: "s2", Status: "partial"},
			{ID: "s3", Status: "fail"},
			{ID: "s4", Status: "pass"},
		},
		phiNamespaces: []PHINamespace{
			{Name: "ns1", Compliant: true},
			{Name: "ns2", Compliant: false},
			{Name: "ns3", Compliant: true},
		},
		dataFlows: []DataFlow{
			{Source: "a", Destination: "b", Encrypted: true},
			{Source: "c", Destination: "d", Encrypted: false},
			{Source: "e", Destination: "f", Encrypted: true},
		},
	}
	s := e.Summary()
	// (2*100 + 1*50) / 4 = 250/4 = 62
	if s.OverallScore != 62 {
		t.Errorf("mixed score: expected 62, got %d", s.OverallScore)
	}
	if s.TotalSafeguards != 4 {
		t.Errorf("expected 4 total, got %d", s.TotalSafeguards)
	}
	if s.PHINamespaces != 3 {
		t.Errorf("expected 3 PHI namespaces, got %d", s.PHINamespaces)
	}
	if s.CompliantNS != 2 {
		t.Errorf("expected 2 compliant, got %d", s.CompliantNS)
	}
	if s.DataFlows != 3 {
		t.Errorf("expected 3 data flows, got %d", s.DataFlows)
	}
	if s.EncryptedFlows != 2 {
		t.Errorf("expected 2 encrypted, got %d", s.EncryptedFlows)
	}
}

func TestSummaryEmpty(t *testing.T) {
	e := &Engine{}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("empty score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalSafeguards != 0 {
		t.Errorf("expected 0 total, got %d", s.TotalSafeguards)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt")
	}
}

func TestSummaryPartialOnly(t *testing.T) {
	e := &Engine{
		safeguards: []Safeguard{
			{ID: "s1", Status: "partial"},
			{ID: "s2", Status: "partial"},
		},
	}
	s := e.Summary()
	// (0*100 + 2*50) / 2 = 50
	if s.OverallScore != 50 {
		t.Errorf("partial-only score: expected 50, got %d", s.OverallScore)
	}
	if s.SafeguardsPartial != 2 {
		t.Errorf("expected 2 partial, got %d", s.SafeguardsPartial)
	}
}
