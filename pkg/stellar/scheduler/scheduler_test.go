package scheduler

import (
	"errors"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// sanitizeError
// ---------------------------------------------------------------------------

func TestSanitizeError_SafePrefixes(t *testing.T) {
	safePrefixes := []struct {
		input    string
		wantSame bool
	}{
		{"context deadline exceeded after 30s", true},
		{"context canceled by caller", true},
		{"not found: pod/foo", true},
		{"forbidden: user lacks permission", true},
		{"unauthorized: token expired", true},
		// Mixed case — prefix matching is case-insensitive
		{"Context Deadline Exceeded", true},
		{"FORBIDDEN: no rbac rule", true},
	}

	for _, tc := range safePrefixes {
		got := sanitizeError(errors.New(tc.input))
		if tc.wantSame && got != tc.input {
			t.Errorf("sanitizeError(%q): safe prefix should pass through unchanged, got %q", tc.input, got)
		}
	}
}

func TestSanitizeError_SensitiveMessageTruncatedAt120(t *testing.T) {
	// Message starts with a server URL — not a safe prefix; should be sanitized.
	sensitive := "https://internal-k8s-api.corp.example.com:6443/api/v1/pods failed: " +
		strings.Repeat("x", 200)

	got := sanitizeError(errors.New(sensitive))

	if strings.Contains(got, "internal-k8s-api") {
		t.Errorf("sensitive URL should be removed or truncated: got %q", got)
	}
	const maxLen = 120
	if len(got) > maxLen+len("…") {
		t.Errorf("sanitized error exceeds max length: len=%d, got %q", len(got), got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("truncated message should end with …, got %q", got)
	}
}

func TestSanitizeError_ShortMessageUnderLimitPassesThrough(t *testing.T) {
	msg := "some generic short error"
	got := sanitizeError(errors.New(msg))
	// Short message that doesn't match a safe prefix should still be returned
	// (just potentially truncated — but it's under 120 chars here so no truncation).
	if len(got) > 120 {
		t.Errorf("short message should not be truncated: len=%d", len(got))
	}
}

func TestSanitizeError_ExactlyMaxLengthNotTruncated(t *testing.T) {
	// A message that is exactly 120 chars and does not match a safe prefix.
	msg := strings.Repeat("z", 120)
	got := sanitizeError(errors.New(msg))
	if strings.HasSuffix(got, "…") {
		t.Errorf("message of exactly max length should not be truncated: %q", got)
	}
}

func TestSanitizeError_OneOverMaxLengthGetsTruncated(t *testing.T) {
	msg := strings.Repeat("a", 121)
	got := sanitizeError(errors.New(msg))
	if !strings.HasSuffix(got, "…") {
		t.Errorf("message of 121 chars should be truncated with …, got %q", got)
	}
	// Truncated content is first 120 chars of original + "…"
	if !strings.HasPrefix(got, strings.Repeat("a", 120)) {
		t.Errorf("truncated prefix wrong: %q", got)
	}
}

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

func TestTruncate_ShorterThanMax(t *testing.T) {
	got := truncate("hello", 10)
	if got != "hello" {
		t.Errorf("truncate: want 'hello', got %q", got)
	}
}

func TestTruncate_ExactlyMax(t *testing.T) {
	s := strings.Repeat("x", 5)
	got := truncate(s, 5)
	if got != s {
		t.Errorf("truncate: want %q, got %q", s, got)
	}
}

func TestTruncate_LongerThanMax(t *testing.T) {
	got := truncate("hello world", 5)
	if got != "hello..." {
		t.Errorf("truncate: want 'hello...', got %q", got)
	}
}

func TestTruncate_EmptyString(t *testing.T) {
	got := truncate("", 10)
	if got != "" {
		t.Errorf("truncate('',10): want '', got %q", got)
	}
}

func TestTruncate_ZeroMax(t *testing.T) {
	// max=0: every non-empty string is longer than max → truncate to ""+"..."
	got := truncate("abc", 0)
	if got != "..." {
		t.Errorf("truncate with max=0: want '...', got %q", got)
	}
}

// ---------------------------------------------------------------------------
// ptr
// ---------------------------------------------------------------------------

func TestPtr_Int(t *testing.T) {
	v := 42
	p := ptr(v)
	if p == nil {
		t.Fatal("ptr returned nil")
	}
	if *p != v {
		t.Errorf("ptr(%d): want %d, got %d", v, v, *p)
	}
}

func TestPtr_String(t *testing.T) {
	s := "stellar"
	p := ptr(s)
	if *p != s {
		t.Errorf("ptr(%q): want %q, got %q", s, s, *p)
	}
}

func TestPtr_Distinct(t *testing.T) {
	v := 7
	p1 := ptr(v)
	p2 := ptr(v)
	if p1 == p2 {
		t.Error("ptr should return a new pointer on each call")
	}
}

// ---------------------------------------------------------------------------
// New (Scheduler constructor)
// ---------------------------------------------------------------------------

func TestNew_DefaultConcurrency(t *testing.T) {
	s := New(nil, nil)
	if s.concurrency != 3 {
		t.Errorf("New() default concurrency: want 3, got %d", s.concurrency)
	}
}

func TestNew_CustomConcurrency(t *testing.T) {
	s := New(nil, nil, 10)
	if s.concurrency != 10 {
		t.Errorf("New(concurrency=10): want 10, got %d", s.concurrency)
	}
}

func TestNew_ZeroConcurrencyClampedToThree(t *testing.T) {
	s := New(nil, nil, 0)
	if s.concurrency != 3 {
		t.Errorf("New(concurrency=0): want 3 (clamped), got %d", s.concurrency)
	}
}

func TestNew_NegativeConcurrencyClampedToThree(t *testing.T) {
	s := New(nil, nil, -5)
	if s.concurrency != 3 {
		t.Errorf("New(concurrency=-5): want 3 (clamped), got %d", s.concurrency)
	}
}
