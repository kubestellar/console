package api

import (
	"testing"
)

// TestGetBuildInfo_ReturnsPackageBuildInfo verifies that the exported
// GetBuildInfo accessor returns the package-level buildInfo populated
// by init(). The function is a one-liner but was previously at 0%
// coverage — no test exercised it. This guards against a regression
// that changes GetBuildInfo to return a different (e.g. zero) value
// or accidentally mutates buildInfo.
func TestGetBuildInfo_ReturnsPackageBuildInfo(t *testing.T) {
	got := GetBuildInfo()

	// GetBuildInfo must return the same struct init() populated into the
	// package-level buildInfo variable. Compare by value so a future
	// change that returns a copy vs. reference still passes.
	if got != buildInfo {
		t.Fatalf("GetBuildInfo() = %+v, want package buildInfo %+v", got, buildInfo)
	}
}

// TestGetBuildInfo_ExposesGoVersion verifies that in a normal `go test`
// run (which invokes debug.ReadBuildInfo() successfully during init),
// the exported accessor surfaces a non-empty GoVersion. In test binaries
// debug.ReadBuildInfo returns a populated *BuildInfo, so GoVersion is
// always set — a regression that dropped the field would fail here.
func TestGetBuildInfo_GoVersionPopulated(t *testing.T) {
	got := GetBuildInfo()
	if got.GoVersion == "" {
		t.Fatal("GetBuildInfo().GoVersion is empty; init() should have populated it from debug.ReadBuildInfo")
	}
}
