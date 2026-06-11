package agent

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func BenchmarkMetricsCapture(b *testing.B) {
	// Setup mock k8s client with many clusters, nodes, pods
	numClusters := 5
	numNodesPerCluster := 20
	numPodsPerCluster := 100

	m := &k8s.MultiClusterClient{}

	for i := 0; i < numClusters; i++ {
		clusterName := fmt.Sprintf("cluster-%d", i)
		client := fake.NewSimpleClientset()

		for j := 0; j < numNodesPerCluster; j++ {
			node := &corev1.Node{
				ObjectMeta: metav1.ObjectMeta{Name: fmt.Sprintf("node-%d", j)},
				Status: corev1.NodeStatus{
					Allocatable: corev1.ResourceList{
						"cpu":    resource.MustParse("16"),
						"memory": resource.MustParse("64Gi"),
					},
					Conditions: []corev1.NodeCondition{
						{Type: corev1.NodeReady, Status: corev1.ConditionTrue},
					},
				},
			}
			client.CoreV1().Nodes().Create(context.Background(), node, metav1.CreateOptions{})
		}

		for j := 0; j < numPodsPerCluster; j++ {
			pod := &corev1.Pod{
				ObjectMeta: metav1.ObjectMeta{
					Name:      fmt.Sprintf("pod-%d", j),
					Namespace: "default",
				},
				Spec: corev1.PodSpec{
					NodeName: fmt.Sprintf("node-%d", j%numNodesPerCluster),
					Containers: []corev1.Container{
						{
							Name: "main",
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									"cpu":    resource.MustParse("100m"),
									"memory": resource.MustParse("128Mi"),
								},
							},
						},
					},
				},
			}
			client.CoreV1().Pods("default").Create(context.Background(), pod, metav1.CreateOptions{})
		}

		m.InjectClient(clusterName, client)
	}

	tempDir, err := os.MkdirTemp("", "metrics-bench-*")
	if err != nil {
		b.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mh := NewMetricsHistory(m, tempDir)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := mh.captureSnapshot()
		if err != nil {
			b.Fatal(err)
		}
	}
}
