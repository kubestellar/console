package slsa

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil SLSA engine")
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.TotalWorkloads <= 0 {
		t.Errorf("expected positive total workloads, got %d", s.TotalWorkloads)
	}

	if len(s.LevelDistribution) == 0 {
		t.Error("expected non-empty level distribution")
	}

	if s.EvaluatedAt.IsZero() {
		t.Error("expected non-zero evaluation time")
	}
}

func TestWorkloads(t *testing.T) {
	e := NewEngine()
	w := e.Workloads()
	if w == nil {
		t.Fatal("expected non-nil workloads slice")
	}
}
