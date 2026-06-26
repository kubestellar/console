package slsa

import (
	"testing"
)

// TestSummaryExactDemoValues verifies the SLSA demo data is returned accurately.
func TestSummaryExactDemoValues(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedWorkloads = 28
	if s.TotalWorkloads != expectedWorkloads {
		t.Errorf("expected %d total workloads, got %d", expectedWorkloads, s.TotalWorkloads)
	}

	const expectedAttested = 24
	if s.AttestedWorkloads != expectedAttested {
		t.Errorf("expected %d attested workloads, got %d", expectedAttested, s.AttestedWorkloads)
	}

	const expectedVerified = 20
	if s.VerifiedWorkloads != expectedVerified {
		t.Errorf("expected %d verified workloads, got %d", expectedVerified, s.VerifiedWorkloads)
	}

	if s.FleetPosture != Level1 {
		t.Errorf("expected fleet posture Level1, got %d", s.FleetPosture)
	}
}

// TestSummaryLevelDistribution verifies level counts sum to total workloads.
func TestSummaryLevelDistribution(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	sum := 0
	for _, count := range s.LevelDistribution {
		sum += count
	}
	if sum != s.TotalWorkloads {
		t.Errorf("level distribution sum %d != total workloads %d", sum, s.TotalWorkloads)
	}
}

// TestSummaryLevelDistributionKeys verifies expected SLSA level keys are present.
func TestSummaryLevelDistributionKeys(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	expectedKeys := []string{"0", "1", "2", "3", "4"}
	for _, key := range expectedKeys {
		if _, ok := s.LevelDistribution[key]; !ok {
			t.Errorf("level distribution missing key %q", key)
		}
	}

	// Verify exact demo counts
	expected := map[string]int{"0": 2, "1": 6, "2": 10, "3": 8, "4": 2}
	for level, want := range expected {
		got := s.LevelDistribution[level]
		if got != want {
			t.Errorf("level %s: expected %d, got %d", level, want, got)
		}
	}
}

// TestSummaryAttestedGreaterOrEqualVerified verifies attested >= verified
// (you must attest before you can verify).
func TestSummaryAttestedGreaterOrEqualVerified(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.AttestedWorkloads < s.VerifiedWorkloads {
		t.Errorf("attested (%d) should be >= verified (%d)",
			s.AttestedWorkloads, s.VerifiedWorkloads)
	}
}

// TestSummaryEvaluatedAtNonZero verifies timestamp is populated.
func TestSummaryEvaluatedAtNonZero(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.EvaluatedAt.IsZero() {
		t.Error("expected non-zero EvaluatedAt")
	}
}

// TestWorkloadsReturnsEmptySlice verifies stub returns empty (not nil).
func TestWorkloadsReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	w := e.Workloads()
	if w == nil {
		t.Fatal("Workloads() returned nil, expected empty slice")
	}
	if len(w) != 0 {
		t.Errorf("expected 0 workloads from stub, got %d", len(w))
	}
}

// TestLevelConstants verifies SLSA level constants have expected integer values.
func TestLevelConstants(t *testing.T) {
	tests := []struct {
		name  string
		level Level
		want  int
	}{
		{"Level0", Level0, 0},
		{"Level1", Level1, 1},
		{"Level2", Level2, 2},
		{"Level3", Level3, 3},
		{"Level4", Level4, 4},
	}
	for _, tt := range tests {
		if int(tt.level) != tt.want {
			t.Errorf("%s: expected %d, got %d", tt.name, tt.want, int(tt.level))
		}
	}
}

// TestConcurrentSummaryAccess verifies Summary() is safe for concurrent use.
func TestConcurrentSummaryAccess(t *testing.T) {
	e := NewEngine()
	const goroutines = 10
	done := make(chan struct{})
	for i := 0; i < goroutines; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			s := e.Summary()
			if s.TotalWorkloads == 0 {
				t.Error("unexpected zero total workloads in concurrent access")
			}
		}()
	}
	for i := 0; i < goroutines; i++ {
		<-done
	}
}
