package k8s

import (
	"context"
	"errors"
	"testing"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestGetWarningEvents(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	now := metav1.Now()
	older := metav1.NewTime(now.Add(-1 * time.Hour))

	fakeCS := fake.NewSimpleClientset(
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "ev1", Namespace: "default"},
			Type:           "Warning",
			Reason:         "Failed",
			Message:        "Pod failed",
			Count:          1,
			LastTimestamp:  now,
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod1"},
		},
		&corev1.Event{
			ObjectMeta:    metav1.ObjectMeta{Name: "ev2", Namespace: "default"},
			Type:          "Normal",
			Reason:        "Started",
			LastTimestamp: older,
		},
		&corev1.Event{
			ObjectMeta:     metav1.ObjectMeta{Name: "ev3", Namespace: "default"},
			Type:           "Warning",
			Reason:         "BackOff",
			Message:        "Backing off",
			Count:          5,
			FirstTimestamp: older,
			LastTimestamp:  older,
			InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: "pod2"},
		},
	)
	m.clients["c1"] = fakeCS

	events, err := m.GetWarningEvents(context.Background(), "c1", "default", 10)
	if err != nil {
		t.Fatalf("GetWarningEvents failed: %v", err)
	}

	foundWarning := false
	for _, e := range events {
		if e.Type == "Warning" && e.Reason == "Failed" {
			foundWarning = true
			if e.Age == "" {
				t.Error("Expected Age")
			}
		}
	}
	if !foundWarning {
		t.Error("Expected warning event")
	}

	eventsLimit, _ := m.GetWarningEvents(context.Background(), "c1", "default", 1)
	if len(eventsLimit) != 1 {
		t.Errorf("Expected 1 event, got %d", len(eventsLimit))
	}

	m.clients["c2"] = fake.NewSimpleClientset()
	m.clients["c2"].(*fake.Clientset).PrependReactor("list", "events", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("list error")
	})
	m.rawConfig.Contexts["c2"] = &api.Context{Cluster: "cl2"}

	_, err = m.GetWarningEvents(context.Background(), "c2", "default", 10)
	if err == nil {
		t.Error("Expected error for list failure")
	}
}

func TestDeleteResourceQuota(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	fakeCS := fake.NewSimpleClientset(&corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{Name: "rq1", Namespace: "default"},
	})
	m.clients["c1"] = fakeCS

	err := m.DeleteResourceQuota(context.Background(), "c1", "default", "rq1")
	if err != nil {
		t.Fatalf("DeleteResourceQuota failed: %v", err)
	}

	_, err = fakeCS.CoreV1().ResourceQuotas("default").Get(context.Background(), "rq1", metav1.GetOptions{})
	if err == nil {
		t.Error("ResourceQuota should be deleted")
	}

	fakeCS.PrependReactor("delete", "resourcequotas", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("delete error")
	})

	err = m.DeleteResourceQuota(context.Background(), "c1", "default", "rq2")
	if err == nil {
		t.Error("Expected error for delete failure")
	}
}

