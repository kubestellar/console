package agent

import (
	"runtime"
	"strings"
	"testing"
)

func TestOSContext(t *testing.T) {
	result := OSContext()
	if result == "" {
		t.Fatal("OSContext returned empty string")
	}
	// Should contain a slash separating OS and arch.
	if !strings.Contains(result, "/") {
		t.Errorf("OSContext should contain '/', got %q", result)
	}
	// Should match current runtime.
	expected := runtime.GOOS + "/" + runtime.GOARCH
	if result != expected {
		t.Errorf("OSContext = %q, want %q", result, expected)
	}
}

func TestOSCommandHint_NonEmpty(t *testing.T) {
	hint := OSCommandHint()
	if hint == "" {
		t.Fatal("OSCommandHint returned empty string")
	}
	// Should mention the current OS.
	if !strings.Contains(hint, runtime.GOARCH) {
		t.Errorf("OSCommandHint should mention arch %s", runtime.GOARCH)
	}
}

func TestOSCommandHint_ContainsOSDetection(t *testing.T) {
	hint := OSCommandHint()
	if !strings.Contains(hint, "OS DETECTION") {
		t.Error("OSCommandHint should contain 'OS DETECTION' header")
	}
}
