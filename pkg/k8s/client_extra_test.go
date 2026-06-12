package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

func TestFindPodIssues(t *testing.T) {
	now := time.Now()

	createPod := func(name string) *corev1.Pod {
		return &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:              name,
				Namespace:         "default",
				CreationTimestamp: metav1.Time{Time: now.Add(-10 * time.Minute)},
			},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "c1", Image: "img"}},
			},
			Status: corev1.PodStatus{Phase: corev1.PodRunning},
		}
	}

	tests := []struct {
		name          string
		pod           *corev1.Pod
		expectedCount int
		validate      func(*testing.T, PodIssue)
	}{
		{
			name: "Healthy Pod",
			pod: func() *corev1.Pod {
				p := createPod("healthy")
				p.Status.ContainerStatuses = []corev1.ContainerStatus{
					{Name: "c1", Ready: true, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{StartedAt: metav1.Time{Time: now.Add(-10 * time.Minute)}}}},
				}
				return p
			}(),
			expectedCount: 0,
		},
		{
			name: "CrashLoopBackOff",
			pod: func() *corev1.Pod {
				p := createPod("crash")
				p.Status.ContainerStatuses = []corev1.ContainerStatus{
					{
						Name: "c1",
						State: corev1.ContainerState{
							Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"},
						},
						RestartCount: 5,
					},
				}
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if i.Status != "CrashLoopBackOff" {
					t.Errorf("expected status CrashLoopBackOff, got %s", i.Status)
				}
				if len(i.Issues) == 0 {
					t.Fatal("expected at least one issue")
				}
				if i.Issues[0] != "CrashLoopBackOff" {
					t.Errorf("expected issue CrashLoopBackOff, got %s", i.Issues[0])
				}
			},
		},
		{
			name: "Init Container OOMKilled",
			pod: func() *corev1.Pod {
				p := createPod("init-oom")
				p.Status.InitContainerStatuses = []corev1.ContainerStatus{
					{
						Name: "init",
						LastTerminationState: corev1.ContainerState{
							Terminated: &corev1.ContainerStateTerminated{Reason: "OOMKilled", ExitCode: 137},
						},
					},
				}
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				found := false
				for _, iss := range i.Issues {
					if iss == "Init:OOMKilled" {
						found = true
						break
					}
				}
				if !found {
					t.Error("expected Init:OOMKilled issue")
				}
			},
		},
		{
			name: "Container Terminated Error",
			pod: func() *corev1.Pod {
				p := createPod("term-err")
				p.Status.ContainerStatuses = []corev1.ContainerStatus{
					{
						Name: "c1",
						State: corev1.ContainerState{
							Terminated: &corev1.ContainerStateTerminated{Reason: "Error", ExitCode: 1},
						},
					},
				}
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if i.Status != "Error" {
					t.Errorf("expected status Error, got %s", i.Status)
				}
			},
		},
		{
			name: "Scheduled False",
			pod: func() *corev1.Pod {
				p := createPod("unschedulable")
				p.Status.Phase = corev1.PodPending
				p.Status.Conditions = []corev1.PodCondition{
					{Type: corev1.PodScheduled, Status: corev1.ConditionFalse, Reason: "Unschedulable", Message: "No nodes available"},
				}
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if i.Status != "Unschedulable" {
					t.Errorf("expected status Unschedulable, got %s", i.Status)
				}
			},
		},
		{
			name: "Pending too long",
			pod: func() *corev1.Pod {
				p := createPod("pending")
				p.Status.Phase = corev1.PodPending
				// Created 10 min ago (default in createPod)
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if len(i.Issues) == 0 {
					t.Fatal("expected at least one issue")
				}
				if i.Issues[0] != "Pending" {
					t.Errorf("expected Pending issue, got %s", i.Issues[0])
				}
			},
		},
		{
			name: "Deleting Stuck",
			pod: func() *corev1.Pod {
				p := createPod("stuck-delete")
				delTime := metav1.Time{Time: now.Add(-10 * time.Minute)}
				p.DeletionTimestamp = &delTime
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if i.Status != "Terminating" {
					t.Errorf("expected status Terminating, got %s", i.Status)
				}
			},
		},
		{
			name: "High Restarts",
			pod: func() *corev1.Pod {
				p := createPod("restarts")
				p.Status.ContainerStatuses = []corev1.ContainerStatus{
					{Name: "c1", Ready: true, RestartCount: 10, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{StartedAt: metav1.Time{Time: now}}}},
				}
				return p
			}(),
			expectedCount: 1,
			validate: func(t *testing.T, i PodIssue) {
				if i.Restarts != 10 {
					t.Errorf("expected 10 restarts, got %d", i.Restarts)
				}
				// High restarts check
				found := false
				for _, iss := range i.Issues {
					if iss == "High restarts (10)" {
						found = true
						break
					}
				}
				if !found {
					t.Error("expected High restarts issue")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, _ := NewMultiClusterClient("")
			fakeCS := k8sfake.NewSimpleClientset(tt.pod)
			m.clients["c1"] = fakeCS

			issues, err := m.FindPodIssues(context.Background(), "c1", "default")
			if err != nil {
				t.Fatalf("FindPodIssues failed: %v", err)
			}

			if len(issues) != tt.expectedCount {
				t.Errorf("expected %d issues, got %d", tt.expectedCount, len(issues))
			}
			if tt.validate != nil && len(issues) > 0 {
				tt.validate(t, issues[0])
			}
		})
	}
}

