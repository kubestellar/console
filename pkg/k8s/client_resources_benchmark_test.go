package k8s

import (
	"context"
	"fmt"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func BenchmarkFindPodIssues(b *testing.B) {
	numPods := 1000
	pods := make([]corev1.Pod, numPods)
	for i := 0; i < numPods; i++ {
		pods[i] = corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      fmt.Sprintf("pod-%d", i),
				Namespace: "default",
			},
			Status: corev1.PodStatus{
				Phase: corev1.PodPending,
			},
		}
		// Make every 10th pod have an issue
		if i%10 == 0 {
			pods[i].Status.ContainerStatuses = []corev1.ContainerStatus{
				{
					Name: "main",
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "CrashLoopBackOff",
						},
					},
				},
			}
		}
	}

	client := fake.NewSimpleClientset()
	for _, pod := range pods {
		_, _ = client.CoreV1().Pods("default").Create(context.Background(), &pod, metav1.CreateOptions{})
	}

	m := &MultiClusterClient{}
	m.InjectClient("test-cluster", client)

	ctx := context.Background()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := m.FindPodIssues(ctx, "test-cluster", "default")
		if err != nil {
			b.Fatal(err)
		}
	}
}
