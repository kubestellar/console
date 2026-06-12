package k8s

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	authorizationv1 "k8s.io/api/authorization/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sruntime "k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	clientgotesting "k8s.io/client-go/testing"
)

func TestGetGPUNodes(t *testing.T) {
	ctx := context.Background()
	m := &MultiClusterClient{}

	// Case 1: Simple NVIDIA GPU Node
	node1 := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node-1",
			Labels: map[string]string{
				"nvidia.com/gpu.product": "Tesla T4",
				"nvidia.com/gpu.family":  "turing",
				"nvidia.com/gpu.memory":  "15360",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("2"),
			},
		},
	}

	// Pod requesting GPU on node-1
	pod1 := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "gpu-pod-1",
			Namespace: "default",
		},
		Spec: corev1.PodSpec{
			NodeName: "node-1",
			Containers: []corev1.Container{
				{
					Name: "gpu-container",
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							"nvidia.com/gpu": resource.MustParse("1"),
						},
					},
				},
			},
		},
	}

	// Case 2: Intel Gaudi Node
	node2 := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node-2",
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"habana.ai/gaudi2": resource.MustParse("8"),
			},
		},
	}

	fakeClient := fake.NewSimpleClientset(node1, node2, pod1)
	m.InjectClient("test-cluster", fakeClient)

	gpuNodes, err := m.GetGPUNodes(ctx, "test-cluster")
	require.NoError(t, err)
	assert.Len(t, gpuNodes, 2)

	// Verify Node 1 (NVIDIA)
	var n1 GPUNode
	for _, n := range gpuNodes {
		if n.Name == "node-1" {
			n1 = n
		}
	}
	assert.Equal(t, "Tesla T4", n1.GPUType)
	assert.Equal(t, 2, n1.GPUCount)
	assert.Equal(t, 1, n1.GPUAllocated)
	assert.Equal(t, AcceleratorGPU, n1.AcceleratorType)
	assert.Equal(t, 15360, n1.GPUMemoryMB)
	assert.Equal(t, "turing", n1.GPUFamily)
	assert.Equal(t, "NVIDIA", n1.Manufacturer)

	// Verify Node 2 (Gaudi)
	var n2 GPUNode
	for _, n := range gpuNodes {
		if n.Name == "node-2" {
			n2 = n
		}
	}
	assert.Equal(t, "Intel Gaudi2", n2.GPUType)
	assert.Equal(t, 8, n2.GPUCount)
	assert.Equal(t, AcceleratorGPU, n2.AcceleratorType)
	assert.Equal(t, "Intel", n2.Manufacturer)
}

func TestGetGPUNodeHealth(t *testing.T) {
	ctx := context.Background()
	m := &MultiClusterClient{}

	oneHourAgo := time.Now().Add(-1 * time.Hour)

	// Node with issues
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "bad-node",
		},
		Spec: corev1.NodeSpec{
			Unschedulable: true,
		},
		Status: corev1.NodeStatus{
			Conditions: []corev1.NodeCondition{
				{
					Type:    corev1.NodeReady,
					Status:  corev1.ConditionFalse,
					Message: "Kubelet stopped posting node status.",
				},
			},
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("1"),
			},
		},
	}

	// Operator pod in CrashLoopBackOff
	gfdPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "gpu-feature-discovery-abc",
			Namespace: "nvidia-gpu-operator",
			Labels:    map[string]string{"app": "gpu-feature-discovery"},
		},
		Spec: corev1.PodSpec{
			NodeName: "bad-node",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name:         "gfd",
					RestartCount: 50,
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "CrashLoopBackOff",
						},
					},
				},
			},
		},
	}

	// Stuck pod (Pending for 20 mins)
	stuckPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "stuck-pod",
			Namespace:         "default",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-20 * time.Minute)},
		},
		Spec: corev1.PodSpec{
			NodeName: "bad-node",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
		},
	}

	// GPU Reset Event
	event := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "gpu-reset-event",
			Namespace: "default",
		},
		InvolvedObject: corev1.ObjectReference{
			Name: "bad-node",
		},
		Type:          "Warning",
		Message:       "GPU 0 xid error 12",
		LastTimestamp: metav1.Time{Time: time.Now()},
	}

	fakeClient := fake.NewSimpleClientset(node, gfdPod, stuckPod, event)
	m.InjectClient("test-cluster", fakeClient)

	health, err := m.GetGPUNodeHealth(ctx, "test-cluster")
	require.NoError(t, err)
	require.Len(t, health, 1)

	h := health[0]
	assert.Equal(t, "bad-node", h.NodeName)
	assert.Equal(t, "unhealthy", h.Status)
	assert.Equal(t, 1, h.StuckPods)

	// Check individual checks
	checks := make(map[string]GPUNodeHealthCheck)
	for _, c := range h.Checks {
		checks[c.Name] = c
	}

	assert.False(t, checks["node_ready"].Passed)
	assert.Equal(t, "Kubelet stopped posting node status.", checks["node_ready"].Message)

	assert.False(t, checks["scheduling"].Passed)

	assert.False(t, checks["gpu-feature-discovery"].Passed)
	assert.Contains(t, checks["gpu-feature-discovery"].Message, "CrashLoopBackOff")

	assert.False(t, checks["stuck_pods"].Passed)
	assert.False(t, checks["gpu_events"].Passed)

	// Test case where events are old (should be ignored)
	event.LastTimestamp = metav1.Time{Time: oneHourAgo.Add(-10 * time.Minute)}
	event.EventTime = metav1.MicroTime{Time: oneHourAgo.Add(-10 * time.Minute)}
	fakeClient = fake.NewSimpleClientset(node, gfdPod, stuckPod, event)
	m.InjectClient("test-cluster-old-events", fakeClient)
	health, err = m.GetGPUNodeHealth(ctx, "test-cluster-old-events")
	require.NoError(t, err)
	require.Len(t, health, 1)
	for _, c := range health[0].Checks {
		if c.Name == "gpu_events" {
			assert.True(t, c.Passed, "Old events should be ignored")
		}
	}
}

