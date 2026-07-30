package stig

import (
	"sync"
	"testing"
)

// TestSummaryCalculation verifies the STIG compliance score formula:
// score = (not_a_finding * 100) / (total - not_applicable)
func TestSummaryCalculation(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	// Demo data: 12 findings total
	// Status: 8 not_a_finding, 3 open, 0 not_applicable, 0 not_reviewed (verify)
	findings := e.Findings()
	var open, naf, na, nr int
	for _, f := range findings {
		switch f.Status {
		case "open":
			open++
		case "not_a_finding":
			naf++
		case "not_applicable":
			na++
		case "not_reviewed":
			nr++
		}
	}

	if s.TotalFindings != len(findings) {
		t.Errorf("expected %d total findings, got %d", len(findings), s.TotalFindings)
	}
	if s.Open != open {
		t.Errorf("expected %d open, got %d", open, s.Open)
	}
	if s.NotAFinding != naf {
		t.Errorf("expected %d not_a_finding, got %d", naf, s.NotAFinding)
	}
	if s.NotApplicable != na {
		t.Errorf("expected %d not_applicable, got %d", na, s.NotApplicable)
	}
	if s.NotReviewed != nr {
		t.Errorf("expected %d not_reviewed, got %d", nr, s.NotReviewed)
	}

	// Verify score formula
	expectedScore := 0
	if s.TotalFindings-na > 0 {
		expectedScore = (naf * 100) / (s.TotalFindings - na)
	}
	if s.ComplianceScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.ComplianceScore)
	}
}

// TestSummaryAllCompliant verifies score=100 when all findings are not_a_finding.
func TestSummaryAllCompliant(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "test-stig", Title: "Test STIG", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "not_a_finding"},
				{ID: "V-002", Severity: "CAT II", Status: "not_a_finding"},
				{ID: "V-003", Severity: "CAT III", Status: "not_a_finding"},
			},
		},
	}
	s := e.Summary()
	if s.ComplianceScore != 100 {
		t.Errorf("all-compliant score: expected 100, got %d", s.ComplianceScore)
	}
	if s.Open != 0 {
		t.Errorf("expected 0 open, got %d", s.Open)
	}
	if s.CatIOpen != 0 || s.CatIIOpen != 0 || s.CatIIIOpen != 0 {
		t.Errorf("expected no open category findings, got CAT I=%d, II=%d, III=%d",
			s.CatIOpen, s.CatIIOpen, s.CatIIIOpen)
	}
}

// TestSummaryAllOpen verifies score=0 when all findings are open.
func TestSummaryAllOpen(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "test-stig", Title: "Test STIG", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "open"},
				{ID: "V-002", Severity: "CAT II", Status: "open"},
				{ID: "V-003", Severity: "CAT III", Status: "open"},
			},
		},
	}
	s := e.Summary()
	if s.ComplianceScore != 0 {
		t.Errorf("all-open score: expected 0, got %d", s.ComplianceScore)
	}
	if s.Open != 3 {
		t.Errorf("expected 3 open, got %d", s.Open)
	}
	if s.CatIOpen != 1 {
		t.Errorf("expected 1 CAT I open, got %d", s.CatIOpen)
	}
	if s.CatIIOpen != 1 {
		t.Errorf("expected 1 CAT II open, got %d", s.CatIIOpen)
	}
	if s.CatIIIOpen != 1 {
		t.Errorf("expected 1 CAT III open, got %d", s.CatIIIOpen)
	}
}

// TestSummaryAllNotApplicable verifies score=0 when all are N/A (avoids division by zero).
func TestSummaryAllNotApplicable(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "test-stig", Title: "Test STIG", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "not_applicable"},
				{ID: "V-002", Severity: "CAT II", Status: "not_applicable"},
			},
		},
	}
	s := e.Summary()
	if s.ComplianceScore != 0 {
		t.Errorf("all-NA score: expected 0, got %d", s.ComplianceScore)
	}
	if s.NotApplicable != 2 {
		t.Errorf("expected 2 not_applicable, got %d", s.NotApplicable)
	}
}

// TestSummaryEmptyBenchmarks verifies score=0 with no findings (avoids division by zero).
func TestSummaryEmptyBenchmarks(t *testing.T) {
	e := &Engine{}
	e.benchmarks = nil
	s := e.Summary()
	if s.ComplianceScore != 0 {
		t.Errorf("empty benchmarks score: expected 0, got %d", s.ComplianceScore)
	}
	if s.TotalFindings != 0 {
		t.Errorf("expected 0 total findings, got %d", s.TotalFindings)
	}
}

