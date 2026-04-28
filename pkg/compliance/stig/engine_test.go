package stig

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil engine")
	}
}

func TestBenchmarks(t *testing.T) {
	e := NewEngine()
	benchmarks := e.Benchmarks()
	if len(benchmarks) == 0 {
		t.Fatal("expected at least one benchmark")
	}
	b := benchmarks[0]
	if b.ID == "" || b.Title == "" || b.Version == "" {
		t.Error("benchmark missing required fields")
	}
}

func TestFindings(t *testing.T) {
	e := NewEngine()
	findings := e.Findings()
	const expectedFindings = 12
	if len(findings) != expectedFindings {
		t.Fatalf("expected %d findings, got %d", expectedFindings, len(findings))
	}
	valid := map[string]bool{"open": true, "not_a_finding": true, "not_applicable": true, "not_reviewed": true}
	for _, f := range findings {
		if !valid[f.Status] {
			t.Errorf("finding %s has invalid status %q", f.ID, f.Status)
		}
	}
}

func TestSTIGSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalFindings == 0 {
		t.Error("expected non-zero findings")
	}
	if s.ComplianceScore < 0 || s.ComplianceScore > 100 {
		t.Errorf("score %d out of range", s.ComplianceScore)
	}
	if s.Open+s.NotAFinding+s.NotApplicable+s.NotReviewed != s.TotalFindings {
		t.Error("finding counts do not sum to total")
	}
	if s.CatIOpen+s.CatIIOpen+s.CatIIIOpen != s.Open {
		t.Error("category open counts do not sum to total open")
	}
}

func TestBenchmarksImmutability(t *testing.T) {
	e := NewEngine()
	b1 := e.Benchmarks()
	b1[0].Title = "MUTATED"
	b2 := e.Benchmarks()
	if b2[0].Title == "MUTATED" {
		t.Error("Benchmarks() returned a mutable reference")
	}
}
