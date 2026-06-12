package k8s

import (
	"context"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

func TestFindPodIssues_OOMandCrashLoop(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "bad-pod", Namespace: "default"},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name:         "c1",
					Ready:        false,
					RestartCount: 5,
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "CrashLoopBackOff",
						},
					},
					LastTerminationState: corev1.ContainerState{
						Terminated: &corev1.ContainerStateTerminated{
							Reason: "OOMKilled",
						},
					},
				},
			},
		},
	}

	m.clients["test-cluster"] = k8sfake.NewSimpleClientset(pod)

	issues, err := m.FindPodIssues(context.Background(), "test-cluster", "default")
	if err != nil {
		t.Fatalf("FindPodIssues failed: %v", err)
	}

	if len(issues) != 1 {
		t.Fatalf("Expected 1 pod issue, got %d", len(issues))
	}

	// Verify the issues collected
	hasOOM := false
	hasCrashLoop := false
	for _, issueMsg := range issues[0].Issues {
		if issueMsg == "OOMKilled" {
			hasOOM = true
		}
		if issueMsg == "CrashLoopBackOff" {
			hasCrashLoop = true
		}
	}

	if !hasOOM {
		t.Errorf("Expected OOMKilled in issues, got %v", issues[0].Issues)
	}
	if !hasCrashLoop {
		t.Errorf("Expected CrashLoopBackOff in issues, got %v", issues[0].Issues)
	}
	if issues[0].Status != "OOMKilled" {
		t.Errorf("Expected status OOMKilled, got %s", issues[0].Status)
	}
	if issues[0].Reason != "OOMKilled" {
		t.Errorf("Expected reason OOMKilled, got %s", issues[0].Reason)
	}
}

func TestGetPods_ResourceParsing(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "gpu-pod", Namespace: "default"},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name: "c1",
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceName("nvidia.com/gpu"): resource.MustParse("2"),
						},
					},
				},
				{
					Name: "c2",
					Resources: corev1.ResourceRequirements{
						Limits: corev1.ResourceList{
							corev1.ResourceName("habana.ai/gaudi"): resource.MustParse("4"),
						},
					},
				},
			},
		},
		Status: corev1.PodStatus{Phase: corev1.PodRunning},
	}

	m.clients["test-cluster"] = k8sfake.NewSimpleClientset(pod)

	podsInfos, err := m.GetPods(context.Background(), "test-cluster", "default")
	if err != nil {
		t.Fatalf("GetPods failed: %v", err)
	}

	if len(podsInfos) != 1 {
		t.Fatalf("Expected 1 pod, got %v", len(podsInfos))
	}

	containers := podsInfos[0].Containers
	if len(containers) != 2 {
		t.Fatalf("Expected 2 containers, got %v", len(containers))
	}

	if containers[0].GPURequested != 2 {
		t.Errorf("Expected Container 0 to have 2 GPUs requested, got %v", containers[0].GPURequested)
	}
	if containers[1].GPURequested != 4 {
		t.Errorf("Expected Container 1 to have 4 GPUs requested (from limit), got %v", containers[1].GPURequested)
	}
}

func TestGetEvents_Sorting(t *testing.T) {
	m := &MultiClusterClient{
		clients: make(map[string]kubernetes.Interface),
	}

	time1 := metav1.NewTime(time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC))
	micros1 := metav1.NewMicroTime(time1.Time)
	event1 := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "event1", Namespace: "default"},
		EventTime:  micros1,
		Message:    "modern event",
	}

	time2 := metav1.NewTime(time.Date(2026, 1, 2, 10, 0, 0, 0, time.UTC))
	event2 := &corev1.Event{
		ObjectMeta:    metav1.ObjectMeta{Name: "event2", Namespace: "default"},
		LastTimestamp: time2,
		Message:       "legacy event",
	}

	time3 := metav1.NewTime(time.Date(2026, 1, 3, 10, 0, 0, 0, time.UTC))
	micros3 := metav1.NewMicroTime(time3.Time)
	event3 := &corev1.Event{
		ObjectMeta: metav1.ObjectMeta{Name: "event3", Namespace: "default"},
		EventTime:  micros3,
		Message:    "newest modern event",
	}

	m.clients["test-cluster"] = k8sfake.NewSimpleClientset(event1, event2, event3)

	events, err := m.GetEvents(context.Background(), "test-cluster", "default", 10)
	if err != nil {
		t.Fatalf("GetEvents failed: %v", err)
	}

	if len(events) != 3 {
		t.Fatalf("Expected 3 events, got %d", len(events))
	}

	if events[0].Message != "newest modern event" {
		t.Errorf("Expected newest modern event first, got %s", events[0].Message)
	}
	if events[1].Message != "legacy event" {
		t.Errorf("Expected legacy event second, got %s", events[1].Message)
	}
	if events[2].Message != "modern event" {
		t.Errorf("Expected modern event last, got %s", events[2].Message)
	}
}
