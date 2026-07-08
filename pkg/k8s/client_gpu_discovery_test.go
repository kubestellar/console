package k8s

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

const testGPUDiscoCluster = "gpu-disco-cluster"

func newGPUDiscoClient(objects ...runtime.Object) *MultiClusterClient {
	fakeClient := fake.NewSimpleClientset(objects...)
	m := &MultiClusterClient{
		noClusterMode: true,
	}
	m.InjectClient(testGPUDiscoCluster, fakeClient)
	return m
}

func TestGetGPUNodes_AMDDetection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "amd-node",
			Labels: map[string]string{"amd.com/gpu.product": "MI250X"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"amd.com/gpu": resource.MustParse("4"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "MI250X", nodes[0].GPUType)
	assert.Equal(t, 4, nodes[0].GPUCount)
	assert.Equal(t, AcceleratorGPU, nodes[0].AcceleratorType)
	assert.Equal(t, "AMD", nodes[0].Manufacturer)
}

func TestGetGPUNodes_AMDFallbackLabel(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "amd-node-no-label"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"amd.com/gpu": resource.MustParse("2"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "AMD GPU", nodes[0].GPUType)
}

func TestGetGPUNodes_IntelGPUDetection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "intel-gpu-node"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"gpu.intel.com/i915": resource.MustParse("1"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "Intel GPU", nodes[0].GPUType)
	assert.Equal(t, 1, nodes[0].GPUCount)
	assert.Equal(t, AcceleratorGPU, nodes[0].AcceleratorType)
	assert.Equal(t, "Intel", nodes[0].Manufacturer)
}

func TestGetGPUNodes_GoogleTPUDetection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "tpu-node",
			Labels: map[string]string{"cloud.google.com/gke-tpu-accelerator": "v4-8"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"google.com/tpu": resource.MustParse("8"),
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "tpu-pod", Namespace: "ml"},
		Spec: corev1.PodSpec{
			NodeName: "tpu-node",
			Containers: []corev1.Container{{
				Name: "trainer",
				Resources: corev1.ResourceRequirements{
					Requests: corev1.ResourceList{
						"google.com/tpu": resource.MustParse("4"),
					},
				},
			}},
		},
	}
	m := newGPUDiscoClient(node, pod)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "v4-8", nodes[0].GPUType)
	assert.Equal(t, 8, nodes[0].GPUCount)
	assert.Equal(t, 4, nodes[0].GPUAllocated)
	assert.Equal(t, AcceleratorTPU, nodes[0].AcceleratorType)
	assert.Equal(t, "Google", nodes[0].Manufacturer)
}

func TestGetGPUNodes_GoogleTPUTopologyFallback(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "tpu-topo-node",
			Labels: map[string]string{"cloud.google.com/gke-tpu-topology": "2x2x1"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"google.com/tpu": resource.MustParse("4"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "TPU 2x2x1", nodes[0].GPUType)
}

func TestGetGPUNodes_IntelXPUDetection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "xpu-node",
			Labels: map[string]string{"intel.com/xpu.product": "Max 1550"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"intel.com/xpu": resource.MustParse("2"),
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "xpu-pod", Namespace: "default"},
		Spec: corev1.PodSpec{
			NodeName: "xpu-node",
			Containers: []corev1.Container{{
				Name: "compute",
				Resources: corev1.ResourceRequirements{
					Requests: corev1.ResourceList{
						"intel.com/xpu": resource.MustParse("1"),
					},
				},
			}},
		},
	}
	m := newGPUDiscoClient(node, pod)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "Max 1550", nodes[0].GPUType)
	assert.Equal(t, 2, nodes[0].GPUCount)
	assert.Equal(t, 1, nodes[0].GPUAllocated)
	assert.Equal(t, AcceleratorXPU, nodes[0].AcceleratorType)
	assert.Equal(t, "Intel", nodes[0].Manufacturer)
}

func TestGetGPUNodes_IBMAIUDetection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "aiu-node",
			Labels: map[string]string{"ibm.com/aiu.product": "AIU Gen1"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"ibm.com/aiu": resource.MustParse("4"),
			},
		},
	}
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "aiu-pod", Namespace: "default"},
		Spec: corev1.PodSpec{
			NodeName: "aiu-node",
			Containers: []corev1.Container{{
				Name: "inference",
				Resources: corev1.ResourceRequirements{
					Requests: corev1.ResourceList{
						"ibm.com/aiu": resource.MustParse("2"),
					},
				},
			}},
		},
	}
	m := newGPUDiscoClient(node, pod)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "AIU Gen1", nodes[0].GPUType)
	assert.Equal(t, 4, nodes[0].GPUCount)
	assert.Equal(t, 2, nodes[0].GPUAllocated)
	assert.Equal(t, AcceleratorAIU, nodes[0].AcceleratorType)
	assert.Equal(t, "IBM", nodes[0].Manufacturer)
}

