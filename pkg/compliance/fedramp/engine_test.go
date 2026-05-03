package fedramp

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil engine")
	}
}

func TestControls(t *testing.T) {
	e := NewEngine()
	controls := e.Controls()
	const expectedControls = 17
	if len(controls) != expectedControls {
		t.Fatalf("expected %d controls, got %d", expectedControls, len(controls))
	}
	valid := map[string]bool{"satisfied": true, "partially_satisfied": true, "planned": true, "other": true}
	for _, c := range controls {
		if !valid[c.Status] {
			t.Errorf("control %s has invalid status %q", c.ID, c.Status)
		}
	}
}

func TestPOAMs(t *testing.T) {
	e := NewEngine()
	poams := e.POAMs()
	const expectedPOAMs = 4
	if len(poams) != expectedPOAMs {
		t.Fatalf("expected %d POAMs, got %d", expectedPOAMs, len(poams))
	}
	for _, p := range poams {
		if p.ControlID == "" {
			t.Errorf("POAM %s has empty control_id", p.ID)
		}
	}
}

func TestFedRAMPScore(t *testing.T) {
	e := NewEngine()
	s := e.Score()
	if s.TotalControls == 0 {
		t.Error("expected non-zero total controls")
	}
	if s.OverallScore < 0 || s.OverallScore > 100 {
		t.Errorf("score %d out of range", s.OverallScore)
	}
	if s.SatisfiedControls+s.PartialControls+s.PlannedControls != s.TotalControls {
		t.Error("control counts do not sum to total")
	}
	if s.AuthorizationStatus != "in_progress" {
		t.Errorf("expected in_progress status, got %s", s.AuthorizationStatus)
	}
}

func TestControlsImmutability(t *testing.T) {
	e := NewEngine()
	c1 := e.Controls()
	c1[0].Name = "MUTATED"
	c2 := e.Controls()
	if c2[0].Name == "MUTATED" {
		t.Error("Controls() returned a mutable reference")
	}
}
