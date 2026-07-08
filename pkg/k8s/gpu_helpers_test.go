package k8s

import (
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

// --- Tests for deriveGPUNodeStatus ---

func TestDeriveGPUNodeStatus_AllPassing(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: true},
		{Name: "scheduling", Passed: true},
		{Name: "gpu-feature-discovery", Passed: true},
		{Name: "nvidia-device-plugin", Passed: true},
		{Name: "dcgm-exporter", Passed: true},
		{Name: "stuck_pods", Passed: true},
		{Name: "gpu_events", Passed: true},
	}
	if got := deriveGPUNodeStatus(checks); got != "healthy" {
		t.Errorf("all passing = %q, want \"healthy\"", got)
	}
}

func TestDeriveGPUNodeStatus_CriticalNodeReady(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: false, Message: "NotReady"},
		{Name: "scheduling", Passed: true},
		{Name: "stuck_pods", Passed: true},
		{Name: "gpu_events", Passed: true},
	}
	if got := deriveGPUNodeStatus(checks); got != "unhealthy" {
		t.Errorf("node_ready critical fail = %q, want \"unhealthy\"", got)
	}
}

func TestDeriveGPUNodeStatus_CriticalStuckPods(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: true},
		{Name: "stuck_pods", Passed: false, Message: "3 pods stuck"},
		{Name: "gpu_events", Passed: true},
	}
	if got := deriveGPUNodeStatus(checks); got != "unhealthy" {
		t.Errorf("stuck_pods critical fail = %q, want \"unhealthy\"", got)
	}
}

func TestDeriveGPUNodeStatus_CriticalGPUEvents(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: true},
		{Name: "stuck_pods", Passed: true},
		{Name: "gpu_events", Passed: false, Message: "5 GPU warning events"},
	}
	if got := deriveGPUNodeStatus(checks); got != "unhealthy" {
		t.Errorf("gpu_events critical fail = %q, want \"unhealthy\"", got)
	}
}

func TestDeriveGPUNodeStatus_SingleNonCriticalFail(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: true},
		{Name: "scheduling", Passed: false, Message: "cordoned"},
		{Name: "stuck_pods", Passed: true},
		{Name: "gpu_events", Passed: true},
	}
	if got := deriveGPUNodeStatus(checks); got != "degraded" {
		t.Errorf("single non-critical fail = %q, want \"degraded\"", got)
	}
}

func TestDeriveGPUNodeStatus_ThreeNonCriticalFails(t *testing.T) {
	checks := []GPUNodeHealthCheck{
		{Name: "node_ready", Passed: true},
		{Name: "scheduling", Passed: false},
		{Name: "gpu-feature-discovery", Passed: false},
		{Name: "nvidia-device-plugin", Passed: false},
		{Name: "stuck_pods", Passed: true},
		{Name: "gpu_events", Passed: true},
	}
	if got := deriveGPUNodeStatus(checks); got != "unhealthy" {
		t.Errorf("3 non-critical fails = %q, want \"unhealthy\"", got)
	}
}

func TestDeriveGPUNodeStatus_EmptyChecks(t *testing.T) {
	if got := deriveGPUNodeStatus(nil); got != "healthy" {
		t.Errorf("nil checks = %q, want \"healthy\"", got)
	}
}

// --- Tests for isStuckPod ---

func TestIsStuckPod_ContainerStatusUnknown(t *testing.T) {
	pod := &corev1.Pod{
		Status: corev1.PodStatus{
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
	}
	if !isStuckPod(pod) {
		t.Error("ContainerStatusUnknown pod should be stuck")
	}
}

func TestIsStuckPod_TerminatingTooLong(t *testing.T) {
	tenMinAgo := metav1.NewTime(time.Now().Add(-10 * time.Minute))
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			DeletionTimestamp: &tenMinAgo,
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
		},
	}
	if !isStuckPod(pod) {
		t.Error("pod terminating for 10min should be stuck")
	}
}

func TestIsStuckPod_TerminatingRecent(t *testing.T) {
	oneMinAgo := metav1.NewTime(time.Now().Add(-1 * time.Minute))
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			DeletionTimestamp: &oneMinAgo,
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
		},
	}
	if isStuckPod(pod) {
		t.Error("pod terminating for 1min should NOT be stuck")
	}
}

