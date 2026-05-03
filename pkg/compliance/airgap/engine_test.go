package airgap

import "testing"

func TestNewEngine(t *testing.T) {
	e := NewEngine()
	if e == nil {
		t.Fatal("expected non-nil engine")
	}
}

func TestRequirements(t *testing.T) {
	e := NewEngine()
	reqs := e.Requirements()
	const expectedReqs = 10
	if len(reqs) != expectedReqs {
		t.Fatalf("expected %d requirements, got %d", expectedReqs, len(reqs))
	}
	valid := map[string]bool{"ready": true, "not_ready": true, "partial": true, "not_applicable": true}
	for _, r := range reqs {
		if !valid[r.Status] {
			t.Errorf("requirement %s has invalid status %q", r.ID, r.Status)
		}
		if r.Category == "" {
			t.Errorf("requirement %s has empty category", r.ID)
		}
	}
}

func TestClusters(t *testing.T) {
	e := NewEngine()
	clusters := e.Clusters()
	const expectedClusters = 4
	if len(clusters) != expectedClusters {
		t.Fatalf("expected %d clusters, got %d", expectedClusters, len(clusters))
	}
	for _, c := range clusters {
		if c.Cluster == "" {
			t.Error("cluster has empty name")
		}
		if c.Score < 0 || c.Score > 100 {
			t.Errorf("cluster %s score %d out of range", c.Cluster, c.Score)
		}
	}
}

func TestAirGapSummary(t *testing.T) {
	e := NewEngine()
	s := e.Summary()
	if s.TotalClusters == 0 {
		t.Error("expected non-zero total clusters")
	}
	if s.ReadyClusters+s.NotReadyClusters != s.TotalClusters {
		t.Error("cluster counts do not sum to total")
	}
	if s.OverallScore < 0 || s.OverallScore > 100 {
		t.Errorf("score %d out of range", s.OverallScore)
	}
	if s.EvaluatedAt == "" {
		t.Error("evaluated_at is empty")
	}
}

func TestRequirementsImmutability(t *testing.T) {
	e := NewEngine()
	r1 := e.Requirements()
	r1[0].Name = "MUTATED"
	r2 := e.Requirements()
	if r2[0].Name == "MUTATED" {
		t.Error("Requirements() returned a mutable reference")
	}
}