func TestCheckSecurityIssues(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	privileged := true
	runAsUser0 := int64(0)

	fakeCS := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "good-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Name: "c1",
						SecurityContext: &corev1.SecurityContext{
							Privileged: new(bool),
							RunAsUser:  new(int64),
						},
					},
				},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "priv-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Name: "c1",
						SecurityContext: &corev1.SecurityContext{
							Privileged: &privileged,
						},
					},
				},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "root-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{
					{
						Name: "c1",
						SecurityContext: &corev1.SecurityContext{
							RunAsUser: &runAsUser0,
						},
					},
				},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "missing-ctx-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{Name: "c1"}},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "host-pod", Namespace: "default"},
			Spec: corev1.PodSpec{
				HostNetwork: true,
				HostPID:     true,
				Containers: []corev1.Container{
					{Name: "c1", SecurityContext: &corev1.SecurityContext{}},
				},
			},
		},
	)
	m.clients["c1"] = fakeCS

	issues, err := m.CheckSecurityIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("CheckSecurityIssues failed: %v", err)
	}

	issueMap := make(map[string]bool)
	for _, i := range issues {
		issueMap[i.Name+":"+i.Issue] = true
	}

	if !issueMap["priv-pod:Privileged container"] {
		t.Error("Expected privileged issue")
	}
	if !issueMap["root-pod:Running as root"] {
		t.Error("Expected root issue")
	}
	if !issueMap["missing-ctx-pod:Missing security context"] {
		t.Error("Expected missing context issue")
	}
	if !issueMap["host-pod:Host network enabled"] {
		t.Error("Expected host network issue")
	}
	if !issueMap["host-pod:Host PID enabled"] {
		t.Error("Expected host PID issue")
	}
	if len(issueMap) < 5 {
		t.Errorf("Expected at least 5 issues, got %d", len(issueMap))
	}

	m.clients["c2"] = fake.NewSimpleClientset()
	m.clients["c2"].(*fake.Clientset).PrependReactor("list", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("list error")
	})
	m.rawConfig.Contexts["c2"] = &api.Context{Cluster: "cl2"}

	_, err = m.CheckSecurityIssues(context.Background(), "c2", "default")
	if err == nil {
		t.Error("Expected error for list failure")
	}
}

func TestFindDeploymentIssues(t *testing.T) {
	m, _ := NewMultiClusterClient("")
	m.rawConfig = &api.Config{Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}}}

	replicas3 := int32(3)

	fakeCS := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "healthy", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas3},
			Status:     appsv1.DeploymentStatus{ReadyReplicas: 3},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "unavailable", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas3},
			Status: appsv1.DeploymentStatus{
				ReadyReplicas: 0,
				Conditions: []appsv1.DeploymentCondition{
					{Type: appsv1.DeploymentAvailable, Status: corev1.ConditionFalse, Message: "Minimum availability not met"},
				},
			},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "stuck", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas3},
			Status: appsv1.DeploymentStatus{
				ReadyReplicas: 1,
				Conditions: []appsv1.DeploymentCondition{
					{Type: appsv1.DeploymentProgressing, Status: corev1.ConditionFalse, Message: "Progress deadline exceeded"},
				},
			},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "generic", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas3},
			Status:     appsv1.DeploymentStatus{ReadyReplicas: 2},
		},
	)
	m.clients["c1"] = fakeCS

	issues, err := m.FindDeploymentIssues(context.Background(), "c1", "default")
	if err != nil {
		t.Fatalf("FindDeploymentIssues failed: %v", err)
	}

	issueMap := make(map[string]string)
	for _, i := range issues {
		// FindDeploymentIssues returns []DeploymentIssue.
		// Assuming DeploymentIssue has Name and Reason fields.
		// Let's verify the DeploymentIssue struct if needed, but standard guess is good.
		// Checking client.go (Step 961): `Name: deploy.Name`, `Reason: reason`.
		issueMap[i.Name] = i.Reason
	}

	if _, ok := issueMap["healthy"]; ok {
		t.Error("Healthy deployment should not have issues")
	}
	if issueMap["unavailable"] != "Unavailable" {
		t.Errorf("Expected Unavailable, got %s", issueMap["unavailable"])
	}
	if issueMap["stuck"] != "ProgressDeadlineExceeded" {
		t.Errorf("Expected ProgressDeadlineExceeded, got %s", issueMap["stuck"])
	}
	if issueMap["generic"] != "Unavailable" {
		t.Errorf("Expected Unavailable (generic), got %s", issueMap["generic"])
	}

	m.clients["c2"] = fake.NewSimpleClientset()
	m.clients["c2"].(*fake.Clientset).PrependReactor("list", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("list error")
	})
	m.rawConfig.Contexts["c2"] = &api.Context{Cluster: "cl2"}

	_, err = m.FindDeploymentIssues(context.Background(), "c2", "default")
	if err == nil {
		t.Error("Expected error for list failure")
	}
}