func TestIsStuckPod_PendingTooLong(t *testing.T) {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			CreationTimestamp: metav1.NewTime(time.Now().Add(-15 * time.Minute)),
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
		},
	}
	if !isStuckPod(pod) {
		t.Error("pod pending for 15min should be stuck")
	}
}

func TestIsStuckPod_PendingRecent(t *testing.T) {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			CreationTimestamp: metav1.NewTime(time.Now().Add(-2 * time.Minute)),
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
		},
	}
	if isStuckPod(pod) {
		t.Error("pod pending for 2min should NOT be stuck")
	}
}

func TestIsStuckPod_RunningHealthy(t *testing.T) {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			CreationTimestamp: metav1.NewTime(time.Now().Add(-1 * time.Hour)),
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
			},
		},
	}
	if isStuckPod(pod) {
		t.Error("healthy running pod should NOT be stuck")
	}
}

// --- Tests for checkOperatorPod ---

func TestCheckOperatorPod_Running(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "gpu-feature-discovery-abc12"},
			Spec:       corev1.PodSpec{NodeName: "node-1"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
	}
	result := checkOperatorPod(pods, "node-1", "gpu-feature-discovery")
	if !result.Passed {
		t.Errorf("expected Passed=true, got Message=%q", result.Message)
	}
}

func TestCheckOperatorPod_CrashLoopBackOff(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "gpu-feature-discovery-xyz99"},
			Spec:       corev1.PodSpec{NodeName: "node-1"},
			Status: corev1.PodStatus{
				Phase: corev1.PodRunning,
				ContainerStatuses: []corev1.ContainerStatus{
					{
						State: corev1.ContainerState{
							Waiting: &corev1.ContainerStateWaiting{
								Reason: "CrashLoopBackOff",
							},
						},
						RestartCount: 42,
					},
				},
			},
		},
	}
	result := checkOperatorPod(pods, "node-1", "gpu-feature-discovery")
	if result.Passed {
		t.Error("CrashLoopBackOff should NOT pass")
	}
	if result.Message == "" {
		t.Error("expected non-empty message for CrashLoopBackOff")
	}
}

func TestCheckOperatorPod_PodPending(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "nvidia-device-plugin-111"},
			Spec:       corev1.PodSpec{NodeName: "node-2"},
			Status: corev1.PodStatus{
				Phase: corev1.PodPending,
				ContainerStatuses: []corev1.ContainerStatus{
					{
						State: corev1.ContainerState{
							Waiting: &corev1.ContainerStateWaiting{
								Reason: "ImagePullBackOff",
							},
						},
						RestartCount: 5,
					},
				},
			},
		},
	}
	result := checkOperatorPod(pods, "node-2", "nvidia-device-plugin")
	if result.Passed {
		t.Error("Pending pod should NOT pass")
	}
	if result.Message == "" {
		t.Error("expected non-empty message")
	}
}

func TestCheckOperatorPod_NotFound(t *testing.T) {
	// Pod exists but on different node
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "dcgm-exporter-aaa"},
			Spec:       corev1.PodSpec{NodeName: "node-other"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
	}
	result := checkOperatorPod(pods, "node-1", "dcgm-exporter")
	if !result.Passed {
		t.Error("not-found case should pass (operator may not be installed)")
	}
}

func TestCheckOperatorPod_EmptySlice(t *testing.T) {
	result := checkOperatorPod(nil, "node-1", "dcgm-exporter")
	if !result.Passed {
		t.Error("nil pods should pass (operator may not be installed)")
	}
}

func TestCheckOperatorPod_WrongNode(t *testing.T) {
	pods := []corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "gpu-feature-discovery-pod"},
			Spec:       corev1.PodSpec{NodeName: "node-A"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
	}
	result := checkOperatorPod(pods, "node-B", "gpu-feature-discovery")
	// Pod not on our node = not found
	if !result.Passed {
		t.Error("pod on different node should report as not-found (pass)")
	}
}

// --- Tests for unstructuredNestedMap ---

func TestUnstructuredNestedMap_ValidPath(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{
			"state": "ready",
		},
	}
	result, found, err := unstructuredNestedMap(obj, "status")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Fatal("expected found=true")
	}
	if result["state"] != "ready" {
		t.Errorf("got state=%v, want \"ready\"", result["state"])
	}
}

