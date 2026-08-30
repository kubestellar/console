package safego

import (
	"bytes"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"
)

// newTestLogger returns a slog.Logger that writes JSON to buf and replaces
// the default logger for the duration of the test. The original default is
// restored via t.Cleanup.
func newTestLogger(t *testing.T) *bytes.Buffer {
	t.Helper()
	var buf bytes.Buffer
	h := slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})
	logger := slog.New(h)
	orig := slog.Default()
	slog.SetDefault(logger)
	t.Cleanup(func() { slog.SetDefault(orig) })
	return &buf
}

// waitForLog polls buf until predicate returns true or the deadline passes.
// Needed because the recover-and-log defer inside Go/GoWith runs after the
// caller's wg.Done(), so the log write may race the outer goroutine.
func waitForLog(buf *bytes.Buffer, predicate func(string) bool) bool {
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if predicate(buf.String()) {
			return true
		}
		time.Sleep(5 * time.Millisecond)
	}
	return false
}

func TestGo_PanicEmitsSlogErrorWithRecoverAndStack(t *testing.T) {
	buf := newTestLogger(t)

	var wg sync.WaitGroup
	wg.Add(1)
	Go(func() {
		defer wg.Done()
		panic("boom")
	})
	wg.Wait()

	if !waitForLog(buf, func(s string) bool {
		return strings.Contains(s, `"level":"ERROR"`) &&
			strings.Contains(s, `"msg":"goroutine panicked"`) &&
			strings.Contains(s, `"recover"`) &&
			strings.Contains(s, `"stack"`)
	}) {
		t.Fatalf("expected slog ERROR with recover and stack; got:\n%s", buf.String())
	}

	log := buf.String()
	if !strings.Contains(log, `"level":"ERROR"`) {
		t.Errorf("expected level=ERROR in log; got: %s", log)
	}
	if !strings.Contains(log, `"msg":"goroutine panicked"`) {
		t.Errorf("expected msg=goroutine panicked in log; got: %s", log)
	}
	if !strings.Contains(log, `"recover"`) {
		t.Errorf("expected recover attribute in log; got: %s", log)
	}
	if !strings.Contains(log, `"stack"`) {
		t.Errorf("expected stack attribute in log; got: %s", log)
	}
}

func TestGoWith_PanicEmitsSlogErrorWithLabelAndRecoverAndStack(t *testing.T) {
	buf := newTestLogger(t)

	var wg sync.WaitGroup
	wg.Add(1)
	GoWith("my-worker", func() {
		defer wg.Done()
		panic("labeled boom")
	})
	wg.Wait()

	if !waitForLog(buf, func(s string) bool {
		return strings.Contains(s, `"label"`) &&
			strings.Contains(s, `"recover"`) &&
			strings.Contains(s, `"stack"`)
	}) {
		t.Fatalf("expected slog ERROR with label, recover and stack; got:\n%s", buf.String())
	}

	log := buf.String()
	if !strings.Contains(log, `"level":"ERROR"`) {
		t.Errorf("expected level=ERROR; got: %s", log)
	}
	if !strings.Contains(log, `"label"`) {
		t.Errorf("expected label attribute; got: %s", log)
	}
	if !strings.Contains(log, "my-worker") {
		t.Errorf("expected label value my-worker; got: %s", log)
	}
	if !strings.Contains(log, `"recover"`) {
		t.Errorf("expected recover attribute; got: %s", log)
	}
	if !strings.Contains(log, `"stack"`) {
		t.Errorf("expected stack attribute; got: %s", log)
	}
}

func TestGoWith_LabelIsSanitizedBeforeLogging(t *testing.T) {
	cases := []struct {
		name           string
		label          string
		forbiddenInLog string
		wantSubstring  string
	}{
		{
			name:  "newline injection",
			label: "worker\nINJECTED_MARKER",
			// If sanitizer is bypassed, the JSON encoder would escape \n as \\n
			// making "INJECTED_MARKER" appear on what looks like a separate log line.
			// After sanitization \n → ⏎, so the label value is "worker⏎INJECTED_MARKER".
			forbiddenInLog: "level\":\"ERROR\",\"msg\":\"INJECTED_MARKER",
			wantSubstring:  "⏎INJECTED_MARKER",
		},
		{
			name:           "carriage return injection",
			label:          "worker\rfake-msg",
			forbiddenInLog: "\r",
			wantSubstring:  "worker",
		},
		{
			name:           "null byte injection",
			label:          "worker\x00hidden",
			forbiddenInLog: "\x00",
			wantSubstring:  "worker",
		},
		{
			name:           "ANSI escape injection",
			label:          "worker\x1b[31mRED\x1b[0m",
			forbiddenInLog: "\x1b[31m",
			wantSubstring:  "worker",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			buf := newTestLogger(t)

			var wg sync.WaitGroup
			wg.Add(1)
			GoWith(tc.label, func() {
				defer wg.Done()
				panic("sanitize-test")
			})
			wg.Wait()

			if !waitForLog(buf, func(s string) bool {
				return strings.Contains(s, `"label"`)
			}) {
				t.Fatalf("log entry not written; got:\n%s", buf.String())
			}

			log := buf.String()
			if strings.Contains(log, tc.forbiddenInLog) {
				t.Errorf("raw injection payload %q must not appear in log; got:\n%s", tc.forbiddenInLog, log)
			}
			if !strings.Contains(log, tc.wantSubstring) {
				t.Errorf("sanitized substring %q must appear in log; got:\n%s", tc.wantSubstring, log)
			}
		})
	}
}
