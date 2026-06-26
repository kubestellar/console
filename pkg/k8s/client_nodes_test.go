package k8s

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestGetNodes_ParsesDetailedInventory(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "node-a",
			CreationTimestamp: metav1.NewTime(time.Now().Add(-48 * time.Hour)),
			Labels: map[string]string{
				"node-role.kubernetes.io/control-plane":       "",
				"topology.kubernetes.io/region":               "us-east-1",
				"custom.label":                                "kept",
				"kubernetes.io/hostname":                      "filtered-host",
				"nvidia.com/gpu.product":                      "Tesla T4",
				"feature.node.kubernetes.io/pci-15b3.present": "true",
			},
		},
		Spec: corev1.NodeSpec{
			Unschedulable: true,
			Taints:        []corev1.Taint{{Key: "dedicated", Value: "gpu", Effect: corev1.TaintEffectNoSchedule}},
		},
		Status: corev1.NodeStatus{
			NodeInfo: corev1.NodeSystemInfo{
				KubeletVersion:          "v1.31.0",
				ContainerRuntimeVersion: "containerd://2.0.0",
				OperatingSystem:         "linux",
				OSImage:                 "Flatcar Container Linux",
				Architecture:            "amd64",
			},
			Addresses: []corev1.NodeAddress{
				{Type: corev1.NodeInternalIP, Address: "10.0.0.10"},
				{Type: corev1.NodeExternalIP, Address: "34.10.0.10"},
			},
			Capacity: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse("8"),
				corev1.ResourceMemory:           resource.MustParse("32Gi"),
				corev1.ResourcePods:             resource.MustParse("110"),
				corev1.ResourceEphemeralStorage: resource.MustParse("100Gi"),
			},
			Allocatable: corev1.ResourceList{
				corev1.ResourceEphemeralStorage:         resource.MustParse("90Gi"),
				corev1.ResourceName("nvidia.com/gpu"):   resource.MustParse("2"),
				corev1.ResourceName("rdma/hca"):         resource.MustParse("1"),
				corev1.ResourceName("mellanox.com/nic"): resource.MustParse("3"),
				corev1.ResourceName("vendor.com/nvme"):  resource.MustParse("2"),
			},
			Conditions: []corev1.NodeCondition{{Type: corev1.NodeReady, Status: corev1.ConditionFalse, Reason: "KubeletNotReady", Message: "kubelet is stopped"}},
		},
	}

	client := &MultiClusterClient{}
	client.SetClient("cluster-a", k8sfake.NewSimpleClientset(node))

	nodes, err := client.GetNodes(context.Background(), "cluster-a")
	require.NoError(t, err)
	require.Len(t, nodes, 1)

	info := nodes[0]
	assert.Equal(t, "node-a", info.Name)
	assert.Equal(t, "cluster-a", info.Cluster)
	assert.Equal(t, "NotReady", info.Status)
	assert.Equal(t, []string{"control-plane"}, info.Roles)
	assert.Equal(t, "10.0.0.10", info.InternalIP)
	assert.Equal(t, "34.10.0.10", info.ExternalIP)
	assert.Equal(t, "v1.31.0", info.KubeletVersion)
	assert.Equal(t, "containerd://2.0.0", info.ContainerRuntime)
	assert.Equal(t, "linux", info.OS)
	assert.Equal(t, "Flatcar Container Linux", info.OSImage)
	assert.Equal(t, "amd64", info.Architecture)
	assert.Equal(t, "8", info.CPUCapacity)
	assert.Equal(t, "32Gi", info.MemoryCapacity)
	assert.Equal(t, "90Gi", info.StorageCapacity)
	assert.Equal(t, "110", info.PodCapacity)
	assert.Equal(t, 2, info.GPUCount)
	assert.Equal(t, "Tesla T4", info.GPUType)
	assert.Equal(t, 3, info.NICCount)
	assert.Equal(t, 2, info.NVMECount)
	assert.Equal(t, 1, info.InfiniBandCount)
	assert.Equal(t, []string{"dedicated=gpu:NoSchedule"}, info.Taints)
	assert.True(t, info.Unschedulable)
	assert.Equal(t, "us-east-1", info.Labels["topology.kubernetes.io/region"])
	assert.Equal(t, "kept", info.Labels["custom.label"])
	assert.NotContains(t, info.Labels, "kubernetes.io/hostname")
	assert.NotEmpty(t, info.Age)
	require.Len(t, info.Conditions, 1)
	assert.Equal(t, "Ready", info.Conditions[0].Type)
	assert.Equal(t, "False", info.Conditions[0].Status)
}

func TestGetNodes_DefaultsWorkerRoleAndUsesLabelFallbacks(t *testing.T) {
	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "node-b",
			Labels: map[string]string{
				"feature.node.kubernetes.io/pci-15b3.present": "true",
				"feature.node.kubernetes.io/nvme.present":     "true",
			},
		},
		Status: corev1.NodeStatus{
			NodeInfo: corev1.NodeSystemInfo{OSImage: "Ubuntu"},
			Allocatable: corev1.ResourceList{
				corev1.ResourceName("amd.com/gpu"): resource.MustParse("1"),
			},
			Conditions: []corev1.NodeCondition{{Type: corev1.NodeReady, Status: corev1.ConditionTrue}},
		},
	}

	client := &MultiClusterClient{}
	client.SetClient("cluster-b", k8sfake.NewSimpleClientset(node))

	nodes, err := client.GetNodes(context.Background(), "cluster-b")
	require.NoError(t, err)
	require.Len(t, nodes, 1)

	info := nodes[0]
	assert.Equal(t, []string{"worker"}, info.Roles)
	assert.Equal(t, "Ready", info.Status)
	assert.Equal(t, 1, info.GPUCount)
	assert.Equal(t, "AMD GPU", info.GPUType)
	assert.Equal(t, 1, info.InfiniBandCount)
	assert.Equal(t, 1, info.NVMECount)
}
