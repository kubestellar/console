package nist80053

import (
	"testing"
)

// TestSummaryCalculation verifies the NIST 800-53 score formula:
// score = ((implemented * 100) + (partial * 50)) / (total - not_applicable)
func TestSummaryCalculation(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	// Demo data: 5 families with controls:
	// AC: 3 implemented + 1 partial = 4
	// AU: 3 implemented + 1 partial = 4
	// SC: 3 implemented + 1 partial = 4
	// CM: 3 implemented + 1 partial = 4
	// IR: 2 implemented + 0 partial + 1 planned = 3
	// Totals: implemented=14, partial=4, planned=1, na=0, total=19
	if s.ImplementedControls != 14 {
		t.Errorf("expected 14 implemented controls, got %d", s.ImplementedControls)
	}
	if s.PartialControls != 4 {
		t.Errorf("expected 4 partial controls, got %d", s.PartialControls)
	}
	if s.PlannedControls != 1 {
		t.Errorf("expected 1 planned control, got %d", s.PlannedControls)
	}
	if s.NotApplicable != 0 {
		t.Errorf("expected 0 not_applicable controls, got %d", s.NotApplicable)
	}
	if s.TotalControls != 19 {
		t.Errorf("expected 19 total controls, got %d", s.TotalControls)
	}

	// score = (14*100 + 4*50) / (19 - 0) = 1600 / 19 = 84 (integer division)
	expectedScore := ((14 * 100) + (4 * 50)) / 19
	if s.OverallScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.OverallScore)
	}
}

// TestSummaryWithAllImplemented verifies score is 100 when all controls pass.
func TestSummaryWithAllImplemented(t *testing.T) {
	e := &Engine{}
	e.families = []ControlFamily{
		{
			ID: "TEST", Name: "Test Family",
			Controls: []Control{
				{ID: "T-1", Status: "implemented"},
				{ID: "T-2", Status: "implemented"},
				{ID: "T-3", Status: "implemented"},
			},
		},
	}
	e.mappings = nil
	s := e.Summary()
	if s.OverallScore != 100 {
		t.Errorf("all-implemented score: expected 100, got %d", s.OverallScore)
	}
	if s.ImplementedControls != 3 {
		t.Errorf("expected 3 implemented, got %d", s.ImplementedControls)
	}
}

// TestSummaryWithAllPlanned verifies score is 0 when all controls are planned.
func TestSummaryWithAllPlanned(t *testing.T) {
	e := &Engine{}
	e.families = []ControlFamily{
		{
			ID: "TEST", Name: "Test Family",
			Controls: []Control{
				{ID: "T-1", Status: "planned"},
				{ID: "T-2", Status: "planned"},
			},
		},
	}
	e.mappings = nil
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("all-planned score: expected 0, got %d", s.OverallScore)
	}
}

// TestSummaryWithNotApplicableExcluded verifies N/A controls are excluded from score.
func TestSummaryWithNotApplicableExcluded(t *testing.T) {
	e := &Engine{}
	e.families = []ControlFamily{
		{
			ID: "TEST", Name: "Test Family",
			Controls: []Control{
				{ID: "T-1", Status: "implemented"},
				{ID: "T-2", Status: "implemented"},
				{ID: "T-3", Status: "not_applicable"},
				{ID: "T-4", Status: "not_applicable"},
			},
		},
	}
	e.mappings = nil
	s := e.Summary()
	// score = (2*100 + 0*50) / (4 - 2) = 200 / 2 = 100
	if s.OverallScore != 100 {
		t.Errorf("score with N/A excluded: expected 100, got %d", s.OverallScore)
	}
	if s.TotalControls != 4 {
		t.Errorf("expected 4 total (including N/A), got %d", s.TotalControls)
	}
	if s.NotApplicable != 2 {
		t.Errorf("expected 2 N/A, got %d", s.NotApplicable)
	}
}

// TestSummaryWithEmptyFamilies verifies no panic on empty input.
func TestSummaryWithEmptyFamilies(t *testing.T) {
	e := &Engine{}
	e.families = nil
	e.mappings = nil
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("empty families score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalControls != 0 {
		t.Errorf("expected 0 total controls, got %d", s.TotalControls)
	}
}