func TestGetGPUNodes_NoAcceleratorSkipped(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "plain-worker"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("16"),
				corev1.ResourceMemory: resource.MustParse("64Gi"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	assert.Empty(t, nodes)
}

func TestGetGPUNodes_ZeroQuantitySkipped(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "zero-gpu-node"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("0"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	assert.Empty(t, nodes)
}

func TestGetGPUNodes_TaintCollection(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "tainted-gpu-node",
			Labels: map[string]string{"nvidia.com/gpu.product": "A100"},
		},
		Spec: corev1.NodeSpec{
			Taints: []corev1.Taint{
				{Key: "nvidia.com/gpu", Value: "present", Effect: corev1.TaintEffectNoSchedule},
				{Key: "node.kubernetes.io/unschedulable", Effect: corev1.TaintEffectNoExecute},
				{Key: "prefer-gpu-workloads", Effect: corev1.TaintEffectPreferNoSchedule},
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("8"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	// Only NoSchedule and NoExecute taints should appear; PreferNoSchedule is dropped
	assert.Len(t, nodes[0].Taints, 2)
	taintKeys := make(map[string]string)
	for _, taint := range nodes[0].Taints {
		taintKeys[taint.Key] = taint.Effect
	}
	assert.Equal(t, "NoSchedule", taintKeys["nvidia.com/gpu"])
	assert.Equal(t, "NoExecute", taintKeys["node.kubernetes.io/unschedulable"])
}

func TestGetGPUNodes_CUDAVersionAssembly(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "cuda-node",
			Labels: map[string]string{
				"nvidia.com/gpu.product":        "H100",
				"nvidia.com/gpu.family":         "hopper",
				"nvidia.com/gpu.memory":         "81920",
				"nvidia.com/cuda.driver.major":  "535",
				"nvidia.com/cuda.driver.minor":  "104",
				"nvidia.com/cuda.driver.rev":    "05",
				"nvidia.com/cuda.runtime.major": "12",
				"nvidia.com/cuda.runtime.minor": "2",
				"nvidia.com/mig.capable":        "true",
				"nvidia.com/mig.strategy":       "mixed",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("8"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	n := nodes[0]
	assert.Equal(t, "H100", n.GPUType)
	assert.Equal(t, "hopper", n.GPUFamily)
	assert.Equal(t, 81920, n.GPUMemoryMB)
	assert.Equal(t, "535.104.05", n.CUDADriverVersion)
	assert.Equal(t, "12.2", n.CUDARuntimeVersion)
	assert.True(t, n.MIGCapable)
	assert.Equal(t, "mixed", n.MIGStrategy)
}

func TestGetGPUNodes_CUDADriverPartialVersion(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "partial-cuda-node",
			Labels: map[string]string{
				"nvidia.com/cuda.driver.major": "550",
			},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("1"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "550", nodes[0].CUDADriverVersion)
	assert.Equal(t, "", nodes[0].CUDARuntimeVersion)
}

func TestGetGPUNodes_PodListFailureGraceful(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-node-pods-fail"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("4"),
			},
		},
	}
	fakeClient := fake.NewSimpleClientset(node)
	fakeClient.PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, assert.AnError
	})
	m := &MultiClusterClient{}
	m.InjectClient(testGPUDiscoCluster, fakeClient)

	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, 0, nodes[0].GPUAllocated)
	assert.Equal(t, 4, nodes[0].GPUCount)
}

func TestGetGPUNodes_InvalidClusterReturnsError(t *testing.T) {
	t.Parallel()
	m := &MultiClusterClient{
		noClusterMode: true,
	}
	_, err := m.GetGPUNodes(context.Background(), "nonexistent-cluster")
	require.Error(t, err)
}

func TestGetGPUNodes_IntelGaudiWithProductLabel(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "gaudi3-node",
			Labels: map[string]string{"intel.com/gaudi.product": "Gaudi3"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"intel.com/gaudi": resource.MustParse("8"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "Gaudi3", nodes[0].GPUType)
	assert.Equal(t, AcceleratorGPU, nodes[0].AcceleratorType)
	assert.Equal(t, "Intel", nodes[0].Manufacturer)
}

func TestGetGPUNodes_NVIDIAAcceleratorLabelFallback(t *testing.T) {
	t.Parallel()
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:   "old-label-node",
			Labels: map[string]string{"accelerator": "nvidia-tesla-k80"},
		},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{
				"nvidia.com/gpu": resource.MustParse("2"),
			},
		},
	}
	m := newGPUDiscoClient(node)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	require.Len(t, nodes, 1)
	assert.Equal(t, "nvidia-tesla-k80", nodes[0].GPUType)
}

func TestGetGPUNodes_MultiNodeMixedAccelerators(t *testing.T) {
	t.Parallel()
	nvidiaNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "nvidia-box"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{"nvidia.com/gpu": resource.MustParse("4")},
		},
	}
	tpuNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "tpu-box"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{"google.com/tpu": resource.MustParse("8")},
		},
	}
	cpuNode := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "cpu-only"},
		Status: corev1.NodeStatus{
			Allocatable: corev1.ResourceList{corev1.ResourceCPU: resource.MustParse("96")},
		},
	}
	m := newGPUDiscoClient(nvidiaNode, tpuNode, cpuNode)
	nodes, err := m.GetGPUNodes(context.Background(), testGPUDiscoCluster)
	require.NoError(t, err)
	assert.Len(t, nodes, 2)
	types := map[AcceleratorType]bool{}
	for _, n := range nodes {
		types[n.AcceleratorType] = true
	}
	assert.True(t, types[AcceleratorGPU])
	assert.True(t, types[AcceleratorTPU])
}
