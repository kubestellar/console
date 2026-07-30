package scheduler

import (
	"context"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

func newTestK8sClient(clusterName string, objs ...interface{}) *k8s.MultiClusterClient {
	var runtimeObjs []interface{}
	runtimeObjs = append(runtimeObjs, objs...)

	fakeClient := fake.NewSimpleClientset()
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(clusterName, fakeClient)
	return mc
}

func TestDispatch_ScaleDeployment_Success(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
		},
	})
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-001",
		ActionType: "ScaleDeployment",
		Cluster:    cluster,
		Namespace:  "default",
		Parameters: `{"name":"web","replicas":3}`,
	}

	result, err := Dispatch(ctx, mc, action)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Fatal("expected non-empty result")
	}

	// Verify the deployment was actually scaled.
	dep, err := fakeClient.AppsV1().Deployments("default").Get(ctx, "web", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to get deployment: %v", err)
	}
	if *dep.Spec.Replicas != 3 {
		t.Errorf("expected 3 replicas, got %d", *dep.Spec.Replicas)
	}
}

func TestDispatch_ScaleDeployment_NamespaceFromParams(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "production"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(2),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "api"}},
		},
	})
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-002",
		ActionType: "ScaleDeployment",
		Cluster:    cluster,
		Namespace:  "default",
		Parameters: `{"name":"api","namespace":"production","replicas":5}`,
	}

	_, err := Dispatch(ctx, mc, action)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	dep, err := fakeClient.AppsV1().Deployments("production").Get(ctx, "api", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to get deployment: %v", err)
	}
	if *dep.Spec.Replicas != 5 {
		t.Errorf("expected 5 replicas, got %d", *dep.Spec.Replicas)
	}
}

func TestDispatch_RestartDeployment_Success(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	fakeClient := fake.NewSimpleClientset(&appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: "worker", Namespace: "default"},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "worker"}},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"app": "worker"}},
			},
		},
	})
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-003",
		ActionType: "RestartDeployment",
		Cluster:    cluster,
		Namespace:  "default",
		Parameters: `{"name":"worker"}`,
	}

	result, err := Dispatch(ctx, mc, action)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Fatal("expected non-empty result")
	}

	// Verify restart annotation was added.
	dep, err := fakeClient.AppsV1().Deployments("default").Get(ctx, "worker", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to get deployment: %v", err)
	}
	ann := dep.Spec.Template.Annotations
	if ann == nil {
		t.Fatal("expected annotations to be set")
	}
	if _, ok := ann["kubectl.kubernetes.io/restartedAt"]; !ok {
		t.Error("expected restartedAt annotation")
	}
}

func TestDispatch_DeletePod_Success(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	fakeClient := fake.NewSimpleClientset(&corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "crash-pod", Namespace: "default"},
	})
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-004",
		ActionType: "DeletePod",
		Cluster:    cluster,
		Namespace:  "default",
		Parameters: `{"name":"crash-pod"}`,
	}

	result, err := Dispatch(ctx, mc, action)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Fatal("expected non-empty result")
	}

	// Pod should be gone.
	_, err = fakeClient.CoreV1().Pods("default").Get(ctx, "crash-pod", metav1.GetOptions{})
	if err == nil {
		t.Error("expected pod to be deleted")
	}
}

func TestDispatch_CordonNode_Success(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	fakeClient := fake.NewSimpleClientset(&corev1.Node{
		ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
		Spec:       corev1.NodeSpec{Unschedulable: false},
	})
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-005",
		ActionType: "CordonNode",
		Cluster:    cluster,
		Parameters: `{"node":"node-1"}`,
	}

	result, err := Dispatch(ctx, mc, action)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Fatal("expected non-empty result")
	}

	node, err := fakeClient.CoreV1().Nodes().Get(ctx, "node-1", metav1.GetOptions{})
	if err != nil {
		t.Fatalf("failed to get node: %v", err)
	}
	if !node.Spec.Unschedulable {
		t.Error("expected node to be cordoned (unschedulable=true)")
	}
}

func TestDispatch_DeleteCluster_TokenTooShort(t *testing.T) {
	ctx := context.Background()

	mc := &k8s.MultiClusterClient{}

	// ID is too short (less than 8 chars) — should fail validation.
	action := store.StellarAction{
		ID:         "short",
		ActionType: "DeleteCluster",
		Cluster:    "some-cluster",
		Parameters: `{"confirm_token":"short"}`,
	}

	_, err := Dispatch(ctx, mc, action)
	if err == nil {
		t.Fatal("expected error for short ID")
	}
}

func TestDispatch_DeleteCluster_TokenMismatch(t *testing.T) {
	ctx := context.Background()

	mc := &k8s.MultiClusterClient{}

	action := store.StellarAction{
		ID:         "abcdefgh-long-id",
		ActionType: "DeleteCluster",
		Cluster:    "some-cluster",
		Parameters: `{"confirm_token":"WRONG123"}`,
	}

	_, err := Dispatch(ctx, mc, action)
	if err == nil {
		t.Fatal("expected error for mismatched confirm_token")
	}
}

func TestDispatch_ScaleDeployment_DeploymentNotFound(t *testing.T) {
	ctx := context.Background()
	cluster := "test-cluster"

	// Empty cluster — no deployments.
	fakeClient := fake.NewSimpleClientset()
	mc := &k8s.MultiClusterClient{}
	mc.SetClient(cluster, fakeClient)

	action := store.StellarAction{
		ID:         "action-006",
		ActionType: "ScaleDeployment",
		Cluster:    cluster,
		Namespace:  "default",
		Parameters: `{"name":"nonexistent","replicas":2}`,
	}

	_, err := Dispatch(ctx, mc, action)
	if err == nil {
		t.Fatal("expected error when deployment doesn't exist")
	}
}

func TestDispatch_GetClient_Failure(t *testing.T) {
	ctx := context.Background()

	// Empty MultiClusterClient — no clusters registered.
	mc := &k8s.MultiClusterClient{}

	action := store.StellarAction{
		ID:         "action-007",
		ActionType: "ScaleDeployment",
		Cluster:    "unknown-cluster",
		Namespace:  "default",
		Parameters: `{"name":"web","replicas":1}`,
	}

	_, err := Dispatch(ctx, mc, action)
	if err == nil {
		t.Fatal("expected error when cluster is not configured")
	}
}

func int32Ptr(i int32) *int32 { return &i }
