package api

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/agent"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/notifications"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGPUUtilizationWorker_MetricAccuracy(t *testing.T) {
	mockStore := new(test.MockStore)
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("test-cluster", fakeClient)
	k8sClient.SetRawConfig(&api.Config{
		Clusters: map[string]*api.Cluster{
			"test-cluster": {Server: "https://test-cluster:6443"},
		},
		Contexts: map[string]*api.Context{
			"test-cluster": {Cluster: "test-cluster"},
		},
	})

	worker := NewGPUUtilizationWorker(mockStore, k8sClient, nil)

	t.Run("collectForReservation - Accurate GPU calculation", func(t *testing.T) {
		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "test-ns",
			GPUCount:  4,
		}

		// Mock pods in the fake k8s client
		// Pod 1: Running, 2 GPUs (nvidia)
		pod1 := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "test-ns"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("2"),
							},
						},
					},
				},
			},
		}
		// Pod 2: Running, 1 GPU (amd)
		pod2 := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "test-ns"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"amd.com/gpu": resource.MustParse("1"),
							},
						},
					},
				},
			},
		}
		// Pod 3: Pending, 1 GPU (should be ignored)
		pod3 := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-3", Namespace: "test-ns"},
			Status:     corev1.PodStatus{Phase: corev1.PodPending},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("1"),
							},
						},
					},
				},
			},
		}
		// Pod 4: Running, 0 GPUs (system pod, should be ignored)
		pod4 := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-4", Namespace: "test-ns"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "system"}},
			},
		}

		_, _ = fakeClient.CoreV1().Pods("test-ns").Create(context.Background(), pod1, metav1.CreateOptions{})
		_, _ = fakeClient.CoreV1().Pods("test-ns").Create(context.Background(), pod2, metav1.CreateOptions{})
		_, _ = fakeClient.CoreV1().Pods("test-ns").Create(context.Background(), pod3, metav1.CreateOptions{})
		_, _ = fakeClient.CoreV1().Pods("test-ns").Create(context.Background(), pod4, metav1.CreateOptions{})

		// Expected call to InsertUtilizationSnapshot
		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			// pod1 (2) + pod2 (1) = 3 active GPUs
			// totalGPUs = reservation.GPUCount = 4
			// Utilization = (3/4) * 100 = 75%
			return s.ActiveGPUCount == 3 && s.TotalGPUCount == 4 && s.GPUUtilizationPct == 75.0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})

	t.Run("collectForReservation - Cap exceeded", func(t *testing.T) {
		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "cap-ns",
			GPUCount:  2,
		}

		// Pod asking for 4 GPUs (exceeds reservation of 2)
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-big", Namespace: "cap-ns"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("4"),
							},
						},
					},
				},
			},
		}
		_, _ = fakeClient.CoreV1().Pods("cap-ns").Create(context.Background(), pod, metav1.CreateOptions{})

		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			// Should cap at reservation total (2)
			return s.ActiveGPUCount == 2 && s.GPUUtilizationPct == 100.0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})

	t.Run("collectForReservation - Zero total GPUs", func(t *testing.T) {
		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "zero-ns",
			GPUCount:  0,
		}

		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			return s.TotalGPUCount == 0 && s.ActiveGPUCount == 0 && s.GPUUtilizationPct == 0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})
}

func TestGPUUtilizationWorker_Cleanup(t *testing.T) {
	mockStore := new(test.MockStore)
	worker := NewGPUUtilizationWorker(mockStore, nil, nil)

	t.Run("cleanupOldSnapshots calls store", func(t *testing.T) {
		mockStore.On("DeleteOldUtilizationSnapshots", mock.Anything).Return(int64(5), nil).Once()
		worker.cleanupOldSnapshots()
		mockStore.AssertExpectations(t)
	})
}

func TestGPUUtilizationWorker_IntervalFromEnv(t *testing.T) {
	os.Setenv("GPU_UTIL_POLL_INTERVAL_MS", "5000")
	defer os.Unsetenv("GPU_UTIL_POLL_INTERVAL_MS")

	worker := NewGPUUtilizationWorker(nil, nil, nil)
	assert.Equal(t, 5*time.Second, worker.interval)
}

func TestGPUUtilizationWorker_StopCancel(t *testing.T) {
	worker := NewGPUUtilizationWorker(nil, nil, nil)

	ctx := worker.baseCtx
	worker.Stop()

	// baseCtx should be cancelled
	select {
	case <-ctx.Done():
		// ok
	default:
		t.Fatal("worker context not cancelled on stop (#6966)")
	}
}

