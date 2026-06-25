package k8s

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestCheckOperatorPod(t *testing.T) {
	tests := []struct {
		name       string
		pods       []corev1.Pod
		nodeName   string
		podPrefix  string
		wantPassed bool
		wantMsg    string
	}{
		{
			name: "Pod running successfully",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "gpu-feature-discovery-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodRunning,
						ContainerStatuses: []corev1.ContainerStatus{
							{
								Name:  "gfd",
								Ready: true,
								State: corev1.ContainerState{
									Running: &corev1.ContainerStateRunning{},
								},
							},
						},
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "gpu-feature-discovery",
			wantPassed: true,
			wantMsg:    "",
		},
		{
			name: "Pod in CrashLoopBackOff",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "nvidia-device-plugin-xyz",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodRunning,
						ContainerStatuses: []corev1.ContainerStatus{
							{
								Name:         "plugin",
								RestartCount: 50,
								State: corev1.ContainerState{
									Waiting: &corev1.ContainerStateWaiting{
										Reason: "CrashLoopBackOff",
									},
								},
							},
						},
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "nvidia-device-plugin",
			wantPassed: false,
			wantMsg:    "CrashLoopBackOff (50 restarts)",
		},
		{
			name: "Pod not running - ImagePullBackOff",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "dcgm-exporter-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodPending,
						ContainerStatuses: []corev1.ContainerStatus{
							{
								Name:         "dcgm",
								RestartCount: 5,
								State: corev1.ContainerState{
									Waiting: &corev1.ContainerStateWaiting{
										Reason: "ImagePullBackOff",
									},
								},
							},
						},
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "dcgm-exporter",
			wantPassed: false,
			wantMsg:    "ImagePullBackOff (5 restarts)",
		},
		{
			name: "Pod not running - no restart count",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "dcgm-exporter-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodPending,
						ContainerStatuses: []corev1.ContainerStatus{
							{
								Name:         "dcgm",
								RestartCount: 0,
								State: corev1.ContainerState{
									Waiting: &corev1.ContainerStateWaiting{
										Reason: "ContainerCreating",
									},
								},
							},
						},
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "dcgm-exporter",
			wantPassed: false,
			wantMsg:    "ContainerCreating",
		},
		{
			name: "Pod not running - no container status",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "dcgm-exporter-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase:             corev1.PodFailed,
						ContainerStatuses: []corev1.ContainerStatus{},
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "dcgm-exporter",
			wantPassed: false,
			wantMsg:    "Failed",
		},
		{
			name:       "Pod not found",
			pods:       []corev1.Pod{},
			nodeName:   "node-1",
			podPrefix:  "gpu-feature-discovery",
			wantPassed: true,
			wantMsg:    "not found (operator may not be installed)",
		},
		{
			name: "Pod on different node",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "gpu-feature-discovery-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-2",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodRunning,
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "gpu-feature-discovery",
			wantPassed: true,
			wantMsg:    "not found (operator may not be installed)",
		},
		{
			name: "Pod name doesn't match prefix",
			pods: []corev1.Pod{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "other-pod-abc",
					},
					Spec: corev1.PodSpec{
						NodeName: "node-1",
					},
					Status: corev1.PodStatus{
						Phase: corev1.PodRunning,
					},
				},
			},
			nodeName:   "node-1",
			podPrefix:  "gpu-feature-discovery",
			wantPassed: true,
			wantMsg:    "not found (operator may not be installed)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			check := checkOperatorPod(tt.pods, tt.nodeName, tt.podPrefix)
			assert.Equal(t, tt.podPrefix, check.Name)
			assert.Equal(t, tt.wantPassed, check.Passed)
			if tt.wantMsg != "" {
				assert.Contains(t, check.Message, tt.wantMsg)
			}
		})
	}
}