func TestGetClient_Errors(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Test missing client
	_, err := m.GetClient("unknown")
	if err == nil {
		t.Error("Expected error for unknown client, got nil")
	}

	_, err = m.GetDynamicClient("unknown")
	if err == nil {
		t.Error("Expected error for unknown dynamic client, got nil")
	}
}

func TestNewMultiClusterClient_WithConfig(t *testing.T) {
	m, err := NewMultiClusterClient("invalid-path-that-does-not-exist")
	// Should not error, just returns empty
	if err != nil {
		t.Fatalf("NewMultiClusterClient failed: %v", err)
	}
	if len(m.clients) != 0 {
		t.Error("Expected empty clients")
	}
}

// Test Reload to cover config loading branches (not concurrency)
func TestReload_InvalidPath(t *testing.T) {
	m := &MultiClusterClient{
		kubeconfig: "invalid/path",
	}
	// Just ensure it returns error and doesn't panic
	err := m.Reload()
	if err == nil {
		t.Error("Expected error for invalid path, got nil")
	}
}

func TestGetClient_InCluster(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Simulate in-cluster config
	m.inClusterConfig = &rest.Config{Host: "https://10.96.0.1"}

	// Should return client for "in-cluster" context
	client, err := m.GetClient("in-cluster")
	if err != nil {
		t.Fatalf("GetClient(in-cluster) failed: %v", err)
	}
	if client == nil {
		t.Fatal("Expected client, got nil")
	}

	// Verify it was cached
	m.mu.RLock()
	if _, ok := m.configs["in-cluster"]; !ok {
		t.Error("Config was not cached")
	}
	m.mu.RUnlock()
}

func TestGetDynamicClient_InCluster_Legacy(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Simulate in-cluster config
	m.inClusterConfig = &rest.Config{Host: "https://10.96.0.1"}

	// Should return client for "in-cluster" context
	client, err := m.GetDynamicClient("in-cluster")
	if err != nil {
		t.Fatalf("GetDynamicClient(in-cluster) failed: %v", err)
	}
	if client == nil {
		t.Fatal("Expected client, got nil")
	}
}

func TestGetRestConfig(t *testing.T) {
	m, _ := NewMultiClusterClient("")

	// Inject a client first effectively mocking a "loaded" state if we could,
	// but GetRestConfig calls GetClient first.
	// So we simulate in-cluster to make GetClient succeed without real kubeconfig.
	m.inClusterConfig = &rest.Config{Host: "https://10.96.0.1"}

	cfg, err := m.GetRestConfig("in-cluster")
	if err != nil {
		t.Fatalf("GetRestConfig failed: %v", err)
	}
	if cfg.Host != "https://10.96.0.1" {
		t.Errorf("Expected host https://10.96.0.1, got %s", cfg.Host)
	}

	// Test missing config logic (hard to trigger if GetClient succeeds, but maybe if we cheat lock?)
	// Actually GetClient populates it.

	// Test invalid context logic
	_, err = m.GetRestConfig("invalid")
	if err == nil {
		t.Error("Expected error for invalid context")
	}
}
