package sbom

import (
	"testing"
)

// TestSummaryExactDemoValues verifies the SBOM demo data is returned accurately.
func TestSummaryExactDemoValues(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedWorkloads = 42
	if s.TotalWorkloads != expectedWorkloads {
		t.Errorf("expected %d total workloads, got %d", expectedWorkloads, s.TotalWorkloads)
	}

	const expectedCoverage = 88
	if s.SBOMCoverage != expectedCoverage {
		t.Errorf("expected %d%% SBOM coverage, got %d%%", expectedCoverage, s.SBOMCoverage)
	}

	const expectedComponents = 3847
	if s.TotalComponents != expectedComponents {
		t.Errorf("expected %d total components, got %d", expectedComponents, s.TotalComponents)
	}

	const expectedVulnerable = 12
	if s.VulnerableComponents != expectedVulnerable {
		t.Errorf("expected %d vulnerable components, got %d", expectedVulnerable, s.VulnerableComponents)
	}

	const expectedCritical = 2
	if s.CriticalCount != expectedCritical {
		t.Errorf("expected %d critical, got %d", expectedCritical, s.CriticalCount)
	}

	const expectedHigh = 5
	if s.HighCount != expectedHigh {
		t.Errorf("expected %d high, got %d", expectedHigh, s.HighCount)
	}
}

// TestSummaryVulnerableConsistency verifies critical + high <= vulnerable.
func TestSummaryVulnerableConsistency(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	criticalPlusHigh := s.CriticalCount + s.HighCount
	if criticalPlusHigh > s.VulnerableComponents {
		t.Errorf("critical (%d) + high (%d) = %d exceeds vulnerable (%d)",
			s.CriticalCount, s.HighCount, criticalPlusHigh, s.VulnerableComponents)
	}
}

// TestSummaryCoverageRange verifies coverage is a valid percentage.
func TestSummaryCoverageRange(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.SBOMCoverage < 0 || s.SBOMCoverage > 100 {
		t.Errorf("SBOM coverage %d out of valid range [0, 100]", s.SBOMCoverage)
	}
}

// TestSummaryEvaluatedAtNonZero verifies timestamp is populated.
func TestSummaryEvaluatedAtNonZero(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.GeneratedAt.IsZero() {
		t.Error("expected non-zero GeneratedAt")
	}
}

// TestDocumentsReturnsEmptySlice verifies stub returns empty (not nil).
func TestDocumentsReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	docs := e.Documents()
	if docs == nil {
		t.Fatal("Documents() returned nil, expected empty slice")
	}
	if len(docs) != 0 {
		t.Errorf("expected 0 documents from stub, got %d", len(docs))
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
