package fedramp

import (
	"testing"
)

func TestScoreAllSatisfied(t *testing.T) {
	e := &Engine{
		controls: []ControlBaseline{
			{ID: "AC-1", Status: "satisfied"},
			{ID: "AC-2", Status: "satisfied"},
			{ID: "AC-3", Status: "satisfied"},
		},
		poams: nil,
	}
	s := e.Score()
	if s.OverallScore != 100 {
		t.Errorf("all-satisfied score: expected 100, got %d", s.OverallScore)
	}
	if s.SatisfiedControls != 3 {
		t.Errorf("expected 3 satisfied, got %d", s.SatisfiedControls)
	}
	if s.PartialControls != 0 {
		t.Errorf("expected 0 partial, got %d", s.PartialControls)
	}
	if s.OpenPOAMs != 0 {
		t.Errorf("expected 0 open POAMs, got %d", s.OpenPOAMs)
	}
}

func TestScoreAllPlanned(t *testing.T) {
	e := &Engine{
		controls: []ControlBaseline{
			{ID: "AC-1", Status: "planned"},
			{ID: "AC-2", Status: "planned"},
		},
		poams: nil,
	}
	s := e.Score()
	if s.OverallScore != 0 {
		t.Errorf("all-planned score: expected 0, got %d", s.OverallScore)
	}
	if s.PlannedControls != 2 {
		t.Errorf("expected 2 planned, got %d", s.PlannedControls)
	}
}

func TestScoreMixed(t *testing.T) {
	e := &Engine{
		controls: []ControlBaseline{
			{ID: "AC-1", Status: "satisfied"},
			{ID: "AC-2", Status: "partially_satisfied"},
			{ID: "AC-3", Status: "planned"},
			{ID: "AC-4", Status: "satisfied"},
		},
		poams: []POAMItem{
			{ID: "P1", ControlID: "AC-2", MilestonStatus: "open"},
			{ID: "P2", ControlID: "AC-3", MilestonStatus: "delayed"},
			{ID: "P3", ControlID: "AC-1", MilestonStatus: "closed"},
		},
	}
	s := e.Score()
	// (2*100 + 1*50) / 4 = 250/4 = 62
	if s.OverallScore != 62 {
		t.Errorf("mixed score: expected 62, got %d", s.OverallScore)
	}
	if s.TotalControls != 4 {
		t.Errorf("expected 4 total controls, got %d", s.TotalControls)
	}
	if s.OpenPOAMs != 2 {
		t.Errorf("expected 2 open POAMs (open+delayed), got %d", s.OpenPOAMs)
	}
	if s.ClosedPOAMs != 1 {
		t.Errorf("expected 1 closed POAM, got %d", s.ClosedPOAMs)
	}
}

func TestScoreEmptyControls(t *testing.T) {
	e := &Engine{
		controls: nil,
		poams:    nil,
	}
	s := e.Score()
	if s.OverallScore != 0 {
		t.Errorf("empty controls score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalControls != 0 {
		t.Errorf("expected 0 total controls, got %d", s.TotalControls)
	}
}

func TestScoreUnknownStatuses(t *testing.T) {
	e := &Engine{
		controls: []ControlBaseline{
			{ID: "AC-1", Status: "satisfied"},
			{ID: "AC-2", Status: "other"},
			{ID: "AC-3", Status: "unknown_value"},
		},
		poams: nil,
	}
	s := e.Score()
	// Only 1 satisfied out of 3 total: 100/3 = 33
	if s.OverallScore != 33 {
		t.Errorf("unknown status score: expected 33, got %d", s.OverallScore)
	}
	if s.SatisfiedControls != 1 {
		t.Errorf("expected 1 satisfied, got %d", s.SatisfiedControls)
	}
}

func TestScoreAuthorizationAndImpact(t *testing.T) {
	e := &Engine{
		controls: []ControlBaseline{{ID: "AC-1", Status: "satisfied"}},
	}
	s := e.Score()
	if s.AuthorizationStatus != "in_progress" {
		t.Errorf("expected authorization_status in_progress, got %s", s.AuthorizationStatus)
	}
	if s.ImpactLevel != "moderate" {
		t.Errorf("expected impact_level moderate, got %s", s.ImpactLevel)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt")
	}
}
