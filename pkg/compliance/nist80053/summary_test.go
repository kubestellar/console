package nist80053

import (
	"testing"
)

func TestSummaryAllImplemented(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "implemented"},
				{ID: "AC-2", Status: "implemented"},
			}},
		},
	}
	s := e.Summary()
	if s.OverallScore != 100 {
		t.Errorf("all-implemented score: expected 100, got %d", s.OverallScore)
	}
	if s.ImplementedControls != 2 {
		t.Errorf("expected 2 implemented, got %d", s.ImplementedControls)
	}
	if s.TotalControls != 2 {
		t.Errorf("expected 2 total, got %d", s.TotalControls)
	}
}

func TestSummaryAllPlanned(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "planned"},
				{ID: "AC-2", Status: "planned"},
			}},
		},
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("all-planned score: expected 0, got %d", s.OverallScore)
	}
	if s.PlannedControls != 2 {
		t.Errorf("expected 2 planned, got %d", s.PlannedControls)
	}
}

func TestSummaryNAExclusion(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "implemented"},
				{ID: "AC-2", Status: "not_applicable"},
				{ID: "AC-3", Status: "not_applicable"},
			}},
		},
	}
	s := e.Summary()
	// Score = (1*100) / (3-2) = 100 (NA excluded from denominator)
	if s.OverallScore != 100 {
		t.Errorf("NA-exclusion score: expected 100, got %d", s.OverallScore)
	}
	if s.NotApplicable != 2 {
		t.Errorf("expected 2 NA, got %d", s.NotApplicable)
	}
	if s.TotalControls != 3 {
		t.Errorf("expected 3 total (including NA), got %d", s.TotalControls)
	}
}

func TestSummaryAllNA(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "not_applicable"},
				{ID: "AC-2", Status: "not_applicable"},
			}},
		},
	}
	s := e.Summary()
	// All NA → denominator is 0 → score should be 0 (no divide-by-zero)
	if s.OverallScore != 0 {
		t.Errorf("all-NA score: expected 0, got %d", s.OverallScore)
	}
	if s.NotApplicable != 2 {
		t.Errorf("expected 2 NA, got %d", s.NotApplicable)
	}
}

func TestSummaryMixed(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "implemented"},
				{ID: "AC-2", Status: "partial"},
				{ID: "AC-3", Status: "planned"},
			}},
			{ID: "AU", Controls: []Control{
				{ID: "AU-1", Status: "implemented"},
				{ID: "AU-2", Status: "not_applicable"},
			}},
		},
	}
	s := e.Summary()
	// Applicable controls: AC-1(impl), AC-2(partial), AC-3(planned), AU-1(impl) = 4
	// Score = (2*100 + 1*50) / 4 = 250/4 = 62
	if s.OverallScore != 62 {
		t.Errorf("mixed score: expected 62, got %d", s.OverallScore)
	}
	if s.ImplementedControls != 2 {
		t.Errorf("expected 2 implemented, got %d", s.ImplementedControls)
	}
	if s.PartialControls != 1 {
		t.Errorf("expected 1 partial, got %d", s.PartialControls)
	}
	if s.PlannedControls != 1 {
		t.Errorf("expected 1 planned, got %d", s.PlannedControls)
	}
	if s.NotApplicable != 1 {
		t.Errorf("expected 1 NA, got %d", s.NotApplicable)
	}
	if s.TotalControls != 5 {
		t.Errorf("expected 5 total, got %d", s.TotalControls)
	}
}

func TestSummaryEmpty(t *testing.T) {
	e := &Engine{}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("empty score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalControls != 0 {
		t.Errorf("expected 0 total, got %d", s.TotalControls)
	}
	if s.Baseline != "moderate" {
		t.Errorf("expected moderate baseline, got %s", s.Baseline)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt")
	}
}

func TestSummaryMultipleFamilies(t *testing.T) {
	e := &Engine{
		families: []ControlFamily{
			{ID: "AC", Controls: []Control{
				{ID: "AC-1", Status: "implemented"},
			}},
			{ID: "AU", Controls: []Control{
				{ID: "AU-1", Status: "implemented"},
			}},
			{ID: "SC", Controls: []Control{
				{ID: "SC-1", Status: "partial"},
			}},
		},
	}
	s := e.Summary()
	// (2*100 + 1*50) / 3 = 250/3 = 83
	if s.OverallScore != 83 {
		t.Errorf("multi-family score: expected 83, got %d", s.OverallScore)
	}
}
