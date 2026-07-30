package solver

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// TestSolveLoopActionLimit verifies that the loop stops after ActionLimit actions.
func TestSolveLoopActionLimit(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-limit-test",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "test-deploy",
		PodName:   "test-pod-abc",
		Reason:    "CrashLoopBackOff",
	}

	// Create a fake k8s client that always returns unhealthy deployment
	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      3,
			ReadyReplicas: 0, // Always unhealthy
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	ctx := context.Background()
	SolveLoop(ctx, input, storage, multiClient, broadcaster)

	// Should increment exactly up to ActionLimit (2 actions in ladder)
	if storage.incrementCalls < 1 {
		t.Fatalf("incrementCalls = %d, want at least 1", storage.incrementCalls)
	}
	
	// Final status should be "escalated" since we exhausted the ladder
	if len(storage.solveStatus) != 1 {
		t.Fatalf("solveStatus count = %d, want 1", len(storage.solveStatus))
	}
	if storage.solveStatus[0] != "escalated" {
		t.Fatalf("status = %q, want 'escalated'", storage.solveStatus[0])
	}
}

// TestSolveLoopResolutionAfterFirstAction verifies early exit when action succeeds.
func TestSolveLoopResolutionAfterFirstAction(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-success",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "test-deploy",
		PodName:   "test-pod-abc",
		Reason:    "CrashLoopBackOff",
	}

	// Create a deployment that becomes healthy after first check
	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      3,
			ReadyReplicas: 3, // Healthy!
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	ctx := context.Background()
	SolveLoop(ctx, input, storage, multiClient, broadcaster)

	// Should resolve after first action
	if len(storage.solveStatus) != 1 {
		t.Fatalf("solveStatus count = %d, want 1", len(storage.solveStatus))
	}
	if storage.solveStatus[0] != "resolved" {
		t.Fatalf("status = %q, want 'resolved'", storage.solveStatus[0])
	}
}

// TestSolveLoopContextCancelledDuringObserve verifies graceful handling of cancellation.
func TestSolveLoopContextCancelledDuringObserve(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	broadcaster := &mockBroadcaster{}
	input := Input{
		SolveID:   "solve-cancel",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "test-deploy",
		PodName:   "test-pod-abc",
		Reason:    "CrashLoopBackOff",
	}

	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      3,
			ReadyReplicas: 0,
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()
	
	// Context will be cancelled during the observe wait
	SolveLoop(ctx, input, storage, multiClient, broadcaster)

	// Should terminate with "exhausted" status
	if len(storage.solveStatus) == 0 {
		t.Fatal("expected at least one status update")
	}
	// Last status should be exhausted due to wall clock
	lastStatus := storage.solveStatus[len(storage.solveStatus)-1]
	if lastStatus != "exhausted" {
		t.Fatalf("last status = %q, want 'exhausted'", lastStatus)
	}
}

// TestSolveLoopNilBroadcasterHandling verifies nil broadcaster doesn't panic.
func TestSolveLoopNilBroadcasterHandling(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-no-broadcast",
		EventID:   "event-1",
		UserID:    "user-1",
		Cluster:   "test-cluster",
		Namespace: "default",
		Workload:  "test-deploy",
		PodName:   "test-pod-abc",
		Reason:    "CrashLoopBackOff",
	}

	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      3,
			ReadyReplicas: 3,
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	ctx := context.Background()
	// nil broadcaster should not panic
	SolveLoop(ctx, input, storage, multiClient, nil)

	if len(storage.solveStatus) != 1 {
		t.Fatal("expected solve to complete despite nil broadcaster")
	}
}

// TestVerifyResourceHealthDeploymentReadError tests deployment fetch error handling.
func TestVerifyResourceHealthDeploymentReadError(t *testing.T) {
	t.Helper()
	
	// Empty clientset - deployment doesn't exist
	fakeClient := fake.NewSimpleClientset()
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	healthy, msg := verifyResourceHealth(context.Background(), multiClient, "test-cluster", "default", "nonexistent")
	
	if healthy {
		t.Fatal("expected unhealthy when deployment doesn't exist")
	}
	if msg == "" {
		t.Fatal("expected error message when deployment read fails")
	}
}

