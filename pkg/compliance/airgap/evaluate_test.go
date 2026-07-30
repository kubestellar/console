package airgap

import (
	"testing"
)

// TestSummaryScoreCalculation verifies the air-gap readiness score formula:
// score = (metRequirements * 100) / totalRequirements
func TestSummaryScoreCalculation(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	// Demo data: 8 ready out of 10 requirements
	const expectedMet = 8
	const expectedTotal = 10
	expectedScore := (expectedMet * 100) / expectedTotal // = 80
	if s.MetRequirements != expectedMet {
		t.Errorf("expected %d met requirements, got %d", expectedMet, s.MetRequirements)
	}
	if s.TotalRequirements != expectedTotal {
		t.Errorf("expected %d total requirements, got %d", expectedTotal, s.TotalRequirements)
	}
	if s.OverallScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.OverallScore)
	}
}

// TestSummaryClusterCounts verifies cluster ready/not-ready counting.
func TestSummaryClusterCounts(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedTotal = 4
	const expectedReady = 2
	const expectedNotReady = 2
	if s.TotalClusters != expectedTotal {
		t.Errorf("expected %d total clusters, got %d", expectedTotal, s.TotalClusters)
	}
	if s.ReadyClusters != expectedReady {
		t.Errorf("expected %d ready clusters, got %d", expectedReady, s.ReadyClusters)
	}
	if s.NotReadyClusters != expectedNotReady {
		t.Errorf("expected %d not-ready clusters, got %d", expectedNotReady, s.NotReadyClusters)
	}
}

// TestSummaryWithAllReady verifies score is 100 when all requirements are met.
func TestSummaryWithAllReady(t *testing.T) {
	e := &Engine{
		requirements: []Requirement{
			{ID: "r1", Status: "ready"},
			{ID: "r2", Status: "ready"},
			{ID: "r3", Status: "ready"},
		},
		clusters: []ClusterReadiness{
			{Cluster: "c1", Ready: true, Score: 100},
			{Cluster: "c2", Ready: true, Score: 100},
		},
	}
	s := e.Summary()
	if s.OverallScore != 100 {
		t.Errorf("all-ready score: expected 100, got %d", s.OverallScore)
	}
	if s.MetRequirements != 3 {
		t.Errorf("expected 3 met requirements, got %d", s.MetRequirements)
	}
	if s.ReadyClusters != 2 {
		t.Errorf("expected 2 ready clusters, got %d", s.ReadyClusters)
	}
	if s.NotReadyClusters != 0 {
		t.Errorf("expected 0 not-ready clusters, got %d", s.NotReadyClusters)
	}
}

// TestSummaryWithAllNotReady verifies score is 0 when no requirements are met.
func TestSummaryWithAllNotReady(t *testing.T) {
	e := &Engine{
		requirements: []Requirement{
			{ID: "r1", Status: "not_ready"},
			{ID: "r2", Status: "not_ready"},
		},
		clusters: []ClusterReadiness{
			{Cluster: "c1", Ready: false},
		},
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("all-not-ready score: expected 0, got %d", s.OverallScore)
	}
	if s.MetRequirements != 0 {
		t.Errorf("expected 0 met requirements, got %d", s.MetRequirements)
	}
	if s.ReadyClusters != 0 {
		t.Errorf("expected 0 ready clusters, got %d", s.ReadyClusters)
	}
}

// TestSummaryWithEmptyData verifies no panic on empty requirements and clusters.
func TestSummaryWithEmptyData(t *testing.T) {
	e := &Engine{
		requirements: nil,
		clusters:     nil,
	}
	s := e.Summary()
	if s.OverallScore != 0 {
		t.Errorf("empty data score: expected 0, got %d", s.OverallScore)
	}
	if s.TotalRequirements != 0 {
		t.Errorf("expected 0 total requirements, got %d", s.TotalRequirements)
	}
	if s.TotalClusters != 0 {
		t.Errorf("expected 0 total clusters, got %d", s.TotalClusters)
	}
	if s.EvaluatedAt == "" {
		t.Error("expected non-empty EvaluatedAt even for empty input")
	}
}

// TestSummaryPartialStatusNotCounted verifies "partial" requirements are NOT
// counted as met (only "ready" counts).
func TestSummaryPartialStatusNotCounted(t *testing.T) {
	e := &Engine{
		requirements: []Requirement{
			{ID: "r1", Status: "ready"},
			{ID: "r2", Status: "partial"},
			{ID: "r3", Status: "not_ready"},
		},
		clusters: nil,
	}
	s := e.Summary()
	// Only 1 out of 3 is "ready"
	const expectedScore = (1 * 100) / 3 // = 33
	if s.MetRequirements != 1 {
		t.Errorf("expected 1 met requirement, got %d", s.MetRequirements)
	}
	if s.OverallScore != expectedScore {
		t.Errorf("expected score %d, got %d", expectedScore, s.OverallScore)
	}
}

// TestSummaryMixedClusters verifies mixed ready/not-ready cluster counting.
func TestSummaryMixedClusters(t *testing.T) {
	e := &Engine{
		requirements: []Requirement{{ID: "r1", Status: "ready"}},
		clusters: []ClusterReadiness{
			{Cluster: "c1", Ready: true},
			{Cluster: "c2", Ready: false},
			{Cluster: "c3", Ready: true},
			{Cluster: "c4", Ready: false},
			{Cluster: "c5", Ready: true},
		},
	}
	s := e.Summary()
	if s.TotalClusters != 5 {
		t.Errorf("expected 5 total clusters, got %d", s.TotalClusters)
	}
	if s.ReadyClusters != 3 {
		t.Errorf("expected 3 ready clusters, got %d", s.ReadyClusters)
	}
	if s.NotReadyClusters != 2 {
		t.Errorf("expected 2 not-ready clusters, got %d", s.NotReadyClusters)
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
			if s.TotalClusters == 0 {
				t.Error("unexpected zero total clusters in concurrent access")
			}
		}()
	}
	for i := 0; i < goroutines; i++ {
		<-done
	}
}

// TestRequirementCategoryDistribution verifies demo data has multiple categories.
func TestRequirementCategoryDistribution(t *testing.T) {
	e := NewEngine()
	categories := map[string]int{}
	for _, r := range e.Requirements() {
		categories[r.Category]++
	}
	// Demo data should have at least 3 distinct categories
	const minCategories = 3
	if len(categories) < minCategories {
		t.Errorf("expected at least %d categories, got %d", minCategories, len(categories))
	}
}