func TestUnstructuredNestedMap_DeepPath(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"driver": map[string]interface{}{
				"version": "535.129.03",
			},
		},
	}
	result, found, err := unstructuredNestedMap(obj, "spec", "driver")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Fatal("expected found=true")
	}
	if result["version"] != "535.129.03" {
		t.Errorf("got version=%v, want \"535.129.03\"", result["version"])
	}
}

func TestUnstructuredNestedMap_MissingKey(t *testing.T) {
	obj := map[string]interface{}{
		"metadata": map[string]interface{}{},
	}
	_, found, err := unstructuredNestedMap(obj, "status")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false for missing key")
	}
}

func TestUnstructuredNestedMap_NotAMap(t *testing.T) {
	obj := map[string]interface{}{
		"status": "stringvalue",
	}
	_, found, err := unstructuredNestedMap(obj, "status")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false when value is not a map")
	}
}

func TestUnstructuredNestedMap_NilObj(t *testing.T) {
	_, found, _ := unstructuredNestedMap(nil, "status")
	if found {
		t.Error("expected found=false for nil object")
	}
}

// --- Tests for unstructuredNestedSlice ---

func TestUnstructuredNestedSlice_ValidPath(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{
			"conditions": []interface{}{"a", "b"},
		},
	}
	result, found, err := unstructuredNestedSlice(obj, "status", "conditions")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !found {
		t.Fatal("expected found=true")
	}
	if len(result) != 2 {
		t.Errorf("got len=%d, want 2", len(result))
	}
}

func TestUnstructuredNestedSlice_MissingKey(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{},
	}
	_, found, err := unstructuredNestedSlice(obj, "status", "conditions")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false for missing key")
	}
}

func TestUnstructuredNestedSlice_NotASlice(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{
			"conditions": "notaslice",
		},
	}
	_, found, err := unstructuredNestedSlice(obj, "status", "conditions")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found {
		t.Error("expected found=false when value is not a slice")
	}
}

// --- Tests for IsGPUResourceName ---

func TestIsGPUResourceName_Known(t *testing.T) {
	known := []corev1.ResourceName{
		"nvidia.com/gpu",
		"amd.com/gpu",
		"gpu.intel.com/i915",
		"habana.ai/gaudi",
		"habana.ai/gaudi2",
		"intel.com/gaudi",
	}
	for _, name := range known {
		if !IsGPUResourceName(name) {
			t.Errorf("IsGPUResourceName(%q) = false, want true", name)
		}
	}
}

func TestIsGPUResourceName_Unknown(t *testing.T) {
	unknown := []corev1.ResourceName{
		"cpu",
		"memory",
		"nvidia.com/mig-1g.5gb",
		"google.com/tpu",
		"",
	}
	for _, name := range unknown {
		if IsGPUResourceName(name) {
			t.Errorf("IsGPUResourceName(%q) = true, want false", name)
		}
	}
}

// --- Tests for SumGPURequested ---

func TestSumGPURequested_SingleVendor(t *testing.T) {
	rl := corev1.ResourceList{
		"nvidia.com/gpu": resource.MustParse("4"),
		"cpu":            resource.MustParse("8"),
		"memory":         resource.MustParse("16Gi"),
	}
	if got := SumGPURequested(rl); got != 4 {
		t.Errorf("SumGPURequested = %d, want 4", got)
	}
}

func TestSumGPURequested_MultiVendor(t *testing.T) {
	rl := corev1.ResourceList{
		"nvidia.com/gpu":   resource.MustParse("2"),
		"habana.ai/gaudi2": resource.MustParse("3"),
	}
	if got := SumGPURequested(rl); got != 5 {
		t.Errorf("SumGPURequested = %d, want 5", got)
	}
}

func TestSumGPURequested_Empty(t *testing.T) {
	rl := corev1.ResourceList{
		"cpu":    resource.MustParse("4"),
		"memory": resource.MustParse("8Gi"),
	}
	if got := SumGPURequested(rl); got != 0 {
		t.Errorf("SumGPURequested = %d, want 0", got)
	}
}

func TestSumGPURequested_NilMap(t *testing.T) {
	if got := SumGPURequested(nil); got != 0 {
		t.Errorf("SumGPURequested(nil) = %d, want 0", got)
	}
}