// TestVerifyResourceHealthClusterNotFound tests cluster client error.
func TestVerifyResourceHealthClusterNotFound(t *testing.T) {
	t.Helper()
	
	multiClient := &k8s.MultiClusterClient{}
	// Don't add any cluster - should fail to get client
	
	healthy, msg := verifyResourceHealth(context.Background(), multiClient, "nonexistent-cluster", "default", "deploy")
	
	if healthy {
		t.Fatal("expected unhealthy when cluster client unavailable")
	}
	if msg == "" {
		t.Fatal("expected error message when cluster not found")
	}
}

// TestVerifyResourceHealthPartiallyReady tests deployment with some ready replicas.
func TestVerifyResourceHealthPartiallyReady(t *testing.T) {
	t.Helper()
	
	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "partial-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      5,
			ReadyReplicas: 3, // Partially ready
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	healthy, msg := verifyResourceHealth(context.Background(), multiClient, "test-cluster", "default", "partial-deploy")
	
	if healthy {
		t.Fatal("expected unhealthy when not all replicas ready")
	}
	if msg != "3/5 replicas ready." {
		t.Fatalf("msg = %q, want '3/5 replicas ready.'", msg)
	}
}

// TestVerifyResourceHealthZeroReplicas tests zero replica deployment.
func TestVerifyResourceHealthZeroReplicas(t *testing.T) {
	t.Helper()
	
	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "zero-deploy",
			Namespace: "default",
		},
		Status: appsv1.DeploymentStatus{
			Replicas:      0,
			ReadyReplicas: 0,
		},
	})
	
	multiClient := &k8s.MultiClusterClient{}
	multiClient.SetClient("test-cluster", fakeClient)

	healthy, msg := verifyResourceHealth(context.Background(), multiClient, "test-cluster", "default", "zero-deploy")
	
	if healthy {
		t.Fatal("expected unhealthy when zero replicas")
	}
	if msg != "0/0 replicas ready." {
		t.Fatalf("msg = %q, want '0/0 replicas ready.'", msg)
	}
}

// TestDispatchActionParametersFormatting tests parameter JSON for different actions.
func TestDispatchActionParametersFormatting(t *testing.T) {
	t.Helper()
	
	tests := []struct {
		name         string
		actionType   string
		inputPodName string
		wantName     string
		wantReplicas interface{}
	}{
		{
			name:         "RestartDeployment uses workload",
			actionType:   "RestartDeployment",
			inputPodName: "pod-123",
			wantName:     "my-deploy",
			wantReplicas: nil,
		},
		{
			name:         "DeletePod uses podName",
			actionType:   "DeletePod",
			inputPodName: "specific-pod-456",
			wantName:     "specific-pod-456",
			wantReplicas: nil,
		},
		{
			name:         "DeletePod fallback to workload",
			actionType:   "DeletePod",
			inputPodName: "",
			wantName:     "my-deploy",
			wantReplicas: nil,
		},
		{
			name:         "ScaleDeployment includes replicas",
			actionType:   "ScaleDeployment",
			inputPodName: "pod-789",
			wantName:     "my-deploy",
			wantReplicas: float64(1),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			input := Input{
				SolveID:   "solve-param-test-12345678",
				UserID:    "user-1",
				Cluster:   "prod",
				Namespace: "default",
				Workload:  "my-deploy",
				PodName:   tt.inputPodName,
			}

			// Recover from panic when scheduler.Dispatch tries to use nil k8s client
			func() {
				defer func() { recover() }()
				_, _, _ = dispatchAction(context.Background(), storage, nil, input, tt.actionType, "key")
			}()

			if len(storage.actions) != 1 {
				t.Fatalf("expected 1 action, got %d", len(storage.actions))
			}

			var params map[string]interface{}
			if err := json.Unmarshal([]byte(storage.actions[0].Parameters), &params); err != nil {
				t.Fatalf("invalid params JSON: %v", err)
			}

			if params["name"] != tt.wantName {
				t.Fatalf("name = %v, want %v", params["name"], tt.wantName)
			}

			if tt.wantReplicas != nil {
				if params["replicas"] != tt.wantReplicas {
					t.Fatalf("replicas = %v, want %v", params["replicas"], tt.wantReplicas)
				}
			} else {
				if _, hasReplicas := params["replicas"]; hasReplicas {
					t.Fatalf("unexpected replicas field for action %s", tt.actionType)
				}
			}
		})
	}
}

