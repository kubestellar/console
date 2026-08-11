package residency

import (
	"testing"
)

func TestEngineEvaluate(t *testing.T) {
	engine := NewEngine()
	violations, summary := engine.Evaluate()

	if summary.TotalRules != 5 {
		t.Errorf("expected 5 rules, got %d", summary.TotalRules)
	}
	if summary.TotalClusters != 6 {
		t.Errorf("expected 6 demo clusters, got %d", summary.TotalClusters)
	}

	// Should have violations for misplaced workloads
	if len(violations) == 0 {
		t.Error("expected at least one violation from demo workloads")
	}

	// Verify specific expected violations
	foundEUInUS := false
	foundHIPAAInEU := false
	foundPCIInAPAC := false
	for _, v := range violations {
		if v.Classification == ClassEUPersonal && v.ClusterRegion == RegionUS {
			foundEUInUS = true
		}
		if v.Classification == ClassHIPAA && v.ClusterRegion == RegionEU {
			foundHIPAAInEU = true
		}
		if v.Classification == ClassPCI && v.ClusterRegion == RegionAPAC {
			foundPCIInAPAC = true
		}
	}

	if !foundEUInUS {
		t.Error("expected violation: EU personal data in US region")
	}
	if !foundHIPAAInEU {
		t.Error("expected violation: HIPAA PHI in EU region")
	}
	if !foundPCIInAPAC {
		t.Error("expected violation: PCI cardholder data in APAC region")
	}
}

func TestEngineEvaluateSeverity(t *testing.T) {
	engine := NewEngine()
	violations, summary := engine.Evaluate()

	if summary.BySeverity["critical"] == 0 {
		t.Error("expected critical violations from EU/HIPAA data")
	}

	// Verify critical violations are for the right classifications
	for _, v := range violations {
		if v.Classification == ClassEUPersonal && v.Severity != SeverityCritical {
			t.Errorf("EU personal data violation should be critical, got %s", v.Severity)
		}
		if v.Classification == ClassPCI && v.Severity != SeverityHigh {
			t.Errorf("PCI violation should be high, got %s", v.Severity)
		}
	}
}

func TestEngineSummary(t *testing.T) {
	engine := NewEngine()
	summary := engine.Summary()

	if summary.Compliant+summary.NonCompliant != summary.TotalClusters {
		t.Errorf("compliant (%d) + non-compliant (%d) should equal total clusters (%d)",
			summary.Compliant, summary.NonCompliant, summary.TotalClusters)
	}

	// At least some clusters should be compliant
	if summary.Compliant == 0 {
		t.Error("expected at least one compliant cluster")
	}
	if summary.NonCompliant == 0 {
		t.Error("expected at least one non-compliant cluster")
	}
}

func TestRegionAllowed(t *testing.T) {
	tests := []struct {
		name    string
		actual  Region
		allowed []Region
		want    bool
	}{
		{"exact match", RegionEU, []Region{RegionEU, RegionUK}, true},
		{"no match", RegionAPAC, []Region{RegionEU, RegionUK}, false},
		{"global allows all", RegionAPAC, []Region{RegionGlobal}, true},
		{"empty allowed", RegionUS, []Region{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := regionAllowed(tt.actual, tt.allowed)
			if got != tt.want {
				t.Errorf("regionAllowed(%s, %v) = %v, want %v", tt.actual, tt.allowed, got, tt.want)
			}
		})
	}
}

func TestAllRegions(t *testing.T) {
	regions := AllRegions()
	if len(regions) < 6 {
		t.Errorf("expected at least 6 regions, got %d", len(regions))
	}
}

func TestRegionLabel(t *testing.T) {
	if RegionLabel(RegionEU) != "European Union" {
		t.Errorf("expected 'European Union', got %q", RegionLabel(RegionEU))
	}
	if RegionLabel(Region("unknown")) != "unknown" {
		t.Errorf("expected fallback to raw string")
	}
}

func TestEngineRules(t *testing.T) {
	engine := NewEngine()
	rules := engine.Rules()
	if len(rules) != 5 {
		t.Fatalf("expected 5 built-in rules, got %d", len(rules))
	}

	byID := make(map[string]Rule, len(rules))
	for _, r := range rules {
		byID[r.ID] = r
	}
	for _, id := range []string{"rule-eu-personal", "rule-pci-cardholder", "rule-hipaa-phi", "rule-federal-cui", "rule-public"} {
		if _, ok := byID[id]; !ok {
			t.Errorf("missing built-in rule %q", id)
		}
	}
}

func TestEngineClusterRegions(t *testing.T) {
	engine := NewEngine()
	regions := engine.ClusterRegions()
	if len(regions) != 6 {
		t.Fatalf("expected 6 demo clusters, got %d", len(regions))
	}

	seen := make(map[string]Region, len(regions))
	for _, cr := range regions {
		if cr.ClusterName == "" {
			t.Error("cluster name should not be empty")
		}
		seen[cr.ClusterName] = cr.Region
	}
	if seen["prod-us-east"] != RegionUS {
		t.Errorf("expected prod-us-east to be RegionUS, got %q", seen["prod-us-east"])
	}
	if seen["prod-eu-west"] != RegionEU {
		t.Errorf("expected prod-eu-west to be RegionEU, got %q", seen["prod-eu-west"])
	}
}

func TestEngineSetClusterRegion(t *testing.T) {
	engine := NewEngine()

	// Add a new cluster.
	engine.SetClusterRegion("prod-new-region", RegionCanada, "PIPEDA")
	regions := engine.ClusterRegions()
	if len(regions) != 7 {
		t.Fatalf("expected 7 clusters after add, got %d", len(regions))
	}

	var found *ClusterRegion
	for i, cr := range regions {
		if cr.ClusterName == "prod-new-region" {
			found = &regions[i]
			break
		}
	}
	if found == nil {
		t.Fatal("added cluster not found in ClusterRegions()")
	}
	if found.Region != RegionCanada {
		t.Errorf("expected RegionCanada, got %q", found.Region)
	}
	if found.Jurisdiction != "PIPEDA" {
		t.Errorf("expected jurisdiction PIPEDA, got %q", found.Jurisdiction)
	}

	// Overwrite an existing cluster's region.
	engine.SetClusterRegion("prod-us-east", RegionEU, "GDPR")
	regions = engine.ClusterRegions()
	if len(regions) != 7 {
		t.Fatalf("expected 7 clusters after overwrite, got %d", len(regions))
	}
	for _, cr := range regions {
		if cr.ClusterName == "prod-us-east" {
			if cr.Region != RegionEU {
				t.Errorf("expected overwritten region RegionEU, got %q", cr.Region)
			}
			if cr.Jurisdiction != "GDPR" {
				t.Errorf("expected overwritten jurisdiction GDPR, got %q", cr.Jurisdiction)
			}
		}
	}
}

func TestClassificationSeverity(t *testing.T) {
	if classificationSeverity(ClassEUPersonal) != SeverityCritical {
		t.Error("EU personal data should be critical")
	}
	if classificationSeverity(ClassPCI) != SeverityHigh {
		t.Error("PCI should be high")
	}
	if classificationSeverity(ClassPublic) != SeverityLow {
		t.Error("public should be low")
	}
	if classificationSeverity(ClassConfidential) != SeverityMedium {
		t.Error("confidential should be medium")
	}
	if classificationSeverity(ClassHIPAA) != SeverityCritical {
		t.Error("HIPAA should be critical")
	}
	if classificationSeverity(ClassFederal) != SeverityCritical {
		t.Error("federal CUI should be critical")
	}
}
