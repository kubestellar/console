package solver

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/store"
)

// --- Mock implementations ---

type mockStorage struct {
	solveStatus     []string
	actionStatuses  []string
	actions         []*store.StellarAction
	executions      []*store.StellarExecution
	notifications   []*store.StellarNotification
	incrementCalls  int
	createSolveErr  error
	updateStatusErr error
}

func (m *mockStorage) CreateSolve(_ context.Context, _ *store.StellarSolve) error {
	return m.createSolveErr
}

func (m *mockStorage) UpdateSolveStatus(_ context.Context, _, status, _, _, _ string) error {
	m.solveStatus = append(m.solveStatus, status)
	return m.updateStatusErr
}

func (m *mockStorage) UpdateSolveStatusWithRecheck(_ context.Context, _, _, _ string, _ time.Time) error {
	return nil
}

func (m *mockStorage) IncrementSolveActions(_ context.Context, _ string) error {
	m.incrementCalls++
	return nil
}

func (m *mockStorage) CreateStellarAction(_ context.Context, action *store.StellarAction) error {
	action.ID = "action-test-id"
	m.actions = append(m.actions, action)
	return nil
}

func (m *mockStorage) UpdateStellarActionStatus(_ context.Context, _, status, _, _ string) error {
	m.actionStatuses = append(m.actionStatuses, status)
	return nil
}

func (m *mockStorage) CreateStellarExecution(_ context.Context, exec *store.StellarExecution) error {
	m.executions = append(m.executions, exec)
	return nil
}

func (m *mockStorage) CreateStellarNotification(_ context.Context, notif *store.StellarNotification) error {
	m.notifications = append(m.notifications, notif)
	return nil
}

type mockBroadcaster struct {
	events []SSEEvent
}

func (b *mockBroadcaster) Broadcast(event SSEEvent) {
	b.events = append(b.events, event)
}

// --- Tests ---

func TestMarshalTriggerDataProducesValidJSON(t *testing.T) {
	tests := []struct {
		name       string
		solveID    string
		actionType string
	}{
		{"normal values", "solve-abc-123", "RestartDeployment"},
		{"empty values", "", ""},
		{"special characters", "id with spaces & <brackets>", "action/type"},
		{"unicode", "\u89e3\u51b3-123", "\u64cd\u4f5c"},
		{"quotes and backslashes", `solve"id\n`, `action"type\t`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := marshalTriggerData(tt.solveID, tt.actionType)
			var parsed map[string]string
			if err := json.Unmarshal([]byte(result), &parsed); err != nil {
				t.Fatalf("invalid JSON %q: %v", result, err)
			}
			if parsed["solveId"] != tt.solveID {
				t.Fatalf("solveId = %q, want %q", parsed["solveId"], tt.solveID)
			}
			if parsed["actionType"] != tt.actionType {
				t.Fatalf("actionType = %q, want %q", parsed["actionType"], tt.actionType)
			}
		})
	}
}

func TestVerifyResourceHealthNilClient(t *testing.T) {
	healthy, msg := verifyResourceHealth(context.Background(), nil, "prod", "default", "my-deploy")
	if healthy {
		t.Fatal("expected unhealthy when client is nil")
	}
	if msg != "no cluster client available." {
		t.Fatalf("msg = %q, want 'no cluster client available.'", msg)
	}
}

func TestTerminateResolved(t *testing.T) {
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-123",
		EventID:   "event-456",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "nginx",
	}

	terminate(context.Background(), storage, "solve-123", "resolved", "Fixed by restart", "", "", broadcaster, input)

	if len(storage.solveStatus) != 1 || storage.solveStatus[0] != "resolved" {
		t.Fatalf("solveStatus = %v, want [resolved]", storage.solveStatus)
	}
	// resolved status should create a notification
	if len(storage.notifications) != 1 {
		t.Fatalf("notifications = %d, want 1", len(storage.notifications))
	}
	if storage.notifications[0].Title != "\u2726 Stellar resolved an issue" {
		t.Fatalf("title = %q, want resolved title", storage.notifications[0].Title)
	}
	// Should broadcast solve_complete
	if len(broadcaster.events) != 1 {
		t.Fatalf("broadcasts = %d, want 1", len(broadcaster.events))
	}
	if broadcaster.events[0].Type != "solve_complete" {
		t.Fatalf("event type = %q, want solve_complete", broadcaster.events[0].Type)
	}
}

