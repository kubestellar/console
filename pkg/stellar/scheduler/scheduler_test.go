package scheduler

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

type schedulerTestStore struct {
	notifications []store.StellarNotification
	executions    []store.StellarExecution
	memoryEntries []*store.StellarMemoryEntry
}

func (s *schedulerTestStore) GetDueApprovedStellarActions(context.Context, time.Time, int) ([]store.StellarAction, error) {
	return nil, nil
}

func (s *schedulerTestStore) UpdateStellarActionStatus(context.Context, string, string, string, string) error {
	return nil
}

func (s *schedulerTestStore) CreateStellarNotification(context.Context, *store.StellarNotification) error {
	return nil
}

func (s *schedulerTestStore) ActionCompletedByIdempotencyKey(context.Context, string) bool {
	return false
}

func (s *schedulerTestStore) IncrementRetry(context.Context, string) error {
	return nil
}

func (s *schedulerTestStore) CreateStellarMemoryEntry(_ context.Context, entry *store.StellarMemoryEntry) error {
	s.memoryEntries = append(s.memoryEntries, entry)
	return nil
}

func (s *schedulerTestStore) GetNotificationsSince(context.Context, time.Time) ([]store.StellarNotification, error) {
	return s.notifications, nil
}

func (s *schedulerTestStore) GetExecutionsSince(context.Context, time.Time) ([]store.StellarExecution, error) {
	return s.executions, nil
}

type schedulerTestBroadcaster struct {
	events []BroadcastEvent
}

func (b *schedulerTestBroadcaster) Broadcast(event BroadcastEvent) {
	b.events = append(b.events, event)
}

func TestSanitizeError(t *testing.T) {
	t.Run("safe prefixes pass through", func(t *testing.T) {
		tests := []struct {
			name  string
			input error
			want  string
		}{
			{name: "context deadline exceeded", input: errors.New("context deadline exceeded while waiting for pod"), want: "context deadline exceeded while waiting for pod"},
			{name: "context canceled", input: errors.New("context canceled by caller"), want: "context canceled by caller"},
			{name: "not found", input: errors.New("not found: deployment missing"), want: "not found: deployment missing"},
			{name: "forbidden", input: errors.New("forbidden: user cannot patch deployments"), want: "forbidden: user cannot patch deployments"},
			{name: "unauthorized", input: errors.New("unauthorized: token expired"), want: "unauthorized: token expired"},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				got := sanitizeError(tt.input)
				if got != tt.want {
					t.Fatalf("sanitizeError() = %q, want %q", got, tt.want)
				}
			})
		}
	})

	t.Run("redacts urls", func(t *testing.T) {
		input := errors.New("Get https://10.0.0.1:6443/api/v1/namespaces/default/pods: dial tcp 10.0.0.1:6443: i/o timeout")
		got := sanitizeError(input)
		if strings.Contains(got, "https://10.0.0.1:6443") {
			t.Fatalf("sanitizeError() leaked URL: %q", got)
		}
		if !strings.Contains(got, "[redacted-url]") {
			t.Fatalf("sanitizeError() = %q, want redacted URL marker", got)
		}
	})

	t.Run("truncates long message", func(t *testing.T) {
		input := errors.New(strings.Repeat("x", 121))
		got := sanitizeError(input)
		want := strings.Repeat("x", 120) + "…"
		if got != want {
			t.Fatalf("sanitizeError() = %q, want %q", got, want)
		}
	})

	t.Run("empty error", func(t *testing.T) {
		if got := sanitizeError(errors.New("")); got != "" {
			t.Fatalf("sanitizeError() = %q, want empty string", got)
		}
	})
}

func TestTruncate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		max   int
		want  string
	}{
		{name: "equal to max", input: "abcd", max: 4, want: "abcd"},
		{name: "less than max", input: "abc", max: 4, want: "abc"},
		{name: "greater than max", input: "abcde", max: 4, want: "abcd..."},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncate(tt.input, tt.max)
			if got != tt.want {
				t.Fatalf("truncate() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNewConcurrency(t *testing.T) {
	tests := []struct {
		name        string
		concurrency []int
		want        int
	}{
		{name: "default", want: 3},
		{name: "custom", concurrency: []int{5}, want: 5},
		{name: "negative clamped", concurrency: []int{-1}, want: 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := New(nil, nil, tt.concurrency...)
			if got.concurrency != tt.want {
				t.Fatalf("New().concurrency = %d, want %d", got.concurrency, tt.want)
			}
		})
	}
}

func TestPtrRoundTrip(t *testing.T) {
	intValue := 42
	if got := ptr(intValue); got == nil || *got != intValue {
		t.Fatalf("ptr(int) = %v, want %d", got, intValue)
	}

	stringValue := "stellar"
	if got := ptr(stringValue); got == nil || *got != stringValue {
		t.Fatalf("ptr(string) = %v, want %q", got, stringValue)
	}
}

func TestPushScheduledDigestBroadcastsDigest(t *testing.T) {
	testStore := &schedulerTestStore{}
	broadcaster := &schedulerTestBroadcaster{}
	s := New(testStore, nil)
	s.registry = nil
	s.SetBroadcaster(broadcaster)

	s.pushScheduledDigest(context.Background())

	if len(testStore.memoryEntries) != 1 {
		t.Fatalf("CreateStellarMemoryEntry called %d times, want 1", len(testStore.memoryEntries))
	}

	entry := testStore.memoryEntries[0]
	if entry.Category != "digest" {
		t.Fatalf("memory entry category = %q, want %q", entry.Category, "digest")
	}
	if entry.Importance != 6 {
		t.Fatalf("memory entry importance = %d, want 6", entry.Importance)
	}
	if !strings.Contains(entry.Summary, "No notable events logged.") {
		t.Fatalf("memory entry summary = %q, want no-events message", entry.Summary)
	}
	if entry.ExpiresAt == nil {
		t.Fatal("memory entry expiry is nil")
	}

	if len(broadcaster.events) != 1 {
		t.Fatalf("Broadcast called %d times, want 1", len(broadcaster.events))
	}
	if broadcaster.events[0].Type != "digest" {
		t.Fatalf("broadcast event type = %q, want %q", broadcaster.events[0].Type, "digest")
	}

	payload, ok := broadcaster.events[0].Data.(map[string]string)
	if !ok {
		t.Fatalf("broadcast payload type = %T, want map[string]string", broadcaster.events[0].Data)
	}
	if payload["period"] != "last 24h" {
		t.Fatalf("broadcast period = %q, want %q", payload["period"], "last 24h")
	}
	if !strings.Contains(payload["content"], "No notable events logged.") {
		t.Fatalf("broadcast content = %q, want no-events message", payload["content"])
	}
}
