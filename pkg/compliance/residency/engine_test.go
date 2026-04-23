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
}
