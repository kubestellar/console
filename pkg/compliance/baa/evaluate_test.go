package baa

import (
	"testing"
)

// TestSummaryStatusCounting verifies the BAA status counting logic.
func TestSummaryStatusCounting(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedTotal = 6
	if s.TotalAgreements != expectedTotal {
		t.Errorf("expected %d total agreements, got %d", expectedTotal, s.TotalAgreements)
	}

	const expectedActive = 3
	if s.ActiveAgreements != expectedActive {
		t.Errorf("expected %d active, got %d", expectedActive, s.ActiveAgreements)
	}

	// Verify all statuses sum to total
	sum := s.ActiveAgreements + s.ExpiringSoon + s.Expired + s.Pending
	if sum != s.TotalAgreements {
		t.Errorf("status counts sum %d != total %d", sum, s.TotalAgreements)
	}
}

// TestSummaryClusterCoverage verifies covered/uncovered cluster counting.
func TestSummaryClusterCoverage(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	// Demo data covers 5 unique clusters across all agreements
	const expectedCovered = 5
	if s.CoveredClusters != expectedCovered {
		t.Errorf("expected %d covered clusters, got %d", expectedCovered, s.CoveredClusters)
	}

	const expectedUncovered = 1
	if s.UncoveredClusters != expectedUncovered {
		t.Errorf("expected %d uncovered clusters, got %d", expectedUncovered, s.UncoveredClusters)
	}

	// Covered + uncovered should equal demo fleet size (6)
	const demoFleetSize = 6
	if s.CoveredClusters+s.UncoveredClusters != demoFleetSize {
		t.Errorf("covered (%d) + uncovered (%d) != fleet size %d",
			s.CoveredClusters, s.UncoveredClusters, demoFleetSize)
	}
}

// TestSummaryWithAllActive verifies counts when all agreements are active.
func TestSummaryWithAllActive(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "active", CoveredClusters: []string{"c1"}},
			{ID: "a2", Status: "active", CoveredClusters: []string{"c2"}},
			{ID: "a3", Status: "active", CoveredClusters: []string{"c3"}},
		},
		alerts: nil,
	}
	s := e.Summary()
	if s.ActiveAgreements != 3 {
		t.Errorf("expected 3 active, got %d", s.ActiveAgreements)
	}
	if s.ExpiringSoon != 0 {
		t.Errorf("expected 0 expiring, got %d", s.ExpiringSoon)
	}
	if s.Expired != 0 {
		t.Errorf("expected 0 expired, got %d", s.Expired)
	}
	if s.Pending != 0 {
		t.Errorf("expected 0 pending, got %d", s.Pending)
	}
	if s.CoveredClusters != 3 {
		t.Errorf("expected 3 covered clusters, got %d", s.CoveredClusters)
	}
}

// TestSummaryWithAllExpired verifies counts when all agreements are expired.
func TestSummaryWithAllExpired(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "expired", CoveredClusters: []string{}},
			{ID: "a2", Status: "expired", CoveredClusters: []string{}},
		},
		alerts: nil,
	}
	s := e.Summary()
	if s.Expired != 2 {
		t.Errorf("expected 2 expired, got %d", s.Expired)
	}
	if s.ActiveAgreements != 0 {
		t.Errorf("expected 0 active, got %d", s.ActiveAgreements)
	}
	if s.CoveredClusters != 0 {
		t.Errorf("expected 0 covered clusters, got %d", s.CoveredClusters)
	}
}

// TestSummaryWithEmptyAgreements verifies no panic on empty input.
func TestSummaryWithEmptyAgreements(t *testing.T) {
	e := &Engine{
		agreements: nil,
		alerts:     nil,
	}
	s := e.Summary()
	if s.TotalAgreements != 0 {
		t.Errorf("expected 0 total agreements, got %d", s.TotalAgreements)
	}
	if s.CoveredClusters != 0 {
		t.Errorf("expected 0 covered clusters, got %d", s.CoveredClusters)
	}
	if s.ActiveAlerts != 0 {
		t.Errorf("expected 0 alerts, got %d", s.ActiveAlerts)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt even for empty input")
	}
}

