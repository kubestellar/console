package k8s

import (
	"strings"
	"testing"
)

func TestSanitizeK8sName_LowercasesInput(t *testing.T) {
	if got := sanitizeK8sName("MyName"); got != "myname" {
		t.Errorf("expected lowercase, got %q", got)
	}
}

func TestSanitizeK8sName_ReplacesAtSign(t *testing.T) {
	got := sanitizeK8sName("user@example.com")
	if strings.Contains(got, "@") {
		t.Errorf("@ should be replaced, got %q", got)
	}
}

func TestSanitizeK8sName_PreservesAlphanumericAndDots(t *testing.T) {
	got := sanitizeK8sName("user-name.1")
	if got != "user-name.1" {
		t.Errorf("expected %q, got %q", "user-name.1", got)
	}
}

func TestSanitizeK8sName_PrefixesDashStart(t *testing.T) {
	got := sanitizeK8sName("-leading")
	if got[0] == '-' {
		t.Errorf("should not start with dash, got %q", got)
	}
}

func TestSanitizeK8sName_PrefixesDotStart(t *testing.T) {
	got := sanitizeK8sName(".leading")
	if got[0] == '.' {
		t.Errorf("should not start with dot, got %q", got)
	}
}

func TestSanitizeK8sName_StripTrailingDashes(t *testing.T) {
	got := sanitizeK8sName("trailing-")
	if strings.HasSuffix(got, "-") {
		t.Errorf("should not end with dash, got %q", got)
	}
}

func TestSanitizeK8sName_StripTrailingDots(t *testing.T) {
	got := sanitizeK8sName("trailing.")
	if strings.HasSuffix(got, ".") {
		t.Errorf("should not end with dot, got %q", got)
	}
}

func TestSanitizeK8sName_TruncatesLongName(t *testing.T) {
	long := strings.Repeat("a", 100)
	got := sanitizeK8sName(long)
	if len(got) > 63 {
		t.Errorf("expected max 63 chars, got %d", len(got))
	}
}

func TestSanitizeK8sName_EmptyInput(t *testing.T) {
	got := sanitizeK8sName("")
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestSanitizeK8sName_AllSpecialChars(t *testing.T) {
	got := sanitizeK8sName("!@#$%^&*()")
	// All replaced with '-', then trailing dashes stripped
	if strings.ContainsAny(got, "!@#$%^&*()") {
		t.Errorf("special chars should be replaced, got %q", got)
	}
}

func TestSanitizeK8sName_ExactlyMaxLength(t *testing.T) {
	exact := strings.Repeat("a", 63)
	got := sanitizeK8sName(exact)
	if len(got) != 63 {
		t.Errorf("expected 63 chars, got %d", len(got))
	}
}