func TestIsStuckPod(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name     string
		pod      *corev1.Pod
		wantBool bool
	}{
		{
			name: "Normal running pod",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "normal-pod",
					CreationTimestamp: metav1.Time{Time: now.Add(-2 * time.Minute)},
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodRunning,
					ContainerStatuses: []corev1.ContainerStatus{
						{
							State: corev1.ContainerState{
								Running: &corev1.ContainerStateRunning{},
							},
						},
					},
				},
			},
			wantBool: false,
		},
		{
			name: "Pod with ContainerStatusUnknown",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "unknown-pod",
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodRunning,
					ContainerStatuses: []corev1.ContainerStatus{
						{
							State: corev1.ContainerState{
								Terminated: &corev1.ContainerStateTerminated{
									Reason: "ContainerStatusUnknown",
								},
							},
						},
					},
				},
			},
			wantBool: true,
		},
		{
			name: "Pod stuck in Terminating > 5 minutes",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "terminating-pod",
					DeletionTimestamp: &metav1.Time{Time: now.Add(-10 * time.Minute)},
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodRunning,
				},
			},
			wantBool: true,
		},
		{
			name: "Pod Terminating < 5 minutes",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "terminating-pod",
					DeletionTimestamp: &metav1.Time{Time: now.Add(-2 * time.Minute)},
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodRunning,
				},
			},
			wantBool: false,
		},
		{
			name: "Pod Pending > 10 minutes",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "pending-pod",
					CreationTimestamp: metav1.Time{Time: now.Add(-15 * time.Minute)},
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodPending,
				},
			},
			wantBool: true,
		},
		{
			name: "Pod Pending < 10 minutes",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "pending-pod",
					CreationTimestamp: metav1.Time{Time: now.Add(-5 * time.Minute)},
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodPending,
				},
			},
			wantBool: false,
		},
		{
			name: "Pod Succeeded",
			pod: &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name: "completed-pod",
				},
				Status: corev1.PodStatus{
					Phase: corev1.PodSucceeded,
				},
			},
			wantBool: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isStuckPod(tt.pod)
			assert.Equal(t, tt.wantBool, result)
		})
	}
}

