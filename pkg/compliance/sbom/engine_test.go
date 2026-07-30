package sbom

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil SBOM engine")
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.TotalWorkloads <= 0 {
		t.Errorf("expected positive total workloads, got %d", s.TotalWorkloads)
	}

	if s.SBOMCoverage < 0 || s.SBOMCoverage > 100 {
		t.Errorf("invalid SBOM coverage: %d", s.SBOMCoverage)
	}

	if s.GeneratedAt.IsZero() {
		t.Error("expected non-zero generation time")
	}
}

func TestDocuments(t *testing.T) {
	e := NewEngine()
	docs := e.Documents()
	if docs == nil {
		t.Fatal("expected non-nil documents slice")
	}
}