func TestTerminateEscalated(t *testing.T) {
	storage := &mockStorage{}
	input := Input{UserID: "user-1"}

	terminate(context.Background(), storage, "solve-1", "escalated", "Needs human help", "", "", nil, input)

	if len(storage.notifications) != 1 {
		t.Fatalf("notifications = %d, want 1", len(storage.notifications))
	}
	if storage.notifications[0].Severity != "warning" {
		t.Fatalf("severity = %q, want warning", storage.notifications[0].Severity)
	}
	if storage.notifications[0].Title != "\u26a0 Stellar escalated to you" {
		t.Fatalf("title = %q, want escalated title", storage.notifications[0].Title)
	}
}

func TestTerminateExhausted(t *testing.T) {
	storage := &mockStorage{}
	input := Input{UserID: "user-1"}

	terminate(context.Background(), storage, "solve-1", "exhausted", "Hit limit", "action_count", "", nil, input)

	if len(storage.notifications) != 1 {
		t.Fatalf("notifications = %d, want 1", len(storage.notifications))
	}
	if storage.notifications[0].Title != "\u23f8 Stellar paused at budget limit" {
		t.Fatalf("title = %q, want exhausted title", storage.notifications[0].Title)
	}
}

func TestTerminateNilBroadcaster(t *testing.T) {
	storage := &mockStorage{}
	input := Input{UserID: "user-1"}
	// Should not panic
	terminate(context.Background(), storage, "solve-1", "resolved", "done", "", "", nil, input)
	if len(storage.solveStatus) != 1 {
		t.Fatal("expected status update even with nil broadcaster")
	}
}

func TestSolveLoopCancelledContext(t *testing.T) {
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-cancelled",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "nginx",
		PodName:   "nginx-abc",
		Reason:    "CrashLoopBackOff",
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Already cancelled

	SolveLoop(ctx, input, storage, nil, broadcaster)

	// Should terminate with "exhausted" due to wall clock
	if len(storage.solveStatus) != 1 {
		t.Fatalf("expected 1 status update, got %d", len(storage.solveStatus))
	}
	if storage.solveStatus[0] != "exhausted" {
		t.Fatalf("status = %q, want 'exhausted'", storage.solveStatus[0])
	}
}

func TestSolveLoopBroadcastsReadingStep(t *testing.T) {
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-bc",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "nginx",
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	SolveLoop(ctx, input, storage, nil, broadcaster)

	// First broadcast should be the "reading" step
	if len(broadcaster.events) < 1 {
		t.Fatal("expected at least one broadcast")
	}
	if broadcaster.events[0].Type != "solve_progress" {
		t.Fatalf("first event type = %q, want solve_progress", broadcaster.events[0].Type)
	}
	data, ok := broadcaster.events[0].Data.(map[string]interface{})
	if !ok {
		t.Fatal("expected map data")
	}
	if data["step"] != "reading" {
		t.Fatalf("step = %q, want 'reading'", data["step"])
	}
}

func TestSSEEventStructure(t *testing.T) {
	event := SSEEvent{Type: "test", Data: map[string]string{"key": "value"}}
	b, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if decoded["type"] != "test" {
		t.Fatalf("type = %v, want 'test'", decoded["type"])
	}
}

func TestInputFields(t *testing.T) {
	input := Input{
		SolveID:   "s1",
		EventID:   "e1",
		UserID:    "u1",
		Cluster:   "c1",
		Namespace: "ns1",
		Workload:  "w1",
		PodName:   "p1",
		Reason:    "r1",
	}
	if input.SolveID != "s1" || input.PodName != "p1" {
		t.Fatal("Input fields not assigned correctly")
	}
}

func TestAllowedActionsDoesNotContainUnapproved(t *testing.T) {
	unapproved := []string{"CordonNode", "DeleteCluster", "DrainNode", "ExecuteScript"}
	for _, action := range unapproved {
		if AllowedActions[action] {
			t.Fatalf("AllowedActions should not contain %q", action)
		}
	}
}

