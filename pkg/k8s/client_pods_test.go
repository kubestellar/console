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

func TestGetPods_ParsesContainerStatusAndGPURequests(t *testing.T) {
	now := time.Now()
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "gpu-workload",
			Namespace:         "default",
			CreationTimestamp: metav1.NewTime(now.Add(-90 * time.Minute)),
			Labels:            map[string]string{"app": "trainer"},
			Annotations:       map[string]string{"owner": "ml-team"},
		},
		Spec: corev1.PodSpec{
			NodeName: "node-a",
			Containers: []corev1.Container{
				{
					Name:  "api",
					Image: "example/api:v1",
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceName("nvidia.com/gpu"):  resource.MustParse("1"),
							corev1.ResourceName("habana.ai/gaudi"): resource.MustParse("2"),
						},
					},
				},
				{
					Name:  "worker",
					Image: "example/worker:v1",
					Resources: corev1.ResourceRequirements{
						Limits: corev1.ResourceList{
							corev1.ResourceName("amd.com/gpu"): resource.MustParse("4"),
						},
					},
				},
				{
					Name:  "sidecar",
					Image: "example/sidecar:v1",
				},
			},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name:         "api",
					Ready:        true,
					RestartCount: 1,
					State: corev1.ContainerState{
						Running: &corev1.ContainerStateRunning{StartedAt: metav1.NewTime(now.Add(-30 * time.Minute))},
					},
				},
				{
					Name:         "worker",
					Ready:        false,
					RestartCount: 3,
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason:  "ImagePullBackOff",
							Message: "failed to pull image",
						},
					},
				},
				{
					Name:         "sidecar",
					Ready:        false,
					RestartCount: 2,
					State: corev1.ContainerState{
						Terminated: &corev1.ContainerStateTerminated{
							Reason:  "Error",
							Message: "container exited",
						},
					},
				},
			},
		},
	}

	client := &MultiClusterClient{}
	client.SetClient("cluster-a", k8sfake.NewSimpleClientset(pod))

	pods, err := client.GetPods(context.Background(), "cluster-a", "default")
	require.NoError(t, err)
	require.Len(t, pods, 1)

	info := pods[0]
	assert.Equal(t, "gpu-workload", info.Name)
	assert.Equal(t, "cluster-a", info.Cluster)
	assert.Equal(t, "Running", info.Status)
	assert.Equal(t, "1/3", info.Ready)
	assert.Equal(t, 6, info.Restarts)
	assert.Equal(t, "node-a", info.Node)
	assert.Equal(t, "trainer", info.Labels["app"])
	assert.Equal(t, "ml-team", info.Annotations["owner"])
	assert.NotEmpty(t, info.Age)

	require.Len(t, info.Containers, 3)
	assert.Equal(t, ContainerInfo{Name: "api", Image: "example/api:v1", Ready: true, State: "running", GPURequested: 3}, info.Containers[0])
	assert.Equal(t, ContainerInfo{Name: "worker", Image: "example/worker:v1", State: "waiting", Reason: "ImagePullBackOff", Message: "failed to pull image", GPURequested: 4}, info.Containers[1])
	assert.Equal(t, ContainerInfo{Name: "sidecar", Image: "example/sidecar:v1", State: "terminated", Reason: "Error", Message: "container exited"}, info.Containers[2])
}
