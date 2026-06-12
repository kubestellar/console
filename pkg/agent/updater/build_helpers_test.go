package updater

import (
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// tailLines
// ---------------------------------------------------------------------------

func TestTailLines_FewerThanN(t *testing.T) {
	input := "line1\nline2\nline3"
	got := tailLines(input, 10)
	if got != input {
		t.Errorf("tailLines with fewer lines than n should return original; got %q", got)
	}
}

func TestTailLines_ExactlyN(t *testing.T) {
	input := "a\nb\nc"
	got := tailLines(input, 3)
	if got != input {
		t.Errorf("tailLines exact n should return all lines; got %q", got)
	}
}

func TestTailLines_MoreThanN(t *testing.T) {
	input := "a\nb\nc\nd\ne"
	got := tailLines(input, 3)
	want := "c\nd\ne"
	if got != want {
		t.Errorf("tailLines(5 lines, 3) = %q, want %q", got, want)
	}
}

func TestTailLines_Empty(t *testing.T) {
	got := tailLines("", 5)
	if got != "" {
		t.Errorf("tailLines empty string should return empty; got %q", got)
	}
}

func TestTailLines_SingleLine(t *testing.T) {
	got := tailLines("only line", 3)
	if got != "only line" {
		t.Errorf("tailLines single line = %q", got)
	}
}

func TestTailLines_TrailingNewline(t *testing.T) {
	// Trailing newline is trimmed before splitting.
	input := "x\ny\nz\n"
	got := tailLines(input, 2)
	want := "y\nz"
	if got != want {
		t.Errorf("tailLines with trailing newline = %q, want %q", got, want)
	}
}

func TestTailLines_NIsZero(t *testing.T) {
	got := tailLines("a\nb\nc", 0)
	if got != "" {
		t.Errorf("tailLines with n=0 should return empty string; got %q", got)
	}
}

// ---------------------------------------------------------------------------
// buildErrorDetail
// ---------------------------------------------------------------------------

func TestBuildErrorDetail_EmptyOutput(t *testing.T) {
	err := errors.New("something failed")
	got := buildErrorDetail(err, "")
	if got != "something failed" {
		t.Errorf("buildErrorDetail with empty output = %q, want plain error", got)
	}
}

func TestBuildErrorDetail_WithOutput(t *testing.T) {
	err := errors.New("exit status 1")
	output := "npm ERR! missing script\nnpm ERR! exit code 1"
	got := buildErrorDetail(err, output)
	if !strings.Contains(got, "exit status 1") {
		t.Errorf("buildErrorDetail should include error: %q", got)
	}
	if !strings.Contains(got, "npm ERR!") {
		t.Errorf("buildErrorDetail should include output: %q", got)
	}
	if !strings.Contains(got, "---") {
		t.Errorf("buildErrorDetail should include separator: %q", got)
	}
}

func TestBuildErrorDetail_MultilineOutput(t *testing.T) {
	err := errors.New("build failed")
	output := strings.Join([]string{"step1", "step2", "ERROR: bad"}, "\n")
	got := buildErrorDetail(err, output)
	if !strings.Contains(got, "ERROR: bad") {
		t.Errorf("buildErrorDetail should preserve output lines: %q", got)
	}
}