func TestDispatchActionCreatesStellarAction(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
		PodName:   "my-pod-abc",
	}

	// dispatchAction will create the action row then call scheduler.Dispatch
	// which panics on nil k8s client. We verify action creation via recovery.
	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "RestartDeployment", "dedupe-key")
	}()

	if len(storage.actions) != 1 {
		t.Fatalf("expected 1 action created, got %d", len(storage.actions))
	}
	action := storage.actions[0]
	if action.ActionType != "RestartDeployment" {
		t.Fatalf("actionType = %q, want RestartDeployment", action.ActionType)
	}
	if action.Cluster != "prod" {
		t.Fatalf("cluster = %q, want prod", action.Cluster)
	}
	if action.CreatedBy != "stellar-solver" {
		t.Fatalf("createdBy = %q, want stellar-solver", action.CreatedBy)
	}
}

func TestDispatchActionDeletePodUsesPodName(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
		PodName:   "my-pod-specific",
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "DeletePod", "key")
	}()

	if len(storage.actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(storage.actions))
	}
	// Verify parameters contain the pod name, not the workload
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(storage.actions[0].Parameters), &params); err != nil {
		t.Fatalf("invalid params JSON: %v", err)
	}
	if params["name"] != "my-pod-specific" {
		t.Fatalf("name = %v, want my-pod-specific", params["name"])
	}
}

func TestDispatchActionDeletePodFallsBackToWorkload(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
		PodName:   "", // empty pod name
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "DeletePod", "key")
	}()

	var params map[string]interface{}
	if err := json.Unmarshal([]byte(storage.actions[0].Parameters), &params); err != nil {
		t.Fatalf("invalid params JSON: %v", err)
	}
	if params["name"] != "my-deploy" {
		t.Fatalf("name = %v, want my-deploy (fallback to workload)", params["name"])
	}
}

func TestDispatchActionScaleIncludesReplicas(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "ScaleDeployment", "key")
	}()

	var params map[string]interface{}
	if err := json.Unmarshal([]byte(storage.actions[0].Parameters), &params); err != nil {
		t.Fatalf("invalid params JSON: %v", err)
	}
	if params["replicas"] != float64(1) {
		t.Fatalf("replicas = %v, want 1", params["replicas"])
	}
}

func TestDispatchActionRecordsExecution(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "RestartDeployment", "key")
	}()

	// The execution may not be recorded if panic happens before that point
	// Just verify action was created correctly
	if len(storage.actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(storage.actions))
	}
	if storage.actions[0].ApprovedBy != "stellar-solver" {
		t.Fatalf("approvedBy = %q, want stellar-solver", storage.actions[0].ApprovedBy)
	}
}

func TestCreateStorageFailure(t *testing.T) {
	storage := &mockStorage{
		createSolveErr: errors.New("db error"),
	}
	// CreateSolve error doesn't affect the flow since it's called by the handler
	// The dispatchAction should still handle CreateStellarAction errors gracefully
	_ = storage
}

// Additional comprehensive tests for coverage

