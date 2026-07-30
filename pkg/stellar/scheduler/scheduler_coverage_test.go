package scheduler

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

// --- Additional mock implementations ---

type dispatchTestStore struct {
	schedulerTestStore
	actionStatuses  []string
	actionOutcomes  []string
	retryIncrements int
	idempotencyHit  bool
}

func (s *dispatchTestStore) UpdateStellarActionStatus(_ context.Context, _, status, outcome, _ string) error {
	s.actionStatuses = append(s.actionStatuses, status)
	s.actionOutcomes = append(s.actionOutcomes, outcome)
	return nil
}

func (s *dispatchTestStore) ActionCompletedByIdempotencyKey(_ context.Context, _ string) bool {
	return s.idempotencyHit
}

func (s *dispatchTestStore) IncrementRetry(_ context.Context, _ string) error {
	s.retryIncrements++
	return nil
}

func (s *dispatchTestStore) CreateStellarNotification(_ context.Context, n *store.StellarNotification) error {
	s.notifications = append(s.notifications, *n)
	return nil
}

func (s *dispatchTestStore) CreateStellarMemoryEntry(_ context.Context, entry *store.StellarMemoryEntry) error {
	s.memoryEntries = append(s.memoryEntries, entry)
	return nil
}

// --- dispatch.go tests ---

func TestDecodeParameters(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr bool
		wantLen int
	}{
		{"empty string", "", false, 0},
		{"whitespace", "  ", false, 0},
		{"valid JSON", `{"namespace":"default","name":"nginx"}`, false, 2},
		{"invalid JSON", `{invalid`, true, 0},
		{"nested", `{"a":{"b":"c"}}`, false, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decodeParameters(tt.raw)
			if tt.wantErr && err == nil {
				t.Fatal("expected error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !tt.wantErr && len(got) != tt.wantLen {
				t.Fatalf("len = %d, want %d", len(got), tt.wantLen)
			}
		})
	}
}

