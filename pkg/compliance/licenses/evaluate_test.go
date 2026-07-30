package licenses

import (
	"testing"
)

// TestSummaryExactDemoValues verifies the license demo data is returned accurately.
func TestSummaryExactDemoValues(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedPackages = 3847
	if s.TotalPackages != expectedPackages {
		t.Errorf("expected %d total packages, got %d", expectedPackages, s.TotalPackages)
	}

	const expectedAllowed = 3814
	if s.AllowedPackages != expectedAllowed {
		t.Errorf("expected %d allowed packages, got %d", expectedAllowed, s.AllowedPackages)
	}

	const expectedWarned = 24
	if s.WarnedPackages != expectedWarned {
		t.Errorf("expected %d warned packages, got %d", expectedWarned, s.WarnedPackages)
	}

	const expectedDenied = 9
	if s.DeniedPackages != expectedDenied {
		t.Errorf("expected %d denied packages, got %d", expectedDenied, s.DeniedPackages)
	}

	const expectedLicenses = 47
	if s.UniqueLicenses != expectedLicenses {
		t.Errorf("expected %d unique licenses, got %d", expectedLicenses, s.UniqueLicenses)
	}

	const expectedScanned = 37
	if s.WorkloadsScanned != expectedScanned {
		t.Errorf("expected %d workloads scanned, got %d", expectedScanned, s.WorkloadsScanned)
	}
}

// TestSummaryPackageCountConsistency verifies allowed + warned + denied == total.
func TestSummaryPackageCountConsistency(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	sum := s.AllowedPackages + s.WarnedPackages + s.DeniedPackages
	if sum != s.TotalPackages {
		t.Errorf("allowed (%d) + warned (%d) + denied (%d) = %d != total (%d)",
			s.AllowedPackages, s.WarnedPackages, s.DeniedPackages, sum, s.TotalPackages)
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

// TestPackagesReturnsEmptySlice verifies stub returns empty (not nil).
func TestPackagesReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	pkgs := e.Packages()
	if pkgs == nil {
		t.Fatal("Packages() returned nil, expected empty slice")
	}
	if len(pkgs) != 0 {
		t.Errorf("expected 0 packages from stub, got %d", len(pkgs))
	}
}

// TestCategoriesReturnsEmptySlice verifies stub returns empty (not nil).
func TestCategoriesReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	cats := e.Categories()
	if cats == nil {
		t.Fatal("Categories() returned nil, expected empty slice")
	}
	if len(cats) != 0 {
		t.Errorf("expected 0 categories from stub, got %d", len(cats))
	}
}

// TestRiskConstants verifies risk type constants.
func TestRiskConstants(t *testing.T) {
	tests := []struct {
		name string
		risk Risk
		want string
	}{
		{"allowed", RiskAllowed, "allowed"},
		{"warn", RiskWarn, "warn"},
		{"denied", RiskDenied, "denied"},
	}
	for _, tt := range tests {
		if string(tt.risk) != tt.want {
			t.Errorf("Risk %s: expected %q, got %q", tt.name, tt.want, string(tt.risk))
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
			if s.TotalPackages == 0 {
				t.Error("unexpected zero total packages in concurrent access")
			}
		}()
	}
	for i := 0; i < goroutines; i++ {
		<-done
	}
}
