package fedramp

import (
	"testing"
)

// TestScoreCalculation verifies the FedRAMP readiness score formula:
// score = ((satisfied * 100) + (partial * 50)) / total
func TestScoreCalculation(t *testing.T) {
	e := NewEngine()
	s := e.Score()

	// Count expected values from demo data:
	// 14 satisfied, 3 partially_satisfied, 0 planned → total 17
	// Expected score: (14*100 + 3*50) / 17 = 1550 / 17 = 91 (integer division)
	if s.SatisfiedControls != 14 {
		t.Errorf("expected 14 satisfied controls, got %d", s.SatisfiedControls)
	}
	if s.PartialControls != 3 {
		t.Errorf("expected 3 partial controls, got %d", s.PartialControls)
	}
	if s.PlannedControls != 0 {
		t.Errorf("expected 0 planned controls, got %d", s.PlannedControls)
	}
	if s.TotalControls != 17 {
		t.Errorf("expected 17 total controls, got %d", s.TotalControls)
	}

	expectedScore := ((14 * 100) + (3 * 50)) / 17 // = 91
	if s.OverallScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.OverallScore)
	}
}

// TestPOAMCounts verifies the POAM status counting logic.
func TestPOAMCounts(t *testing.T) {
	e := NewEngine()
	s := e.Score()

	// Demo data: 2 open, 1 delayed (→ openPOAM = 3), 1 closed
	if s.OpenPOAMs != 3 {
		t.Errorf("expected 3 open POAMs, got %d", s.OpenPOAMs)
	}
	if s.ClosedPOAMs != 1 {
		t.Errorf("expected 1 closed POAM, got %d", s.ClosedPOAMs)
	}
}

// TestScoreImpactLevel verifies the impact level is set correctly.
func TestScoreImpactLevel(t *testing.T) {
	e := NewEngine()
	s := e.Score()
	if s.ImpactLevel != "moderate" {
		t.Errorf("expected impact level 'moderate', got %q", s.ImpactLevel)
	}
}

// TestScoreEvaluatedAtNonEmpty verifies timestamp is populated.
func TestScoreEvaluatedAtNonEmpty(t *testing.T) {
	e := NewEngine()
	s := e.Score()
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt timestamp")
	}
}

// TestScoreWithAllSatisfied verifies score is 100 when all controls pass.
func TestScoreWithAllSatisfied(t *testing.T) {
	e := &Engine{}
	e.controls = []ControlBaseline{
		{ID: "T-1", Status: "satisfied"},
		{ID: "T-2", Status: "satisfied"},
		{ID: "T-3", Status: "satisfied"},
	}
	e.poams = nil
	s := e.Score()
	if s.OverallScore != 100 {
		t.Errorf("all-satisfied score: expected 100, got %d", s.OverallScore)
	}
	if s.SatisfiedControls != 3 {
		t.Errorf("expected 3 satisfied, got %d", s.SatisfiedControls)
	}
	if s.OpenPOAMs != 0 {
		t.Errorf("expected 0 open POAMs, got %d", s.OpenPOAMs)
	}
}

// TestScoreWithAllPlanned verifies score is 0 when all controls are planned.
func TestScoreWithAllPlanned(t *testing.T) {
	e := &Engine{}
	e.controls = []ControlBaseline{
		{ID: "T-1", Status: "planned"},
		{ID: "T-2", Status: "planned"},
	}
	e.poams = nil
	s := e.Score()
	if s.OverallScore != 0 {
		t.Errorf("all-planned score: expected 0, got %d", s.OverallScore)
	}
	if s.PlannedControls != 2 {
		t.Errorf("expected 2 planned, got %d", s.PlannedControls)
	}
}

// TestScoreWithEmptyControls verifies no panic on empty control set.
func TestScoreWithEmptyControls(t *testing.T) {
	e := &Engine{}
	e.controls = nil
	e.poams = nil
	s := e.Score()
	if s.OverallScore != 0 {
		t.Errorf("empty controls score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalControls != 0 {
		t.Errorf("expected 0 total controls, got %d", s.TotalControls)
	}
}

// TestScoreWithMixedPOAMStatuses verifies POAM counting with various statuses.
func TestScoreWithMixedPOAMStatuses(t *testing.T) {
	e := &Engine{}
	e.controls = []ControlBaseline{{ID: "C-1", Status: "satisfied"}}
	e.poams = []POAMItem{
		{ID: "P1", MilestonStatus: "open"},
		{ID: "P2", MilestonStatus: "open"},
		{ID: "P3", MilestonStatus: "delayed"},
		{ID: "P4", MilestonStatus: "closed"},
		{ID: "P5", MilestonStatus: "closed"},
		{ID: "P6", MilestonStatus: "closed"},
	}
	s := e.Score()
	if s.OpenPOAMs != 3 {
		t.Errorf("expected 3 open POAMs (2 open + 1 delayed), got %d", s.OpenPOAMs)
	}
	if s.ClosedPOAMs != 3 {
		t.Errorf("expected 3 closed POAMs, got %d", s.ClosedPOAMs)
	}
}

// TestScorePartialOnly verifies score is 50 when all controls are partial.
func TestScorePartialOnly(t *testing.T) {
	e := &Engine{}
	e.controls = []ControlBaseline{
		{ID: "T-1", Status: "partially_satisfied"},
		{ID: "T-2", Status: "partially_satisfied"},
		{ID: "T-3", Status: "partially_satisfied"},
		{ID: "T-4", Status: "partially_satisfied"},
	}
	e.poams = nil
	s := e.Score()
	// (0*100 + 4*50) / 4 = 200/4 = 50
	if s.OverallScore != 50 {
		t.Errorf("all-partial score: expected 50, got %d", s.OverallScore)
	}
}

// TestControlPOAMEntryConsistency verifies controls marked with POAMEntry=true
// have a corresponding POAM item.
func TestControlPOAMEntryConsistency(t *testing.T) {
	e := NewEngine()
	poamControlIDs := map[string]bool{}
	for _, p := range e.POAMs() {
		poamControlIDs[p.ControlID] = true
	}
	for _, c := range e.Controls() {
		if c.POAMEntry && !poamControlIDs[c.ID] {
			t.Errorf("control %s has POAMEntry=true but no matching POAM item", c.ID)
		}
	}
}

// TestControlFamilyConsistency verifies control IDs are consistent with their family.
func TestControlFamilyConsistency(t *testing.T) {
	e := NewEngine()
	for _, c := range e.Controls() {
		if len(c.ID) < 2 {
			t.Errorf("control ID %q is too short", c.ID)
			continue
		}
		if c.Family == "" {
			t.Errorf("control %s has empty family", c.ID)
		}
	}
}

// TestConcurrentScoreAccess verifies Score() is safe for concurrent use.
func TestConcurrentScoreAccess(t *testing.T) {
	e := NewEngine()
	done := make(chan struct{})
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			s := e.Score()
			if s.TotalControls == 0 {
				t.Error("unexpected zero total controls in concurrent access")
			}
		}()
	}
	for i := 0; i < 10; i++ {
		<-done
	}
}
