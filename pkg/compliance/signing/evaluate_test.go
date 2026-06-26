package signing

import (
	"testing"
)

// TestSummaryExactDemoValues verifies the signing demo data is returned accurately.
func TestSummaryExactDemoValues(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	const expectedTotal = 37
	if s.TotalImages != expectedTotal {
		t.Errorf("expected %d total images, got %d", expectedTotal, s.TotalImages)
	}

	const expectedSigned = 33
	if s.SignedImages != expectedSigned {
		t.Errorf("expected %d signed images, got %d", expectedSigned, s.SignedImages)
	}

	const expectedVerified = 30
	if s.VerifiedImages != expectedVerified {
		t.Errorf("expected %d verified images, got %d", expectedVerified, s.VerifiedImages)
	}

	const expectedUnsigned = 4
	if s.UnsignedImages != expectedUnsigned {
		t.Errorf("expected %d unsigned images, got %d", expectedUnsigned, s.UnsignedImages)
	}

	const expectedViolations = 2
	if s.PolicyViolations != expectedViolations {
		t.Errorf("expected %d policy violations, got %d", expectedViolations, s.PolicyViolations)
	}

	const expectedClusters = 5
	if s.ClustersCovered != expectedClusters {
		t.Errorf("expected %d clusters covered, got %d", expectedClusters, s.ClustersCovered)
	}
}

// TestSummarySignedPlusUnsignedEqualsTotal verifies image count consistency.
func TestSummarySignedPlusUnsignedEqualsTotal(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.SignedImages+s.UnsignedImages != s.TotalImages {
		t.Errorf("signed (%d) + unsigned (%d) != total (%d)",
			s.SignedImages, s.UnsignedImages, s.TotalImages)
	}
}

// TestSummaryVerifiedLessThanOrEqualSigned verifies verified <= signed
// (you must sign before you can verify).
func TestSummaryVerifiedLessThanOrEqualSigned(t *testing.T) {
	e := NewEngine()
	s := e.Summary()

	if s.VerifiedImages > s.SignedImages {
		t.Errorf("verified (%d) should be <= signed (%d)",
			s.VerifiedImages, s.SignedImages)
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

// TestImagesReturnsEmptySlice verifies stub returns empty (not nil).
func TestImagesReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	images := e.Images()
	if images == nil {
		t.Fatal("Images() returned nil, expected empty slice")
	}
	if len(images) != 0 {
		t.Errorf("expected 0 images from stub, got %d", len(images))
	}
}

// TestPoliciesReturnsEmptySlice verifies stub returns empty (not nil).
func TestPoliciesReturnsEmptySlice(t *testing.T) {
	e := NewEngine()
	policies := e.Policies()
	if policies == nil {
		t.Fatal("Policies() returned nil, expected empty slice")
	}
	if len(policies) != 0 {
		t.Errorf("expected 0 policies from stub, got %d", len(policies))
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
			if s.TotalImages == 0 {
				t.Error("unexpected zero total images in concurrent access")
			}
		}()
	}
	for i := 0; i < goroutines; i++ {
		<-done
	}
}