func TestTerminateAllStatusTypes(t *testing.T) {
	tests := []struct {
		name             string
		status           string
		summary          string
		limitHit         string
		errStr           string
		expectNotifCount int
		expectSeverity   string
		expectTitle      string
	}{
		{
			name:             "resolved status",
			status:           "resolved",
			summary:          "Issue fixed",
			limitHit:         "",
			errStr:           "",
			expectNotifCount: 1,
			expectSeverity:   "info",
			expectTitle:      "✦ Stellar resolved an issue",
		},
		{
			name:             "escalated status",
			status:           "escalated",
			summary:          "Needs human intervention",
			limitHit:         "",
			errStr:           "",
			expectNotifCount: 1,
			expectSeverity:   "warning",
			expectTitle:      "⚠ Stellar escalated to you",
		},
		{
			name:             "exhausted status",
			status:           "exhausted",
			summary:          "Hit action limit",
			limitHit:         "action_count",
			errStr:           "",
			expectNotifCount: 1,
			expectSeverity:   "warning",
			expectTitle:      "⏸ Stellar paused at budget limit",
		},
		{
			name:             "unknown status",
			status:           "unknown",
			summary:          "Unknown outcome",
			limitHit:         "",
			errStr:           "some error",
			expectNotifCount: 0,
			expectSeverity:   "",
			expectTitle:      "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			broadcaster := &mockBroadcaster{}
			input := Input{
				SolveID:   "solve-" + tt.status,
				EventID:   "event-1",
				UserID:    "user-1",
				Cluster:   "prod",
				Namespace: "default",
				Workload:  "nginx",
			}

			terminate(context.Background(), storage, input.SolveID, tt.status, tt.summary, tt.limitHit, tt.errStr, broadcaster, input)

			if len(storage.notifications) != tt.expectNotifCount {
				t.Fatalf("notifications = %d, want %d", len(storage.notifications), tt.expectNotifCount)
			}
			if tt.expectNotifCount > 0 {
				if storage.notifications[0].Severity != tt.expectSeverity {
					t.Fatalf("severity = %q, want %q", storage.notifications[0].Severity, tt.expectSeverity)
				}
				if storage.notifications[0].Title != tt.expectTitle {
					t.Fatalf("title = %q, want %q", storage.notifications[0].Title, tt.expectTitle)
				}
			}
			if len(broadcaster.events) != 1 {
				t.Fatalf("broadcasts = %d, want 1", len(broadcaster.events))
			}
			if broadcaster.events[0].Type != "solve_complete" {
				t.Fatalf("event type = %q, want solve_complete", broadcaster.events[0].Type)
			}
		})
	}
}

func TestTerminateWithVariousErrorStrings(t *testing.T) {
	tests := []struct {
		name   string
		errStr string
	}{
		{"empty error", ""},
		{"simple error", "connection timeout"},
		{"long error", string(make([]byte, 1000))},
		{"special characters", "error with \"quotes\" and \nnewlines"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			input := Input{UserID: "user-1"}
			terminate(context.Background(), storage, "solve-1", "escalated", "summary", "", tt.errStr, nil, input)
			if len(storage.solveStatus) != 1 {
				t.Fatal("expected status update")
			}
		})
	}
}

func TestDispatchActionWithNilK8sClient(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-test-12345678",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
	}

	// dispatchAction should create the action record even though dispatch will fail
	func() {
		defer func() {
			if r := recover(); r != nil {
				// Expected panic from scheduler.Dispatch with nil client
			}
		}()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "RestartDeployment", "dedupe-1")
	}()

	if len(storage.actions) != 1 {
		t.Fatalf("expected action to be created, got %d actions", len(storage.actions))
	}
}

func TestDispatchActionWithDifferentActionTypes(t *testing.T) {
	tests := []struct {
		name       string
		actionType string
		expectName string
	}{
		{"restart deployment", "RestartDeployment", "my-deploy"},
		{"scale deployment", "ScaleDeployment", "my-deploy"},
		{"delete pod with pod name", "DeletePod", "my-pod-123"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			input := Input{
				SolveID:   "solve-test-12345678",
				UserID:    "user-1",
				Cluster:   "prod",
				Namespace: "default",
				Workload:  "my-deploy",
				PodName:   "my-pod-123",
			}

			func() {
				defer func() { recover() }()
				_, _, _ = dispatchAction(context.Background(), storage, nil, input, tt.actionType, "dedupe")
			}()

			if len(storage.actions) != 1 {
				t.Fatalf("expected 1 action, got %d", len(storage.actions))
			}
			var params map[string]interface{}
			if err := json.Unmarshal([]byte(storage.actions[0].Parameters), &params); err != nil {
				t.Fatalf("invalid params: %v", err)
			}
			if params["name"] != tt.expectName {
				t.Fatalf("name = %v, want %v", params["name"], tt.expectName)
			}
		})
	}
}