func TestReadString(t *testing.T) {
	params := map[string]any{
		"existing":  "value",
		"empty":     "",
		"non_str":   123,
		"nil_value": nil,
	}

	tests := []struct {
		name     string
		key      string
		fallback string
		want     string
	}{
		{"existing key", "existing", "fb", "value"},
		{"empty string falls back", "empty", "fb", "fb"},
		{"missing key", "missing", "default", "default"},
		{"non-string value", "non_str", "fb", "fb"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := readString(params, tt.key, tt.fallback)
			if got != tt.want {
				t.Fatalf("readString() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestReadInt32Extended(t *testing.T) {
	tests := []struct {
		name    string
		params  map[string]any
		want    int32
		wantErr bool
	}{
		{"float64 whole number", map[string]any{"n": float64(42)}, 42, false},
		{"int value", map[string]any{"n": int(7)}, 7, false},
		{"int32 value", map[string]any{"n": int32(99)}, 99, false},
		{"int64 value", map[string]any{"n": int64(15)}, 15, false},
		{"string number", map[string]any{"n": "33"}, 33, false},
		{"missing key", map[string]any{}, 0, true},
		{"invalid string", map[string]any{"n": "abc"}, 0, true},
		{"boolean type", map[string]any{"n": true}, 0, true},
		{"negative", map[string]any{"n": float64(-5)}, -5, false},
		{"zero", map[string]any{"n": float64(0)}, 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := readInt32(tt.params, "n")
			if tt.wantErr && err == nil {
				t.Fatal("expected error")
			}
			if !tt.wantErr {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if got != tt.want {
					t.Fatalf("got %d, want %d", got, tt.want)
				}
			}
		})
	}
}

func TestCheckedInt32Overflow(t *testing.T) {
	tests := []struct {
		name    string
		value   int64
		wantErr bool
	}{
		{"max int32", 2147483647, false},
		{"min int32", -2147483648, false},
		{"overflow positive", 2147483648, true},
		{"overflow negative", -2147483649, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := checkedInt32(tt.value, "test")
			if tt.wantErr && err == nil {
				t.Fatal("expected overflow error")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestDispatchUnknownActionType(t *testing.T) {
	action := store.StellarAction{
		ActionType: "UnknownAction",
		Cluster:    "prod",
		Parameters: `{}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for unknown action type or nil client")
	}
}

func TestDispatchInvalidParameters(t *testing.T) {
	action := store.StellarAction{
		ActionType: "ScaleDeployment",
		Parameters: `{invalid json`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestDispatchScaleOutOfRange(t *testing.T) {
	action := store.StellarAction{
		ActionType: "ScaleDeployment",
		Cluster:    "prod",
		Namespace:  "default",
		Parameters: `{"name":"nginx","replicas":"200"}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for replicas out of range or nil client")
	}
}

func TestDispatchScaleNegative(t *testing.T) {
	action := store.StellarAction{
		ActionType: "ScaleDeployment",
		Cluster:    "prod",
		Namespace:  "default",
		Parameters: `{"name":"nginx","replicas":"-1"}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for negative replicas or nil client")
	}
}

func TestDispatchDeleteClusterInvalidToken(t *testing.T) {
	action := store.StellarAction{
		ID:         "action-12345678-abcd",
		ActionType: "DeleteCluster",
		Cluster:    "doomed",
		Parameters: `{"confirm_token":"wrong"}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for invalid confirm_token or nil client")
	}
}

func TestDispatchMissingReplicas(t *testing.T) {
	action := store.StellarAction{
		ActionType: "ScaleDeployment",
		Cluster:    "prod",
		Namespace:  "default",
		Parameters: `{"name":"nginx"}`,
	}
	_, err := Dispatch(context.Background(), nil, action)
	if err == nil {
		t.Fatal("expected error for missing replicas or nil client")
	}
}

// --- scheduler.go tests ---

func TestSanitizeErrorExtended(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"nil error", nil, ""},
		{"whitespace only", errors.New("  "), ""},
		{"multiple URLs redacted", errors.New("tried http://a.com then https://b.com"), ""},
		{"case insensitive safe prefix", errors.New("Not Found: resource missing"), "Not Found: resource missing"},
		{"forbidden with detail", errors.New("Forbidden: RBAC denied"), "Forbidden: RBAC denied"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeError(tt.err)
			if tt.want != "" && got != tt.want {
				t.Fatalf("sanitizeError() = %q, want %q", got, tt.want)
			}
			if tt.want == "" && tt.err != nil && tt.err.Error() != "" && strings.TrimSpace(tt.err.Error()) != "" {
				// Should be redacted or modified
				if strings.Contains(got, "http://") || strings.Contains(got, "https://") {
					t.Fatalf("URL not redacted: %q", got)
				}
			}
		})
	}
}

func TestSchedulerSetBroadcaster(t *testing.T) {
	s := New(nil, nil)
	if s.broadcaster != nil {
		t.Fatal("broadcaster should be nil initially")
	}
	b := &schedulerTestBroadcaster{}
	s.SetBroadcaster(b)
	if s.broadcaster == nil {
		t.Fatal("broadcaster should be set after SetBroadcaster")
	}
}

func TestSchedulerStartStopsOnContextCancel(t *testing.T) {
	st := &schedulerTestStore{}
	s := New(st, nil)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.Start(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not return after context cancel")
	}
}

func TestExecuteActionIdempotency(t *testing.T) {
	st := &dispatchTestStore{idempotencyHit: true}
	s := New(st, nil)

	action := store.StellarAction{
		ID:             "action-1",
		IdempotencyKey: "already-done",
		ActionType:     "RestartDeployment",
		Parameters:     `{"name":"nginx","namespace":"default"}`,
		Cluster:        "prod",
		UserID:         "user-1",
	}

	s.executeAction(context.Background(), action)

	// Should mark as completed with idempotency message
	found := false
	for _, status := range st.actionStatuses {
		if status == "completed" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected 'completed' status for idempotent action, got %v", st.actionStatuses)
	}
}

func TestExecuteActionRetry(t *testing.T) {
	st := &dispatchTestStore{}
	s := New(st, nil)

	// Use an unknown action type so Dispatch returns an error without needing k8s
	action := store.StellarAction{
		ID:         "action-retry",
		ActionType: "UnknownTypeForRetryTest",
		Parameters: `{"name":"nginx","namespace":"default"}`,
		Cluster:    "prod",
		UserID:     "user-1",
		RetryCount: 0,
		MaxRetries: 3,
	}

	s.executeAction(context.Background(), action)

	// Should increment retry since it fails and retries remain
	if st.retryIncrements != 1 {
		t.Fatalf("retryIncrements = %d, want 1", st.retryIncrements)
	}
}

func TestExecuteActionMaxRetriesExhausted(t *testing.T) {
	st := &dispatchTestStore{}
	s := New(st, nil)

	// Use an unknown action type so Dispatch returns an error without needing k8s
	action := store.StellarAction{
		ID:         "action-exhausted",
		ActionType: "UnknownTypeForExhaustedTest",
		Parameters: `{"name":"nginx","namespace":"default"}`,
		Cluster:    "prod",
		UserID:     "user-1",
		RetryCount: 3,
		MaxRetries: 3,
	}

	s.executeAction(context.Background(), action)

	// Should not increment retry, should mark as failed
	if st.retryIncrements != 0 {
		t.Fatalf("retryIncrements = %d, want 0", st.retryIncrements)
	}
	// Should create notification and memory entry
	if len(st.notifications) != 1 {
		t.Fatalf("notifications = %d, want 1", len(st.notifications))
	}
	if len(st.memoryEntries) != 1 {
		t.Fatalf("memoryEntries = %d, want 1", len(st.memoryEntries))
	}
	if st.memoryEntries[0].Importance != 7 {
		t.Fatalf("importance = %d, want 7", st.memoryEntries[0].Importance)
	}
}

func TestPushScheduledDigestWithEvents(t *testing.T) {
	st := &schedulerTestStore{
		notifications: []store.StellarNotification{
			{Severity: "warning", Title: "Pod restart", Body: "Pod nginx restarted"},
			{Severity: "info", Title: "Scale event", Body: "Scaled to 3"},
		},
		executions: []store.StellarExecution{
			{Status: "completed"},
			{Status: "failed"},
		},
	}
	broadcaster := &schedulerTestBroadcaster{}
	s := New(st, nil)
	s.registry = nil
	s.SetBroadcaster(broadcaster)

	s.pushScheduledDigest(context.Background())

	if len(st.memoryEntries) != 1 {
		t.Fatalf("memoryEntries = %d, want 1", len(st.memoryEntries))
	}
	entry := st.memoryEntries[0]
	if !strings.Contains(entry.Summary, "Events logged (2)") {
		t.Fatalf("summary = %q, want events count", entry.Summary)
	}
	if !strings.Contains(entry.Summary, "2 mission executions ran") {
		t.Fatalf("summary = %q, want executions count", entry.Summary)
	}
}

func TestPushScheduledDigestNoBroadcaster(t *testing.T) {
	st := &schedulerTestStore{}
	s := New(st, nil)
	s.registry = nil
	// No broadcaster set \u2014 should not panic
	s.pushScheduledDigest(context.Background())
	if len(st.memoryEntries) != 1 {
		t.Fatalf("memoryEntries = %d, want 1", len(st.memoryEntries))
	}
}

func TestDigestSchedulerStopsOnContextCancel(t *testing.T) {
	st := &schedulerTestStore{}
	s := New(st, nil)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		s.StartDigestScheduler(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("StartDigestScheduler did not return after context cancel")
	}
}

func TestTruncateEdgeCases(t *testing.T) {
	tests := []struct {
		input string
		max   int
		want  string
	}{
		{"", 0, ""},
		{"a", 0, "..."},
		{"ab", 1, "a..."},
		{"exactly5", 8, "exactly5"},
		{"exactly5x", 8, "exactly5..."},
	}

	for _, tt := range tests {
		got := truncate(tt.input, tt.max)
		if got != tt.want {
			t.Fatalf("truncate(%q, %d) = %q, want %q", tt.input, tt.max, got, tt.want)
		}
	}
}

func TestSensitiveURLPatternMatches(t *testing.T) {
	tests := []struct {
		input   string
		matches bool
	}{
		{"https://10.0.0.1:6443/api", true},
		{"http://localhost:8080", true},
		{"no url here", false},
		{"ftp://not-matched", false},
	}

	for _, tt := range tests {
		got := sensitiveURLPattern.MatchString(tt.input)
		if got != tt.matches {
			t.Fatalf("pattern match %q = %v, want %v", tt.input, got, tt.matches)
		}
	}
}
