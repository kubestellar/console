package signing

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil signing engine")
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.TotalImages <= 0 {
		t.Errorf("expected positive total images, got %d", s.TotalImages)
	}

	if s.EvaluatedAt.IsZero() {
		t.Error("expected non-zero evaluation time")
	}
}

func TestImages(t *testing.T) {
	e := NewEngine()
	images := e.Images()
	if images == nil {
		t.Fatal("expected non-nil images slice")
	}
}

func TestPolicies(t *testing.T) {
	e := NewEngine()
	policies := e.Policies()
	if policies == nil {
		t.Fatal("expected non-nil policies slice")
	}
}
