package k8stest_test

import (
	"context"
	"testing"

	"github.com/kubestellar/console/pkg/k8s/k8stest"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestNewFakeMultiClusterSetup(t *testing.T) {
	setup := k8stest.NewFakeMultiClusterSetup()
	if setup.Clients == nil {
		t.Error("Expected non-nil Clients map")
	}
	if setup.RawConfig == nil {
		t.Error("Expected non-nil RawConfig")
	}
}

func TestSetFakeClient(t *testing.T) {
	setup := k8stest.NewFakeMultiClusterSetup()
	fakeClient := k8stest.NewFakeClientWithNodes()
	
	setup.SetFakeClient("test-cluster", fakeClient)
	
	if setup.Clients["test-cluster"] == nil {
		t.Error("Expected client to be set")
	}
	if setup.RawConfig.Contexts["test-cluster"] == nil {
		t.Error("Expected context to be created")
	}
}

func TestNewHealthyNode(t *testing.T) {
	const cpuCores = 4
	const memoryGiB = 16
	node := k8stest.NewHealthyNode("node1", cpuCores, memoryGiB)
	
	if node.Name != "node1" {
		t.Errorf("Expected node name node1, got %s", node.Name)
	}
	
	// Check Ready condition
	ready := false
	for _, cond := range node.Status.Conditions {
		if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
			ready = true
			break
		}
	}
	if !ready {
		t.Error("Expected node to have Ready condition")
	}
	
	// Check capacity
	cpu := node.Status.Capacity[corev1.ResourceCPU]
	mem := node.Status.Capacity[corev1.ResourceMemory]
	if cpu.IsZero() || mem.IsZero() {
		t.Errorf("Expected non-zero CPU and memory, got CPU=%v, mem=%v", cpu, mem)
	}
}

func TestNewRunningPod(t *testing.T) {
	pod := k8stest.NewRunningPod("pod1", "default")
	if pod.Name != "pod1" {
		t.Errorf("Expected pod name pod1, got %s", pod.Name)
	}
	if pod.Namespace != "default" {
		t.Errorf("Expected namespace default, got %s", pod.Namespace)
	}
	if pod.Status.Phase != corev1.PodRunning {
		t.Errorf("Expected pod phase Running, got %s", pod.Status.Phase)
	}
}

func TestNewFakeClientAllowAll(t *testing.T) {
	fc := k8stest.NewFakeClientAllowAll()
	
	// Create a test SSAR
	ssar := &corev1.SelfSubjectAccessReview{
		Spec: corev1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &corev1.ResourceAttributes{
				Verb:     "list",
				Resource: "pods",
			},
		},
	}
	
	result, err := fc.AuthorizationV1().SelfSubjectAccessReviews().Create(
		context.Background(), ssar, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Create SSAR failed: %v", err)
	}
	
	if !result.Status.Allowed {
		t.Error("Expected AllowAll client to allow the request")
	}
}

func TestNewFakeClientDenyAll(t *testing.T) {
	fc := k8stest.NewFakeClientDenyAll()
	
	ssar := &corev1.SelfSubjectAccessReview{
		Spec: corev1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &corev1.ResourceAttributes{
				Verb:     "list",
				Resource: "pods",
			},
		},
	}
	
	result, err := fc.AuthorizationV1().SelfSubjectAccessReviews().Create(
		context.Background(), ssar, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("Create SSAR failed: %v", err)
	}
	
	if result.Status.Allowed {
		t.Error("Expected DenyAll client to deny the request")
	}
}

func TestBuildGVRMap(t *testing.T) {
	gvrMap := k8stest.BuildGVRMap()
	if len(gvrMap) == 0 {
		t.Error("Expected non-empty GVR map")
	}
	
	// Check a few key resources
	expectedResources := []string{"deployments", "pods", "gateways", "httproutes"}
	for _, res := range expectedResources {
		found := false
		for gvr := range gvrMap {
			if gvr.Resource == res {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Expected GVR map to include resource %s", res)
		}
	}
}

func TestNewFakeDynamicClient(t *testing.T) {
	client := k8stest.NewFakeDynamicClient()
	if client == nil {
		t.Error("Expected non-nil dynamic client")
	}
}

func TestNewFakeClientWithNodes(t *testing.T) {
	node1 := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n1"}}
	node2 := &corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "n2"}}
	
	fc := k8stest.NewFakeClientWithNodes(node1, node2)
	
	nodes, err := fc.CoreV1().Nodes().List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatalf("List nodes failed: %v", err)
	}
	if len(nodes.Items) != 2 {
		t.Errorf("Expected 2 nodes, got %d", len(nodes.Items))
	}
}

func TestNewFakeClientWithPods(t *testing.T) {
	pod1 := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p1", Namespace: "default"}}
	pod2 := &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p2", Namespace: "default"}}
	
	fc := k8stest.NewFakeClientWithPods(pod1, pod2)
	
	pods, err := fc.CoreV1().Pods("default").List(context.Background(), metav1.ListOptions{})
	if err != nil {
		t.Fatalf("List pods failed: %v", err)
	}
	if len(pods.Items) != 2 {
		t.Errorf("Expected 2 pods, got %d", len(pods.Items))
	}
}

func TestTestContextWithDeadline(t *testing.T) {
	ctx, cancel := k8stest.TestContextWithDeadline()
	defer cancel()
	
	if ctx == nil {
		t.Error("Expected non-nil context")
	}
	
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Error("Expected context to have a deadline")
	}
	if deadline.IsZero() {
		t.Error("Expected non-zero deadline")
	}
}

func TestInjectTestClusters(t *testing.T) {
	setup := k8stest.NewFakeMultiClusterSetup()
	setup.InjectTestClusters("c1", "c2", "c3")
	
	if len(setup.RawConfig.Contexts) != 3 {
		t.Errorf("Expected 3 contexts, got %d", len(setup.RawConfig.Contexts))
	}
	
	// Each cluster should have unique server URL
	servers := make(map[string]bool)
	for _, cluster := range setup.RawConfig.Clusters {
		if servers[cluster.Server] {
			t.Errorf("Duplicate server URL: %s", cluster.Server)
		}
		servers[cluster.Server] = true
	}
}
