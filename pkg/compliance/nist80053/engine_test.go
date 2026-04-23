package nist80053

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil engine")
	}
}

func TestFamilies(t *testing.T) {
	e := NewEngine()
	families := e.Families()
	const expectedFamilies = 5
	if len(families) != expectedFamilies {
		t.Fatalf("expected %d families, got %d", expectedFamilies, len(families))
	}
	ids := map[string]bool{}
	for _, f := range families {
		ids[f.ID] = true
		if f.Name == "" {
			t.Errorf("family %s has empty name", f.ID)
		}
		if len(f.Controls) == 0 {
			t.Errorf("family %s has no controls", f.ID)
		}
	}
	for _, want := range []string{"AC", "AU", "SC", "CM", "IR"} {
		if !ids[want] {
			t.Errorf("missing family %s", want)
		}
	}
}

func TestControlStatuses(t *testing.T) {
	e := NewEngine()
	valid := map[string]bool{"implemented": true, "partial": true, "planned": true, "not_applicable": true}
	for _, f := range e.Families() {
		for _, c := range f.Controls {
			if !valid[c.Status] {
				t.Errorf("control %s has invalid status %q", c.ID, c.Status)
			}
			if c.Priority == "" {
				t.Errorf("control %s has empty priority", c.ID)
			}
		}
	}
}

func TestMappings(t *testing.T) {
	e := NewEngine()
	mappings := e.Mappings()
	const expectedMappings = 7
	if len(mappings) != expectedMappings {
		t.Fatalf("expected %d mappings, got %d", expectedMappings, len(mappings))
	}
	for _, m := range mappings {
		if m.ControlID == "" {
			t.Error("mapping has empty control_id")
		}
		if len(m.Resources) == 0 {
			t.Errorf("mapping %s has no resources", m.ControlID)
		}
	}
}

func TestSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalControls == 0 {
		t.Error("expected non-zero total controls")
	}
	if s.OverallScore < 0 || s.OverallScore > 100 {
		t.Errorf("score %d out of range", s.OverallScore)
	}
	if s.Baseline != "moderate" {
		t.Errorf("expected moderate baseline, got %s", s.Baseline)
	}
	if s.ImplementedControls+s.PartialControls+s.PlannedControls+s.NotApplicable != s.TotalControls {
		t.Error("control counts do not sum to total")
	}
	if s.EvaluatedAt == "" {
		t.Error("evaluated_at is empty")
	}
}

func TestFamiliesImmutability(t *testing.T) {
	e := NewEngine()
	f1 := e.Families()
	f1[0].Name = "MUTATED"
	f2 := e.Families()
	if f2[0].Name == "MUTATED" {
		t.Error("Families() returned a mutable reference")
	}
}