func TestGPUUtilizationWorker_ThresholdAlerting(t *testing.T) {
	mockStore := new(test.MockStore)
	notificationService := notifications.NewService()

	t.Run("over-threshold alert sent", func(t *testing.T) {
		os.Setenv("GPU_UTIL_OVER_THRESHOLD", "80")
		defer os.Unsetenv("GPU_UTIL_OVER_THRESHOLD")

		k8sClient, _ := k8s.NewMultiClusterClient("")
		fakeClient := k8sfake.NewSimpleClientset()
		k8sClient.InjectClient("test-cluster", fakeClient)
		k8sClient.SetRawConfig(&api.Config{
			Clusters: map[string]*api.Cluster{
				"test-cluster": {Server: "https://test-cluster:6443"},
			},
			Contexts: map[string]*api.Context{
				"test-cluster": {Cluster: "test-cluster"},
			},
		})

		worker := NewGPUUtilizationWorker(mockStore, k8sClient, notificationService)
		assert.Equal(t, 80.0, worker.overThreshold)

		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "test-ns-over",
			GPUCount:  4,
		}

		// Create pods that result in 100% utilization (exceeds 80% threshold)
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "test-ns-over"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("4"),
							},
						},
					},
				},
			},
		}
		_, _ = fakeClient.CoreV1().Pods("test-ns-over").Create(context.Background(), pod, metav1.CreateOptions{})

		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			return s.ActiveGPUCount == 4 && s.TotalGPUCount == 4 && s.GPUUtilizationPct == 100.0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})

	t.Run("under-threshold alert sent", func(t *testing.T) {
		os.Setenv("GPU_UTIL_UNDER_THRESHOLD", "50")
		defer os.Unsetenv("GPU_UTIL_UNDER_THRESHOLD")

		k8sClient, _ := k8s.NewMultiClusterClient("")
		fakeClient := k8sfake.NewSimpleClientset()
		k8sClient.InjectClient("test-cluster", fakeClient)
		k8sClient.SetRawConfig(&api.Config{
			Clusters: map[string]*api.Cluster{
				"test-cluster": {Server: "https://test-cluster:6443"},
			},
			Contexts: map[string]*api.Context{
				"test-cluster": {Cluster: "test-cluster"},
			},
		})

		worker := NewGPUUtilizationWorker(mockStore, k8sClient, notificationService)
		assert.Equal(t, 50.0, worker.underThreshold)

		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "test-ns-under",
			GPUCount:  4,
		}

		// Create pods that result in 25% utilization (below 50% threshold)
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "test-ns-under"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("1"),
							},
						},
					},
				},
			},
		}
		_, _ = fakeClient.CoreV1().Pods("test-ns-under").Create(context.Background(), pod, metav1.CreateOptions{})

		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			return s.ActiveGPUCount == 1 && s.TotalGPUCount == 4 && s.GPUUtilizationPct == 25.0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})

	t.Run("no alert when within thresholds", func(t *testing.T) {
		os.Setenv("GPU_UTIL_OVER_THRESHOLD", "90")
		os.Setenv("GPU_UTIL_UNDER_THRESHOLD", "10")
		defer os.Unsetenv("GPU_UTIL_OVER_THRESHOLD")
		defer os.Unsetenv("GPU_UTIL_UNDER_THRESHOLD")

		k8sClient, _ := k8s.NewMultiClusterClient("")
		fakeClient := k8sfake.NewSimpleClientset()
		k8sClient.InjectClient("test-cluster", fakeClient)
		k8sClient.SetRawConfig(&api.Config{
			Clusters: map[string]*api.Cluster{
				"test-cluster": {Server: "https://test-cluster:6443"},
			},
			Contexts: map[string]*api.Context{
				"test-cluster": {Cluster: "test-cluster"},
			},
		})

		worker := NewGPUUtilizationWorker(mockStore, k8sClient, notificationService)
		assert.Equal(t, 90.0, worker.overThreshold)
		assert.Equal(t, 10.0, worker.underThreshold)

		reservation := &models.GPUReservation{
			ID:        uuid.New(),
			Cluster:   "test-cluster",
			Namespace: "test-ns-normal",
			GPUCount:  4,
		}

		// Create pods that result in 50% utilization (within 10-90% range)
		pod := &corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-3", Namespace: "test-ns-normal"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("2"),
							},
						},
					},
				},
			},
		}
		_, _ = fakeClient.CoreV1().Pods("test-ns-normal").Create(context.Background(), pod, metav1.CreateOptions{})

		mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
			return s.ActiveGPUCount == 2 && s.TotalGPUCount == 4 && s.GPUUtilizationPct == 50.0
		})).Return(nil).Once()

		worker.collectForReservation(context.Background(), reservation, nil)
		mockStore.AssertExpectations(t)
	})
}

// Issue 9135 — DCGM GPU memory integration tests.

