package safego

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"
)

// waitForLog polls the snapshot fn until the buffer is non-empty (i.e., the
// panic recovery path has finished emitting its slog record) or the deadline
// expires. Necessary because the inner fn's defer (which unblocks wg) fires
// BEFORE the outer recover-and-log defer in Go/GoWith, so a bare wg.Wait()
// races the log write.
func waitForLog(t *testing.T, snap func() string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s := snap()
		if s != "" {
			return s
		}
		time.Sleep(2 * time.Millisecond)
	}
	return snap()
}

// Log-integrity invariants for Go and GoWith.
//
// safego_test.go proves the recover works (a panicking goroutine does not
// crash the process). It does not prove:
//
//   1. that the recover path actually EMITS a slog error entry — a future
//      refactor that drops the `slog.Error(...)` call would leave every
//      existing test green while silently swallowing panics.
//
//   2. that GoWith runs its `label` argument through sanitize.LogString
//      before logging — dropping the sanitize wrapper (or passing the raw
//      label directly) is exactly the kind of log-injection regression a
//      mechanical refactor might ship, and no test today catches it.
//
// This suite installs a slog handler that captures every log record into an
// in-memory buffer and asserts on the emitted "recover", "stack", and
// (for GoWith) "label" attributes.

// captureSlog swaps slog.Default() for a text-handler-backed sink for the
// duration of the test and returns a snapshot function.
func captureSlog(t *testing.T) func() string {
	t.Helper()
	var buf bytes.Buffer
	var mu sync.Mutex
	orig := slog.Default()
	handler := slog.NewTextHandler(&lockedWriter{mu: &mu, w: &buf}, &slog.HandlerOptions{Level: slog.LevelDebug})
	slog.SetDefault(slog.New(handler))
	t.Cleanup(func() { slog.SetDefault(orig) })
	return func() string {
		mu.Lock()
		defer mu.Unlock()
		return buf.String()
	}
}

type lockedWriter struct {
	mu *sync.Mutex
	w  *bytes.Buffer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

// Ensure slog is used with a non-nil context internally — silences a linter.
var _ = context.Background

func TestGo_PanicEmitsSlogErrorWithRecoverAndStack(t *testing.T) {
	snap := captureSlog(t)

	var wg sync.WaitGroup
	wg.Add(1)
	Go(func() {
		defer wg.Done()
		panic("boom-Go")
	})
	wg.Wait()

	out := waitForLog(t, snap)
	if !strings.Contains(out, "level=ERROR") {
		t.Fatalf("expected an ERROR-level slog record, got %q", out)
	}
	if !strings.Contains(out, `msg="goroutine panicked"`) {
		t.Fatalf("expected msg=\"goroutine panicked\" in output, got %q", out)
	}
	if !strings.Contains(out, "recover=boom-Go") {
		t.Fatalf("expected recover=boom-Go attribute, got %q", out)
	}
	// Stack attribute is present and non-empty. slog quotes multiline
	// values, so we just check the key appears.
	if !strings.Contains(out, "stack=") {
		t.Fatalf("expected stack= attribute in output, got %q", out)
	}
}

func TestGoWith_PanicEmitsSlogErrorWithLabelAndRecoverAndStack(t *testing.T) {
	snap := captureSlog(t)

	var wg sync.WaitGroup
	wg.Add(1)
	GoWith("payment-worker", func() {
		defer wg.Done()
		panic("boom-GoWith")
	})
	wg.Wait()

	out := waitForLog(t, snap)
	if !strings.Contains(out, "level=ERROR") {
		t.Fatalf("expected ERROR-level record, got %q", out)
	}
	if !strings.Contains(out, "label=payment-worker") {
		t.Fatalf("expected label=payment-worker attribute, got %q", out)
	}
	if !strings.Contains(out, "recover=boom-GoWith") {
		t.Fatalf("expected recover=boom-GoWith attribute, got %q", out)
	}
	if !strings.Contains(out, "stack=") {
		t.Fatalf("expected stack= attribute, got %q", out)
	}
}

func TestGoWith_LabelIsSanitizedBeforeLogging(t *testing.T) {
	// A label containing raw newline / carriage return / null / ANSI must
	// have its control characters replaced (or stripped) by
	// sanitize.LogString before it reaches slog. If a future refactor
	// removes the sanitize wrapper, the raw \n or \x1b lands in the log
	// stream — classic log-injection (CWE-117).
	tests := []struct {
		name              string
		label             string
		mustNotContain    []string
		mustContain       []string
	}{
		{
			name:  "newline",
			label: "worker\nFAKE ENTRY",
			// The sanitizer replaces \n with the visible ⏎ placeholder.
			// Raw '\n' must not survive into the emitted log record's
			// label attribute (guarded by mustNotContain below).
			mustNotContain: []string{"worker\nFAKE ENTRY"},
			mustContain:    []string{"⏎FAKE ENTRY"},
		},
		{
			name:           "carriage return",
			label:          "worker\rmalicious",
			mustNotContain: []string{"worker\rmalicious"},
			mustContain:    []string{"⏎malicious"},
		},
		{
			name:           "null byte",
			label:          "worker\x00tail",
			mustNotContain: []string{"worker\x00tail"},
			mustContain:    []string{"workertail"},
		},
		{
			name:           "ANSI clear-screen escape",
			label:          "worker\x1b[2Jclobbered",
			mustNotContain: []string{"\x1b["},
			mustContain:    []string{"workerclobbered"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snap := captureSlog(t)

			var wg sync.WaitGroup
			wg.Add(1)
			GoWith(tt.label, func() {
				defer wg.Done()
				panic("recovered")
			})
			wg.Wait()

			out := waitForLog(t, snap)
			for _, bad := range tt.mustNotContain {
				if strings.Contains(out, bad) {
					t.Fatalf("raw injection %q leaked into slog output %q", bad, out)
				}
			}
			for _, good := range tt.mustContain {
				if !strings.Contains(out, good) {
					t.Fatalf("expected sanitized substring %q in slog output %q", good, out)
				}
			}
		})
	}
}
