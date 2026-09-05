package updater

import (
	"strings"
	"testing"
	"time"
)

// TestStatus_LastUpdateTimeFormatted covers the ``!uc.lastUpdateTime.IsZero()``
// branch in Status() (checker.go:111). The existing TestStatusIncludesUpdateInProgress
// only exercises the zero-value default, so the RFC3339-formatted output path
// had no direct assertion.
func TestStatus_LastUpdateTimeFormatted(t *testing.T) {
	fixed := time.Date(2026, 9, 5, 12, 34, 56, 0, time.UTC)
	uc := &UpdateChecker{
		channel:        "stable",
		installMethod:  "binary",
		lastUpdateTime: fixed,
		broadcast:      func(string, interface{}) {},
	}

	got := uc.Status().LastUpdateTime
	want := fixed.Format(time.RFC3339)
	if got != want {
		t.Fatalf("Status().LastUpdateTime = %q, want %q", got, want)
	}
}

// TestStatus_LastUpdateTimeZero_OmitsField covers the negated arm of the
// same branch — Status() must leave LastUpdateTime empty when the time is
// still the zero value (checker.go:111).
func TestStatus_LastUpdateTimeZero_OmitsField(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast:     func(string, interface{}) {},
	}

	if got := uc.Status().LastUpdateTime; got != "" {
		t.Errorf("Status().LastUpdateTime = %q, want empty for zero-value lastUpdateTime", got)
	}
}

// TestStatus_LastUpdateErrorSanitized covers the ``uc.lastUpdateError != ""``
// branch in Status() (checker.go:114). The response must NOT leak the raw
// error text — the sanitized surface is a single fixed string. Without a
// direct test, a regression that started echoing the raw error (leaking
// git/npm/build paths to any HTTP consumer of /api/agent/update-status)
// would land silently.
func TestStatus_LastUpdateErrorSanitized(t *testing.T) {
	raw := "fatal: refusing to merge unrelated histories at /home/user/secret-path"
	uc := &UpdateChecker{
		channel:         "stable",
		installMethod:   "binary",
		lastUpdateError: raw,
		broadcast:       func(string, interface{}) {},
	}

	got := uc.Status().LastUpdateResult
	if got == "" {
		t.Fatal("Status().LastUpdateResult = \"\", want non-empty sanitized message")
	}
	if strings.Contains(got, raw) || strings.Contains(got, "/home/user") ||
		strings.Contains(got, "unrelated histories") {
		t.Errorf("Status().LastUpdateResult leaks raw error text: %q", got)
	}
	if !strings.Contains(strings.ToLower(got), "failed") {
		t.Errorf("Status().LastUpdateResult = %q, want a failure-indicating message", got)
	}
}

// TestStatus_NoErrorLeavesResultEmpty covers the negated arm — when
// lastUpdateError is empty, LastUpdateResult must stay empty (not e.g.
// default to a success string). Regressions here would flip a fresh
// UpdateChecker into a "failed"-looking status.
func TestStatus_NoErrorLeavesResultEmpty(t *testing.T) {
	uc := &UpdateChecker{
		channel:       "stable",
		installMethod: "binary",
		broadcast:     func(string, interface{}) {},
	}

	if got := uc.Status().LastUpdateResult; got != "" {
		t.Errorf("Status().LastUpdateResult = %q, want empty when no lastUpdateError", got)
	}
}
