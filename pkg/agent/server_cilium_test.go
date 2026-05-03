package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestServer_HandleCiliumStatus(t *testing.T) {
	// Setup dependencies
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// Mock 2 clusters in rawConfig
	config := &api.Config{
		Clusters: map[string]*api.Cluster{
			"c1": {Server: "https://c1.com"},
			"c2": {Server: "https://c2.com"},
		},
		Contexts: map[string]*api.Context{
			"ctx-1": {Cluster: "c1"},
			"ctx-2": {Cluster: "c2"},
		},
	}
	k8sClient.SetRawConfig(config)

	// Mock cluster 1: has Cilium (Healthy)
	fakeCS1 := fakek8s.NewSimpleClientset(
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "cilium", Namespace: "kube-system"},
			Status:     appsv1.DaemonSetStatus{NumberReady: 1, DesiredNumberScheduled: 1},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "cilium-abc",
				Namespace: "kube-system",
				Labels:    map[string]string{"k8s-app": "cilium"},
			},
			Spec: corev1.PodSpec{
				NodeName: "node-1",
				Containers: []corev1.Container{
					{Image: "cilium/cilium:v1.14.4"},
				},
			},
			Status: corev1.PodStatus{
				Conditions: []corev1.PodCondition{
					{Type: corev1.PodReady, Status: corev1.ConditionTrue},
				},
			},
		},
		&networkingv1.NetworkPolicy{
			ObjectMeta: metav1.ObjectMeta{Name: "policy-1", Namespace: "default"},
		},
	)
	k8sClient.SetClient("ctx-1", fakeCS1)

	// Mock dynamic client for cluster 1 (endpoints)
	scheme := runtime.NewScheme()
	fakeDyn1 := fake.NewSimpleDynamicClient(scheme, &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "cilium.io/v2",
			"kind":       "CiliumEndpoint",
			"metadata": map[string]interface{}{
				"name":      "dummy",
				"namespace": "default",
			},
		},
	})
	k8sClient.SetDynamicClient("ctx-1", fakeDyn1)

	// Mock cluster 2: no Cilium
	fakeCS2 := fakek8s.NewSimpleClientset()
	k8sClient.SetClient("ctx-2", fakeCS2)

	req := httptest.NewRequest("GET", "/cilium-status", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	w := httptest.NewRecorder()

	server.handleCiliumStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp ciliumStatusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	// Since only ctx-1 has Cilium and it's ready, status should be Healthy
	if resp.Status != "Healthy" {
		t.Errorf("Expected status Healthy, got %s", resp.Status)
	}
	if len(resp.Nodes) != 1 {
		t.Fatalf("Expected 1 node, got %d", len(resp.Nodes))
	}
	if resp.Nodes[0].Version != "1.14.4" {
		t.Errorf("Expected version 1.14.4, got %s", resp.Nodes[0].Version)
	}
	if resp.NetworkPolicies != 1 {
		t.Errorf("Expected 1 network policy, got %d", resp.NetworkPolicies)
	}
}

func TestExtractCiliumImageTag(t *testing.T) {
	tests := []struct {
		image string
		want  string
	}{
		{"cilium/cilium:v1.14.4", "1.14.4"},
		{"quay.io/cilium/cilium:1.15.0", "1.15.0"},
		{"cilium:latest", "latest"},
		{"cilium", "unknown"},
		{"", "unknown"},
	}

	for _, tt := range tests {
		containers := []corev1.Container{{Image: tt.image}}
		if got := extractCiliumImageTag(containers); got != tt.want {
			t.Errorf("extractCiliumImageTag(%q) = %q, want %q", tt.image, got, tt.want)
		}
	}
}
