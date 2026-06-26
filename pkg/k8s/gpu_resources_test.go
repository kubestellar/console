package k8s

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

// Keep each row's expected sum honest: the hand-written totals prove the
// SumGPURequested contract (sum across ALL known GPU resource names) without
// looping the implementation under test.
func TestIsGPUResourceName(t *testing.T) {
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

	unknown := []corev1.ResourceName{
		"cpu",
		"memory",
		"ephemeral-storage",
		// Adjacent names that must NOT match — no prefix-based heuristics.
		"google.com/tpu",
		"intel.com/xpu",
		"ibm.com/aiu",
		"nvidia.com/mig-4g.20gb",
	}
	for _, name := range unknown {
		if IsGPUResourceName(name) {
			t.Errorf("IsGPUResourceName(%q) = true, want false", name)
		}
	}
}

func TestSumGPURequested(t *testing.T) {
	q := func(n int64) resource.Quantity { return *resource.NewQuantity(n, resource.DecimalSI) }

	cases := []struct {
		name string
		in   corev1.ResourceList
		want int
	}{
		{
			name: "empty list",
			in:   corev1.ResourceList{},
			want: 0,
		},
		{
			name: "single nvidia request",
			in:   corev1.ResourceList{"nvidia.com/gpu": q(2)},
			want: 2,
		},
		{
			name: "single gaudi request",
			in:   corev1.ResourceList{"habana.ai/gaudi": q(4)},
			want: 4,
		},
		{
			// Regression for the Copilot review on PR Issue 9204: the previous
			// pod-tracker overwrote ci.GPURequested per matching resource name,
			// so a container with BOTH nvidia and gaudi returned whichever came
			// last in Go's randomized map iteration. SumGPURequested must
			// return the total (3) deterministically.
			name: "multi-accelerator sums both",
			in: corev1.ResourceList{
				"nvidia.com/gpu":  q(1),
				"habana.ai/gaudi": q(2),
			},
			want: 3,
		},
		{
			name: "all six known names sum",
			in: corev1.ResourceList{
				"nvidia.com/gpu":     q(1),
				"amd.com/gpu":        q(1),
				"gpu.intel.com/i915": q(1),
				"habana.ai/gaudi":    q(1),
				"habana.ai/gaudi2":   q(1),
				"intel.com/gaudi":    q(1),
			},
			want: 6,
		},
		{
			name: "non-GPU resources ignored",
			in: corev1.ResourceList{
				"cpu":            q(4),
				"memory":         q(1024),
				"nvidia.com/gpu": q(1),
			},
			want: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := SumGPURequested(tc.in)
			if got != tc.want {
				t.Errorf("SumGPURequested(%v) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}