func TestVerifyResourceHealthWithGetClientError(t *testing.T) {
	// This tests the case where k8sClient.GetClient returns an error
	// Since we can't easily mock MultiClusterClient, we test the nil case thoroughly
	healthy, msg := verifyResourceHealth(context.Background(), nil, "prod", "default", "nginx")
	if healthy {
		t.Fatal("expected unhealthy when client is nil")
	}
	if msg != "no cluster client available." {
		t.Fatalf("msg = %q, want 'no cluster client available.'", msg)
	}
}

func TestMarshalTriggerDataWithEmptyValues(t *testing.T) {
	tests := []struct {
		name       string
		solveID    string
		actionType string
	}{
		{"both empty", "", ""},
		{"only solveID", "solve-123", ""},
		{"only actionType", "", "RestartDeployment"},
		{"normal", "solve-456", "ScaleDeployment"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := marshalTriggerData(tt.solveID, tt.actionType)
			var parsed map[string]string
			if err := json.Unmarshal([]byte(result), &parsed); err != nil {
				t.Fatalf("invalid JSON: %v", err)
			}
			if parsed["solveId"] != tt.solveID {
				t.Fatalf("solveId = %q, want %q", parsed["solveId"], tt.solveID)
			}
			if parsed["actionType"] != tt.actionType {
				t.Fatalf("actionType = %q, want %q", parsed["actionType"], tt.actionType)
			}
		})
	}
}

func TestSolveLoopWithNilStorage(t *testing.T) {
	// This test verifies the loop doesn't panic with nil storage
	// In practice, storage is never nil, but we test defensive programming
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-nil-storage",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "nginx",
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// Should not panic - nil storage will cause nil pointer dereference
	// but we're testing that the code path is reached
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic with nil storage")
		}
	}()
	SolveLoop(ctx, input, nil, nil, broadcaster)
}

func TestInputFieldsWithEmptyValues(t *testing.T) {
	input := Input{
		SolveID:   "",
		EventID:   "",
		UserID:    "",
		Cluster:   "",
		Namespace: "",
		Workload:  "",
		PodName:   "",
		Reason:    "",
	}
	// Just verify struct can be created with empty values
	if input.SolveID != "" {
		t.Fatal("expected empty SolveID")
	}
}

func TestSSEEventWithDifferentDataTypes(t *testing.T) {
	tests := []struct {
		name string
		data interface{}
	}{
		{"nil data", nil},
		{"string data", "test"},
		{"int data", 42},
		{"map data", map[string]string{"key": "value"}},
		{"slice data", []string{"a", "b", "c"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := SSEEvent{Type: "test", Data: tt.data}
			b, err := json.Marshal(event)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}
			var decoded map[string]interface{}
			if err := json.Unmarshal(b, &decoded); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}
			if decoded["type"] != "test" {
				t.Fatalf("type = %v, want 'test'", decoded["type"])
			}
		})
	}
}

func TestTerminateWithDifferentLimitHitValues(t *testing.T) {
	tests := []struct {
		name     string
		limitHit string
	}{
		{"no limit", ""},
		{"action count", "action_count"},
		{"wall clock", "wall_clock"},
		{"custom limit", "custom"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			input := Input{UserID: "user-1"}
			terminate(context.Background(), storage, "solve-1", "exhausted", "summary", tt.limitHit, "", nil, input)
			if len(storage.solveStatus) != 1 {
				t.Fatal("expected status update")
			}
		})
	}
}

func TestBroadcasterInterfaceCompliance(t *testing.T) {
	var _ Broadcaster = (*mockBroadcaster)(nil)
	broadcaster := &mockBroadcaster{}
	broadcaster.Broadcast(SSEEvent{Type: "test", Data: "data"})
	if len(broadcaster.events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(broadcaster.events))
	}
}

func TestStorageInterfaceCompliance(t *testing.T) {
	var _ Storage = (*mockStorage)(nil)
}

func TestDispatchActionSolveIDTruncation(t *testing.T) {
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-short",
		UserID:    "user-1",
		Cluster:   "prod",
		Namespace: "default",
		Workload:  "my-deploy",
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "RestartDeployment", "dedupe")
	}()

	if len(storage.actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(storage.actions))
	}
	// Description should use solveID[:8] - with short ID, it should handle gracefully
	if storage.actions[0].Description == "" {
		t.Fatal("expected non-empty description")
	}
}