// TestSummaryWithAllNA verifies score is 0 when all controls are N/A
// (avoids division by zero).
func TestSummaryWithAllNA(t *testing.T) {
	e := &Engine{}
	e.families = []ControlFamily{
		{
			ID: "TEST", Name: "Test Family",
			Controls: []Control{
				{ID: "T-1", Status: "not_applicable"},
				{ID: "T-2", Status: "not_applicable"},
			},
		},
	}
	e.mappings = nil
	s := e.Summary()
	// total - na = 0, should not panic, score should be 0
	if s.OverallScore != 0 {
		t.Errorf("all-N/A score: expected 0, got %d", s.OverallScore)
	}
}

// TestSummaryPartialOnly verifies score is 50 when all applicable controls are partial.
func TestSummaryPartialOnly(t *testing.T) {
	e := &Engine{}
	e.families = []ControlFamily{
		{
			ID: "TEST", Name: "Test Family",
			Controls: []Control{
				{ID: "T-1", Status: "partial"},
				{ID: "T-2", Status: "partial"},
				{ID: "T-3", Status: "partial"},
				{ID: "T-4", Status: "partial"},
			},
		},
	}
	e.mappings = nil
	s := e.Summary()
	// (0*100 + 4*50) / 4 = 50
	if s.OverallScore != 50 {
		t.Errorf("all-partial score: expected 50, got %d", s.OverallScore)
	}
}

// TestSummaryBaseline verifies the baseline field.
func TestSummaryBaseline(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.Baseline != "moderate" {
		t.Errorf("expected baseline 'moderate', got %q", s.Baseline)
	}
}

// TestSummaryEvaluatedAt verifies timestamp is populated.
func TestSummaryEvaluatedAt(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt timestamp")
	}
}

// TestMappingControlIDsExist verifies all mappings reference existing controls.
func TestMappingControlIDsExist(t *testing.T) {
	e := NewEngine()
	controlIDs := map[string]bool{}
	for _, f := range e.Families() {
		for _, c := range f.Controls {
			controlIDs[c.ID] = true
		}
	}
	for _, m := range e.Mappings() {
		if !controlIDs[m.ControlID] {
			t.Errorf("mapping references non-existent control %s", m.ControlID)
		}
	}
}

// TestMappingsHaveLastAssessed verifies all mappings have assessment timestamps.
func TestMappingsHaveLastAssessed(t *testing.T) {
	e := NewEngine()
	for _, m := range e.Mappings() {
		if m.LastAssessed == "" {
			t.Errorf("mapping for %s has empty LastAssessed", m.ControlID)
		}
	}
}

// TestFamilyPassRateConsistency checks PassRate is reasonable for each family.
func TestFamilyPassRateConsistency(t *testing.T) {
	e := NewEngine()
	for _, f := range e.Families() {
		if f.PassRate < 0 || f.PassRate > 100 {
			t.Errorf("family %s has invalid PassRate %d", f.ID, f.PassRate)
		}
	}
}

// TestControlRemediationForNonImplemented verifies non-implemented controls
// provide remediation guidance.
func TestControlRemediationForNonImplemented(t *testing.T) {
	e := NewEngine()
	for _, f := range e.Families() {
		for _, c := range f.Controls {
			if c.Status == "partial" && c.Remediation == "" {
				t.Errorf("partial control %s has no remediation guidance", c.ID)
			}
			if c.Status == "planned" && c.Remediation == "" {
				t.Errorf("planned control %s has no remediation guidance", c.ID)
			}
		}
	}
}

// TestConcurrentSummaryAccess verifies Summary() is safe for concurrent use.
func TestConcurrentSummaryAccess(t *testing.T) {
	e := NewEngine()
	done := make(chan struct{})
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			s := e.Summary()
			if s.TotalControls == 0 {
				t.Error("unexpected zero total controls in concurrent access")
			}
		}()
	}
	for i := 0; i < 10; i++ {
		<-done
	}
}