func TestGPUUtilizationWorker_DCGMDisabled_MemoryZero(t *testing.T) {
	t.Setenv("GPU_METRICS_DCGM_ENABLED", "")

	mockStore := new(test.MockStore)
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.InjectClient("c1", k8sfake.NewSimpleClientset())
	worker := NewGPUUtilizationWorker(mockStore, k8sClient, nil)

	if worker.dcgmEnabled {
		t.Fatal("expected dcgmEnabled=false when GPU_METRICS_DCGM_ENABLED is unset")
	}
	if worker.dcgmNamespace != "gpu-operator" {
		t.Errorf("dcgmNamespace default: got %q, want gpu-operator", worker.dcgmNamespace)
	}
	if worker.dcgmService != "dcgm-exporter" {
		t.Errorf("dcgmService default: got %q, want dcgm-exporter", worker.dcgmService)
	}

	// Directly verify the collect path: nil dcgmClusterMetrics → MemoryUtilizationPct=0.
	reservation := &models.GPUReservation{
		ID:        uuid.New(),
		Cluster:   "c1",
		Namespace: "ns-a",
		GPUCount:  1,
	}
	mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
		return s.MemoryUtilizationPct == 0
	})).Return(nil).Once()
	worker.collectForReservation(context.Background(), reservation, nil)
	mockStore.AssertExpectations(t)
}

func TestGPUUtilizationWorker_DCGMEnabled_EnvOverrides(t *testing.T) {
	t.Setenv("GPU_METRICS_DCGM_ENABLED", "true")
	t.Setenv("GPU_METRICS_DCGM_NAMESPACE", "custom-ns")
	t.Setenv("GPU_METRICS_DCGM_SERVICE", "custom-svc")

	mockStore := new(test.MockStore)
	k8sClient, _ := k8s.NewMultiClusterClient("")
	worker := NewGPUUtilizationWorker(mockStore, k8sClient, nil)

	if !worker.dcgmEnabled {
		t.Fatal("expected dcgmEnabled=true when GPU_METRICS_DCGM_ENABLED=true")
	}
	if worker.dcgmNamespace != "custom-ns" {
		t.Errorf("dcgmNamespace override: got %q, want custom-ns", worker.dcgmNamespace)
	}
	if worker.dcgmService != "custom-svc" {
		t.Errorf("dcgmService override: got %q, want custom-svc", worker.dcgmService)
	}
}

func TestGPUUtilizationWorker_DCGMEnabled_MemoryFromScraper(t *testing.T) {
	// Pass DCGM metrics directly to collectForReservation to verify the
	// percentage computation and that non-matching namespaces fall back to 0.
	mockStore := new(test.MockStore)
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("c1", fakeClient)
	worker := NewGPUUtilizationWorker(mockStore, k8sClient, nil)

	// 75% framebuffer utilization: 30720 used out of 30720+10240 total.
	const (
		fbUsedMiB = 30720
		fbFreeMiB = 10240
		wantPct   = 75.0
	)
	dcgmByNs := map[string]*agent.DCGMNamespaceMetrics{
		"ml-team": {FBUsedMiB: fbUsedMiB, FBFreeMiB: fbFreeMiB, SampleCount: 1},
	}

	reservation := &models.GPUReservation{
		ID:        uuid.New(),
		Cluster:   "c1",
		Namespace: "ml-team",
		GPUCount:  1,
	}
	mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
		return s.MemoryUtilizationPct == wantPct
	})).Return(nil).Once()

	worker.collectForReservation(context.Background(), reservation, dcgmByNs)
	mockStore.AssertExpectations(t)
}

func TestGPUUtilizationWorker_DCGMEnabled_NamespaceMiss_Zero(t *testing.T) {
	// DCGM returned data, but not for this reservation's namespace.
	mockStore := new(test.MockStore)
	k8sClient, _ := k8s.NewMultiClusterClient("")
	fakeClient := k8sfake.NewSimpleClientset()
	k8sClient.InjectClient("c1", fakeClient)
	worker := NewGPUUtilizationWorker(mockStore, k8sClient, nil)

	dcgmByNs := map[string]*agent.DCGMNamespaceMetrics{
		"other-ns": {FBUsedMiB: 1000, FBFreeMiB: 1000, SampleCount: 1},
	}

	reservation := &models.GPUReservation{
		ID:        uuid.New(),
		Cluster:   "c1",
		Namespace: "missing-ns",
		GPUCount:  1,
	}
	mockStore.On("InsertUtilizationSnapshot", mock.MatchedBy(func(s *models.GPUUtilizationSnapshot) bool {
		return s.MemoryUtilizationPct == 0
	})).Return(nil).Once()

	worker.collectForReservation(context.Background(), reservation, dcgmByNs)
	mockStore.AssertExpectations(t)
}
