package k8s

import (
	"context"
	"fmt"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func BenchmarkGetGPUNodes(b *testing.B) {
	numNodes := 100
	numPods := 500

	nodes := make([]corev1.Node, numNodes)
	for i := 0; i < numNodes; i++ {
		nodes[i] = corev1.Node{
			ObjectMeta: metav1.ObjectMeta{
				Name: fmt.Sprintf("node-%d", i),
				Labels: map[string]string{
					"nvidia.com/gpu.product": "Tesla-V100",
				},
			},
			Status: corev1.NodeStatus{
				Allocatable: corev1.ResourceList{
					"nvidia.com/gpu": resource.MustParse("8"),
				},
			},
		}
	}

	pods := make([]corev1.Pod, numPods)
	for i := 0; i < numPods; i++ {
		pods[i] = corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      fmt.Sprintf("pod-%d", i),
				Namespace: "default",
			},
			Spec: corev1.PodSpec{
				NodeName: fmt.Sprintf("node-%d", i%numNodes),
				Containers: []corev1.Container{
					{
						Name: "main",
						Resources: corev1.ResourceRequirements{
							Requests: corev1.ResourceList{
								"nvidia.com/gpu": resource.MustParse("1"),
							},
						},
					},
				},
			},
		}
	}

	client := fake.NewSimpleClientset()
	for _, node := range nodes {
		_, _ = client.CoreV1().Nodes().Create(context.Background(), &node, metav1.CreateOptions{})
	}
	for _, pod := range pods {
		_, _ = client.CoreV1().Pods("default").Create(context.Background(), &pod, metav1.CreateOptions{})
	}

	m := &MultiClusterClient{}
	m.InjectClient("test-cluster", client)

	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := m.GetGPUNodes(ctx, "test-cluster")
		if err != nil {
			b.Fatal(err)
		}
	}
}
