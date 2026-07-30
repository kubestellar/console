package licenses

import (
	"testing"
)

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil licenses engine")
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.TotalPackages <= 0 {
		t.Errorf("expected positive total packages, got %d", s.TotalPackages)
	}

	if s.UniqueLicenses <= 0 {
		t.Errorf("expected positive unique licenses, got %d", s.UniqueLicenses)
	}

	if s.EvaluatedAt.IsZero() {
		t.Error("expected non-zero evaluation time")
	}
}

func TestPackages(t *testing.T) {
	e := NewEngine()
	pkgs := e.Packages()
	if pkgs == nil {
		t.Fatal("expected non-nil packages slice")
	}
}

func TestCategories(t *testing.T) {
	e := NewEngine()
	cats := e.Categories()
	if cats == nil {
		t.Fatal("expected non-nil categories slice")
	}
}