// TestSummaryMixedFindings verifies correct scoring with a mix of statuses.
func TestSummaryMixedFindings(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "test-stig", Title: "Test", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "not_a_finding"},
				{ID: "V-002", Severity: "CAT I", Status: "open"},
				{ID: "V-003", Severity: "CAT II", Status: "not_a_finding"},
				{ID: "V-004", Severity: "CAT II", Status: "not_a_finding"},
				{ID: "V-005", Severity: "CAT II", Status: "not_reviewed"},
				{ID: "V-006", Severity: "CAT III", Status: "not_applicable"},
			},
		},
	}
	s := e.Summary()

	// total=6, na=1, naf=3, open=1, nr=1
	// score = 3*100 / (6-1) = 300/5 = 60
	if s.ComplianceScore != 60 {
		t.Errorf("mixed score: expected 60, got %d", s.ComplianceScore)
	}
	if s.CatIOpen != 1 {
		t.Errorf("expected 1 CAT I open, got %d", s.CatIOpen)
	}
	if s.CatIIOpen != 0 {
		t.Errorf("expected 0 CAT II open, got %d", s.CatIIOpen)
	}
	if s.NotReviewed != 1 {
		t.Errorf("expected 1 not_reviewed, got %d", s.NotReviewed)
	}
	if s.BenchmarkID != "test-stig" {
		t.Errorf("expected BenchmarkID 'test-stig', got %q", s.BenchmarkID)
	}
}

// TestSummaryCategoryCounting verifies CAT severity breakdown.
func TestSummaryCategoryCounting(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "b1", Title: "B1", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "open"},
				{ID: "V-002", Severity: "CAT I", Status: "open"},
				{ID: "V-003", Severity: "CAT II", Status: "open"},
				{ID: "V-004", Severity: "CAT III", Status: "open"},
				{ID: "V-005", Severity: "CAT III", Status: "open"},
				{ID: "V-006", Severity: "CAT III", Status: "open"},
			},
		},
	}
	s := e.Summary()
	if s.CatIOpen != 2 {
		t.Errorf("expected 2 CAT I open, got %d", s.CatIOpen)
	}
	if s.CatIIOpen != 1 {
		t.Errorf("expected 1 CAT II open, got %d", s.CatIIOpen)
	}
	if s.CatIIIOpen != 3 {
		t.Errorf("expected 3 CAT III open, got %d", s.CatIIIOpen)
	}
	if s.CatIOpen+s.CatIIOpen+s.CatIIIOpen != s.Open {
		t.Error("category open counts do not sum to total open")
	}
}

// TestSummaryMultipleBenchmarks verifies that findings are aggregated across benchmarks.
func TestSummaryMultipleBenchmarks(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{
			ID: "b1", Title: "B1", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-001", Severity: "CAT I", Status: "not_a_finding"},
				{ID: "V-002", Severity: "CAT II", Status: "open"},
			},
		},
		{
			ID: "b2", Title: "B2", Version: "V1R1", ReleaseDate: "2026-01-01",
			Findings: []Finding{
				{ID: "V-100", Severity: "CAT I", Status: "not_a_finding"},
				{ID: "V-101", Severity: "CAT III", Status: "not_a_finding"},
			},
		},
	}
	s := e.Summary()
	if s.TotalFindings != 4 {
		t.Errorf("expected 4 total findings from 2 benchmarks, got %d", s.TotalFindings)
	}
	// naf=3, total=4, na=0 → score = 300/4 = 75
	if s.ComplianceScore != 75 {
		t.Errorf("multi-benchmark score: expected 75, got %d", s.ComplianceScore)
	}
	// BenchmarkID should be first benchmark
	if s.BenchmarkID != "b1" {
		t.Errorf("expected BenchmarkID 'b1', got %q", s.BenchmarkID)
	}
}

// TestSummaryConcurrentAccess verifies Summary is safe under concurrent reads.
func TestSummaryConcurrentAccess(t *testing.T) {
	e := NewEngine()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s := e.Summary()
			if s.TotalFindings == 0 {
				t.Error("unexpected zero total findings under concurrency")
			}
		}()
	}
	wg.Wait()
}

// TestFindingsAggregation verifies Findings() returns all findings from all benchmarks.
func TestFindingsAggregation(t *testing.T) {
	e := &Engine{}
	e.benchmarks = []Benchmark{
		{ID: "b1", Findings: []Finding{{ID: "V-1"}, {ID: "V-2"}}},
		{ID: "b2", Findings: []Finding{{ID: "V-3"}}},
	}
	findings := e.Findings()
	if len(findings) != 3 {
		t.Errorf("expected 3 findings aggregated, got %d", len(findings))
	}
}