func TestGPUHealthCronJobReconciliation(t *testing.T) {
	ctx := context.Background()
	m := &MultiClusterClient{}

	ns := "nvidia-gpu-operator"

	// Existing CronJob with OLD version
	oldCJ := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthCronJobName,
			Namespace: ns,
			Labels: map[string]string{
				"kubestellar-console/script-version": "1",
				"kubestellar-console/tier":           "1",
			},
		},
		Spec: batchv1.CronJobSpec{
			Schedule: "*/5 * * * *",
		},
	}

	// Results ConfigMap
	results := map[string]interface{}{
		"nodes": []map[string]interface{}{
			{
				"nodeName": "node-1",
				"status":   "healthy",
				"checks": []map[string]interface{}{
					{"name": "test", "passed": true},
				},
			},
		},
	}
	resultsJSON, _ := json.Marshal(results)
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      gpuHealthConfigMapName,
			Namespace: ns,
		},
		Data: map[string]string{
			"results": string(resultsJSON),
		},
	}

	fakeClient := fake.NewSimpleClientset(oldCJ, cm)

	// Mock RBAC allowed for install
	fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action clientgotesting.Action) (handled bool, ret k8sruntime.Object, err error) {
		return true, &authorizationv1.SelfSubjectAccessReview{
			Status: authorizationv1.SubjectAccessReviewStatus{Allowed: true},
		}, nil
	})

	m.InjectClient("test-cluster", fakeClient)

	// This should trigger auto-reconcile because version 1 < gpuHealthScriptVersion (2)
	status, err := m.GetGPUHealthCronJobStatus(ctx, "test-cluster")
	require.NoError(t, err)
	assert.True(t, status.Installed)
	assert.False(t, status.UpdateAvailable, "Should have been auto-updated")
	assert.Equal(t, gpuHealthScriptVersion, status.Version)
	assert.Len(t, status.LastResults, 1)
	assert.Equal(t, "node-1", status.LastResults[0].NodeName)

	// Verify CronJob was actually updated in the fake client
	updatedCJ, err := fakeClient.BatchV1().CronJobs(ns).Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
	require.NoError(t, err)
	require.NotNil(t, updatedCJ)
	assert.Equal(t, "2", updatedCJ.Labels["kubestellar-console/script-version"])
}

func TestInstallGPUHealthCronJob(t *testing.T) {
	ctx := context.Background()
	m := &MultiClusterClient{}
	fakeClient := fake.NewSimpleClientset()
	m.InjectClient("test-cluster", fakeClient)

	err := m.InstallGPUHealthCronJob(ctx, "test-cluster", "test-ns", "0 * * * *", 3)
	require.NoError(t, err)

	// Check namespace
	_, err = fakeClient.CoreV1().Namespaces().Get(ctx, "test-ns", metav1.GetOptions{})
	assert.NoError(t, err)

	// Check ServiceAccount
	_, err = fakeClient.CoreV1().ServiceAccounts("test-ns").Get(ctx, gpuHealthServiceAccount, metav1.GetOptions{})
	assert.NoError(t, err)

	// Check ClusterRole (tiered rules)
	cr, err := fakeClient.RbacV1().ClusterRoles().Get(ctx, gpuHealthClusterRole, metav1.GetOptions{})
	assert.NoError(t, err)
	// Tier 3 should have batch jobs permission
	hasBatchJobs := false
	for _, rule := range cr.Rules {
		for _, g := range rule.APIGroups {
			if g == "batch" {
				for _, r := range rule.Resources {
					if r == "jobs" {
						hasBatchJobs = true
					}
				}
			}
		}
	}
	assert.True(t, hasBatchJobs)

	// Check CronJob
	cj, err := fakeClient.BatchV1().CronJobs("test-ns").Get(ctx, gpuHealthCronJobName, metav1.GetOptions{})
	assert.NoError(t, err)
	assert.Equal(t, "0 * * * *", cj.Spec.Schedule)
	assert.Equal(t, "3", cj.Labels["kubestellar-console/tier"])
}

func TestDeriveGPUNodeStatus(t *testing.T) {
	tests := []struct {
		name     string
		checks   []GPUNodeHealthCheck
		expected string
	}{
		{
			name: "All pass",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "stuck_pods", Passed: true},
			},
			expected: "healthy",
		},
		{
			name: "Critical fail - node_ready",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Critical fail - stuck_pods",
			checks: []GPUNodeHealthCheck{
				{Name: "stuck_pods", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Critical fail - gpu_events",
			checks: []GPUNodeHealthCheck{
				{Name: "gpu_events", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Non-critical fail",
			checks: []GPUNodeHealthCheck{
				{Name: "dcgm-exporter", Passed: false},
			},
			expected: "degraded",
		},
		{
			name: "Multiple non-critical fails",
			checks: []GPUNodeHealthCheck{
				{Name: "dcgm-exporter", Passed: false},
				{Name: "nvidia-device-plugin", Passed: false},
				{Name: "gpu-feature-discovery", Passed: false},
			},
			expected: "unhealthy",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, deriveGPUNodeStatus(tt.checks))
		})
	}
}