func TestDeriveGPUNodeStatus_Comprehensive(t *testing.T) {
	tests := []struct {
		name     string
		checks   []GPUNodeHealthCheck
		expected string
	}{
		{
			name:     "All healthy - empty checks",
			checks:   []GPUNodeHealthCheck{},
			expected: "healthy",
		},
		{
			name: "All healthy - multiple checks pass",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "scheduling", Passed: true},
				{Name: "gpu-feature-discovery", Passed: true},
				{Name: "nvidia-device-plugin", Passed: true},
				{Name: "dcgm-exporter", Passed: true},
				{Name: "stuck_pods", Passed: true},
				{Name: "gpu_events", Passed: true},
			},
			expected: "healthy",
		},
		{
			name: "Critical fail - node_ready",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: false, Message: "Node is NotReady"},
				{Name: "scheduling", Passed: true},
			},
			expected: "unhealthy",
		},
		{
			name: "Critical fail - stuck_pods",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "stuck_pods", Passed: false, Message: "5 pods stuck"},
			},
			expected: "unhealthy",
		},
		{
			name: "Critical fail - gpu_events",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "gpu_events", Passed: false, Message: "GPU reset detected"},
			},
			expected: "unhealthy",
		},
		{
			name: "Multiple critical failures",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: false},
				{Name: "stuck_pods", Passed: false},
				{Name: "gpu_events", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Single non-critical failure - degraded",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "dcgm-exporter", Passed: false, Message: "CrashLoopBackOff"},
			},
			expected: "degraded",
		},
		{
			name: "Two non-critical failures - degraded",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "dcgm-exporter", Passed: false},
				{Name: "nvidia-device-plugin", Passed: false},
			},
			expected: "degraded",
		},
		{
			name: "Three non-critical failures - unhealthy",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "dcgm-exporter", Passed: false},
				{Name: "nvidia-device-plugin", Passed: false},
				{Name: "gpu-feature-discovery", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Four failures - unhealthy",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "dcgm-exporter", Passed: false},
				{Name: "nvidia-device-plugin", Passed: false},
				{Name: "gpu-feature-discovery", Passed: false},
				{Name: "scheduling", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Critical and non-critical failures combined",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: false},
				{Name: "dcgm-exporter", Passed: false},
			},
			expected: "unhealthy",
		},
		{
			name: "Scheduling failure only - degraded",
			checks: []GPUNodeHealthCheck{
				{Name: "node_ready", Passed: true},
				{Name: "scheduling", Passed: false, Message: "Node is cordoned"},
			},
			expected: "degraded",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := deriveGPUNodeStatus(tt.checks)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGPUOperatorNamespaces(t *testing.T) {
	expectedNamespaces := []string{
		"nvidia-gpu-operator",
		"gpu-operator",
		"nvidia-device-plugin",
		"kube-system",
	}

	assert.Equal(t, expectedNamespaces, gpuOperatorNamespaces)
	assert.Len(t, gpuOperatorNamespaces, 4)
}

func TestGPUHealthConstants(t *testing.T) {
	assert.Equal(t, "gpu-health-check", gpuHealthCronJobName)
	assert.Equal(t, "gpu-health-checker", gpuHealthServiceAccount)
	assert.Equal(t, "gpu-health-checker", gpuHealthClusterRole)
	assert.Equal(t, "gpu-health-checker", gpuHealthClusterRoleBinding)
	assert.Equal(t, "*/5 * * * *", gpuHealthDefaultSchedule)
	assert.Equal(t, "nvidia-gpu-operator", gpuHealthDefaultNS)
	assert.Equal(t, "gpu-health-results", gpuHealthConfigMapName)
	assert.Equal(t, 2, gpuHealthScriptVersion)
	assert.Equal(t, 2, gpuHealthDefaultTier)
	assert.NotEmpty(t, gpuHealthCheckerImage)
	assert.Contains(t, gpuHealthCheckerImage, "bitnami/kubectl")
	assert.Contains(t, gpuHealthCheckerImage, "@sha256:")
}

func TestCheckOperatorPod_MultipleContainers(t *testing.T) {
	pod := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "gpu-feature-discovery-abc",
		},
		Spec: corev1.PodSpec{
			NodeName: "node-1",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name:  "init-container",
					Ready: true,
					State: corev1.ContainerState{
						Running: &corev1.ContainerStateRunning{},
					},
				},
				{
					Name:         "gfd",
					Ready:        false,
					RestartCount: 10,
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "CrashLoopBackOff",
						},
					},
				},
			},
		},
	}

	check := checkOperatorPod([]corev1.Pod{pod}, "node-1", "gpu-feature-discovery")
	assert.False(t, check.Passed)
	assert.Contains(t, check.Message, "CrashLoopBackOff")
	assert.Contains(t, check.Message, "10 restarts")
}

func TestIsStuckPod_EdgeCases(t *testing.T) {
	now := time.Now()

	t.Run("Pod with no container statuses", func(t *testing.T) {
		pod := &corev1.Pod{
			Status: corev1.PodStatus{
				Phase:             corev1.PodRunning,
				ContainerStatuses: []corev1.ContainerStatus{},
			},
		}
		assert.False(t, isStuckPod(pod))
	})

	t.Run("Pod with multiple containers, one unknown", func(t *testing.T) {
		pod := &corev1.Pod{
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				ContainerStatuses: []corev1.ContainerStatus{
					{
						State: corev1.ContainerState{
							Running: &corev1.ContainerStateRunning{},
						},
					},
					{
						State: corev1.ContainerState{
							Terminated: &corev1.ContainerStateTerminated{
								Reason: "ContainerStatusUnknown",
							},
						},
					},
				},
			},
		}
		assert.True(t, isStuckPod(pod))
	})

	t.Run("Pod exactly at 5 minute termination boundary", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				DeletionTimestamp: &metav1.Time{Time: now.Add(-5 * time.Minute)},
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
			},
		}
		result := isStuckPod(pod)
		require.NotNil(t, result)
	})

	t.Run("Pod exactly at 10 minute pending boundary", func(t *testing.T) {
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				CreationTimestamp: metav1.Time{Time: now.Add(-10 * time.Minute)},
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodPending,
			},
		}
		result := isStuckPod(pod)
		require.NotNil(t, result)
	})
}