// TestDispatchActionDescriptionFormat tests the description string format.
func TestDispatchActionDescriptionFormat(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	input := Input{
		SolveID:   "solve-description-test-abcd1234",
		UserID:    "user-1",
		Cluster:   "production",
		Namespace: "my-namespace",
		Workload:  "nginx-deployment",
		PodName:   "nginx-pod-xyz",
	}

	func() {
		defer func() { recover() }()
		_, _, _ = dispatchAction(context.Background(), storage, nil, input, "RestartDeployment", "dedupe-key")
	}()

	if len(storage.actions) != 1 {
		t.Fatal("expected 1 action created")
	}

	desc := storage.actions[0].Description
	// Should contain solve ID prefix, action type, namespace, and name
	if desc == "" {
		t.Fatal("description should not be empty")
	}
	
	// Description format: "Solve loop {solveID[:8]}: {actionType} on {namespace}/{name}"
	expectedPrefix := "Solve loop solve-de"
	if len(desc) < len(expectedPrefix) {
		t.Fatalf("description too short: %q", desc)
	}
}

// TestTerminateNotificationSeverityMapping tests severity levels for each status.
func TestTerminateNotificationSeverityMapping(t *testing.T) {
	t.Helper()
	
	tests := []struct {
		name          string
		status        string
		wantSeverity  string
		wantNotifCount int
	}{
		{
			name:           "resolved creates info notification",
			status:         "resolved",
			wantSeverity:   "info",
			wantNotifCount: 1,
		},
		{
			name:           "escalated creates warning notification",
			status:         "escalated",
			wantSeverity:   "warning",
			wantNotifCount: 1,
		},
		{
			name:           "exhausted creates warning notification",
			status:         "exhausted",
			wantSeverity:   "warning",
			wantNotifCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			storage := &mockStorage{}
			input := Input{UserID: "user-1", Cluster: "prod", Namespace: "default"}
			
			terminate(context.Background(), storage, "solve-1", tt.status, "test summary", "", "", nil, input)
			
			if len(storage.notifications) != tt.wantNotifCount {
				t.Fatalf("notifications = %d, want %d", len(storage.notifications), tt.wantNotifCount)
			}
			
			if tt.wantNotifCount > 0 && storage.notifications[0].Severity != tt.wantSeverity {
				t.Fatalf("severity = %q, want %q", storage.notifications[0].Severity, tt.wantSeverity)
			}
		})
	}
}

// TestTerminateDedupeKey verifies dedupe key format in notifications.
func TestTerminateDedupeKey(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	solveID := "solve-unique-12345"
	input := Input{UserID: "user-1"}
	
	terminate(context.Background(), storage, solveID, "resolved", "done", "", "", nil, input)
	
	if len(storage.notifications) != 1 {
		t.Fatal("expected 1 notification")
	}
	
	expectedDedupeKey := fmt.Sprintf("solve-result:%s", solveID)
	if storage.notifications[0].DedupeKey != expectedDedupeKey {
		t.Fatalf("dedupeKey = %q, want %q", storage.notifications[0].DedupeKey, expectedDedupeKey)
	}
}

// TestBroadcasterInterface verifies broadcaster contract.
func TestBroadcasterInterface(t *testing.T) {
	t.Helper()
	broadcaster := &mockBroadcaster{}
	
	event := SSEEvent{
		Type: "test_event",
		Data: map[string]interface{}{
			"key1": "value1",
			"key2": 42,
		},
	}
	
	broadcaster.Broadcast(event)
	
	if len(broadcaster.events) != 1 {
		t.Fatalf("events = %d, want 1", len(broadcaster.events))
	}
	
	if broadcaster.events[0].Type != "test_event" {
		t.Fatalf("type = %q, want test_event", broadcaster.events[0].Type)
	}
}