// TestSummaryDeduplicatesClusters verifies that overlapping cluster coverage
// is counted correctly (unique clusters, not duplicates).
func TestSummaryDeduplicatesClusters(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "active", CoveredClusters: []string{"c1", "c2"}},
			{ID: "a2", Status: "active", CoveredClusters: []string{"c2", "c3"}},
			{ID: "a3", Status: "active", CoveredClusters: []string{"c1", "c3"}},
		},
		alerts: nil,
	}
	s := e.Summary()
	// Should be 3 unique clusters, not 6
	const expectedUnique = 3
	if s.CoveredClusters != expectedUnique {
		t.Errorf("expected %d unique covered clusters, got %d", expectedUnique, s.CoveredClusters)
	}
}

// TestSummaryAlertsCounting verifies alerts are counted from the alerts slice.
func TestSummaryAlertsCounting(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "active", CoveredClusters: []string{"c1"}},
		},
		alerts: []ExpiryAlert{
			{AgreementID: "a1", Severity: "critical"},
			{AgreementID: "a1", Severity: "warning"},
			{AgreementID: "a1", Severity: "info"},
		},
	}
	s := e.Summary()
	if s.ActiveAlerts != 3 {
		t.Errorf("expected 3 active alerts, got %d", s.ActiveAlerts)
	}
}

// TestSummaryMixedStatuses verifies correct counting with all status types.
func TestSummaryMixedStatuses(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "active", CoveredClusters: []string{"c1"}},
			{ID: "a2", Status: "expiring_soon", CoveredClusters: []string{"c2"}},
			{ID: "a3", Status: "expired", CoveredClusters: []string{}},
			{ID: "a4", Status: "pending", CoveredClusters: []string{"c3"}},
			{ID: "a5", Status: "active", CoveredClusters: []string{"c1"}},
		},
		alerts: []ExpiryAlert{
			{AgreementID: "a2", Severity: "warning"},
		},
	}
	s := e.Summary()
	if s.TotalAgreements != 5 {
		t.Errorf("expected 5 total, got %d", s.TotalAgreements)
	}
	if s.ActiveAgreements != 2 {
		t.Errorf("expected 2 active, got %d", s.ActiveAgreements)
	}
	if s.ExpiringSoon != 1 {
		t.Errorf("expected 1 expiring, got %d", s.ExpiringSoon)
	}
	if s.Expired != 1 {
		t.Errorf("expected 1 expired, got %d", s.Expired)
	}
	if s.Pending != 1 {
		t.Errorf("expected 1 pending, got %d", s.Pending)
	}
	// c1, c2, c3 = 3 unique clusters (c1 appears in a1 and a5)
	if s.CoveredClusters != 3 {
		t.Errorf("expected 3 covered clusters, got %d", s.CoveredClusters)
	}
	if s.ActiveAlerts != 1 {
		t.Errorf("expected 1 alert, got %d", s.ActiveAlerts)
	}
}

// TestSummaryUnknownStatusIgnored verifies unknown statuses don't increment counts.
func TestSummaryUnknownStatusIgnored(t *testing.T) {
	e := &Engine{
		agreements: []Agreement{
			{ID: "a1", Status: "active", CoveredClusters: []string{"c1"}},
			{ID: "a2", Status: "unknown_value", CoveredClusters: []string{"c2"}},
		},
		alerts: nil,
	}
	s := e.Summary()
	if s.TotalAgreements != 2 {
		t.Errorf("expected 2 total, got %d", s.TotalAgreements)
	}
	if s.ActiveAgreements != 1 {
		t.Errorf("expected 1 active, got %d", s.ActiveAgreements)
	}
	// Unknown status should not increment any known status counter
	sum := s.ActiveAgreements + s.ExpiringSoon + s.Expired + s.Pending
	if sum != 1 {
		t.Errorf("known status sum should be 1, got %d", sum)
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
			if s.TotalAgreements == 0 {
				t.Error("unexpected zero total agreements in concurrent access")
			}
		}()
	}
	for i := 0; i < goroutines; i++ {
		<-done
	}
}