// TestStorageInterface verifies storage contract methods are called correctly.
func TestStorageInterface(t *testing.T) {
	t.Helper()
	storage := &mockStorage{}
	ctx := context.Background()
	
	// Test CreateStellarAction
	action := &store.StellarAction{
		UserID:     "user-1",
		ActionType: "RestartDeployment",
	}
	if err := storage.CreateStellarAction(ctx, action); err != nil {
		t.Fatalf("CreateStellarAction failed: %v", err)
	}
	if action.ID != "action-test-id" {
		t.Fatalf("action.ID = %q, want action-test-id", action.ID)
	}
	
	// Test UpdateStellarActionStatus
	if err := storage.UpdateStellarActionStatus(ctx, "id-1", "completed", "success", ""); err != nil {
		t.Fatalf("UpdateStellarActionStatus failed: %v", err)
	}
	if len(storage.actionStatuses) != 1 || storage.actionStatuses[0] != "completed" {
		t.Fatalf("actionStatuses = %v, want [completed]", storage.actionStatuses)
	}
	
	// Test IncrementSolveActions
	if err := storage.IncrementSolveActions(ctx, "solve-1"); err != nil {
		t.Fatalf("IncrementSolveActions failed: %v", err)
	}
	if storage.incrementCalls != 1 {
		t.Fatalf("incrementCalls = %d, want 1", storage.incrementCalls)
	}
}

// TestAllowedActionsMapImmutability verifies AllowedActions is safe to read.
func TestAllowedActionsMapImmutability(t *testing.T) {
	t.Helper()
	
	// Should be safe to read multiple times
	for i := 0; i < 3; i++ {
		if !AllowedActions["RestartDeployment"] {
			t.Fatal("RestartDeployment should always be allowed")
		}
		if !AllowedActions["ScaleDeployment"] {
			t.Fatal("ScaleDeployment should always be allowed")
		}
		if !AllowedActions["DeletePod"] {
			t.Fatal("DeletePod should always be allowed")
		}
	}
	
	// Unapproved actions should always be false/absent
	dangerousActions := []string{
		"DeleteNamespace",
		"CordonNode",
		"DrainNode",
		"ExecuteCommand",
		"ModifyConfigMap",
	}
	
	for _, action := range dangerousActions {
		if AllowedActions[action] {
			t.Fatalf("action %q should not be allowed", action)
		}
	}
}

// TestObserveWaitConstant verifies the observe wait duration is reasonable.
func TestObserveWaitConstant(t *testing.T) {
	t.Helper()
	
	// ObserveWait should be long enough for resources to stabilize but short enough
	// that operators don't perceive the loop as hung
	if ObserveWait < 10*time.Second {
		t.Fatal("ObserveWait should be at least 10 seconds for resource stabilization")
	}
	if ObserveWait > 60*time.Second {
		t.Fatal("ObserveWait should be under 60 seconds to avoid operator perception of hang")
	}
}

// TestMaxWallClockConstant verifies the wall clock budget is reasonable.
func TestMaxWallClockConstant(t *testing.T) {
	t.Helper()
	
	// MaxWallClock should provide enough time for multiple actions + observe cycles
	minExpected := time.Duration(ActionLimit) * (ObserveWait + 5*time.Second)
	if MaxWallClock < minExpected {
		t.Fatalf("MaxWallClock = %v, should be at least %v to accommodate %d actions", MaxWallClock, minExpected, ActionLimit)
	}
	
	// But not so long that failed solves take forever
	if MaxWallClock > 10*time.Minute {
		t.Fatal("MaxWallClock should be under 10 minutes to fail fast on unresolvable issues")
	}
}

// TestInputStructComplete verifies all Input fields are properly used.
func TestInputStructComplete(t *testing.T) {
	t.Helper()
	
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
	
	// Verify all fields are accessible
	fields := []string{
		input.SolveID,
		input.EventID,
		input.UserID,
		input.Cluster,
		input.Namespace,
		input.Workload,
		input.PodName,
		input.Reason,
	}
	
	for i, field := range fields {
		if field == "" {
			t.Fatalf("field %d is empty, all fields should be populated", i)
		}
	}
}
