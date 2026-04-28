package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
	fakek8s "k8s.io/client-go/kubernetes/fake"
)

func TestServer_HandleArgoCDSync(t *testing.T) {
	// Setup dependencies
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
		agentToken:     "test-token",
	}

	// 1. Unauthorized
	req := httptest.NewRequest("POST", "/argocd/sync", nil)
	w := httptest.NewRecorder()
	server.handleArgoCDSync(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}

	// 2. Method not allowed
	req = httptest.NewRequest("GET", "/argocd/sync", nil)
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleArgoCDSync(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}

	// 3. Bad request (invalid body)
	req = httptest.NewRequest("POST", "/argocd/sync", bytes.NewBufferString("invalid"))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleArgoCDSync(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}

	// 4. Bad request (missing fields)
	body, _ := json.Marshal(map[string]string{"appName": "test-app"})
	req = httptest.NewRequest("POST", "/argocd/sync", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()
	server.handleArgoCDSync(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}

	// 5. Success - Annotation strategy (fallback)
	cluster := "test-cluster"
	appName := "test-app"
	namespace := "argocd"

	// Mock dynamic client
	scheme := runtime.NewScheme()
	app := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "argoproj.io/v1alpha1",
			"kind":       "Application",
			"metadata": map[string]interface{}{
				"name":      appName,
				"namespace": namespace,
			},
		},
	}
	fakeDyn := fake.NewSimpleDynamicClient(scheme, app)
	k8sClient.SetDynamicClient(cluster, fakeDyn)

	// Mock typed client for discoverArgoServerURL (optional, but good for coverage)
	fakeCS := fakek8s.NewSimpleClientset()
	k8sClient.SetClient(cluster, fakeCS)

	reqBody := agentArgoSyncRequest{
		AppName:   appName,
		Cluster:   cluster,
		Namespace: namespace,
	}
	body, _ = json.Marshal(reqBody)
	req = httptest.NewRequest("POST", "/argocd/sync", bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer test-token")
	w = httptest.NewRecorder()

	server.handleArgoCDSync(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["method"] != "annotation" {
		t.Errorf("Expected method 'annotation', got %v", resp["method"])
	}

	// Verify annotation was updated
	updatedApp, err := fakeDyn.Resource(v1alpha1.ArgoApplicationGVR).Namespace(namespace).Get(context.Background(), appName, metav1.GetOptions{})
	if err != nil {
		t.Fatalf("Failed to get updated app: %v", err)
	}
	if updatedApp == nil {
		t.Fatalf("Updated app is nil")
	}
	if updatedApp.GetAnnotations()["argocd.argoproj.io/refresh"] != "hard" {
		t.Errorf("Annotation not updated")
	}
}

func TestTryArgoRESTSync(t *testing.T) {
	// Mock ArgoCD server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/applications/test-app/sync" {
			t.Errorf("Unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("Missing/invalid auth header")
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	ok := tryArgoRESTSync(context.Background(), ts.URL, "test-token", "test-app")
	if !ok {
		t.Errorf("tryArgoRESTSync failed")
	}
}

func TestServer_DiscoverArgoServerURL(t *testing.T) {
	k8sClient, _ := k8s.NewMultiClusterClient("")
	server := &Server{k8sClient: k8sClient}

	// 1. Env override
	os.Setenv("ARGOCD_SERVER_URL", "http://override.com")
	defer os.Unsetenv("ARGOCD_SERVER_URL")
	url := server.discoverArgoServerURL(context.Background(), "cluster1")
	if url != "http://override.com" {
		t.Errorf("Expected override URL, got %s", url)
	}

	// 2. Service discovery
	os.Unsetenv("ARGOCD_SERVER_URL")
	fakeCS := fakek8s.NewSimpleClientset(&corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "argocd-server",
			Namespace: "argocd",
		},
		Spec: corev1.ServiceSpec{
			Ports: []corev1.ServicePort{{Port: 443}},
		},
	})
	k8sClient.SetClient("cluster1", fakeCS)
	url = server.discoverArgoServerURL(context.Background(), "cluster1")
	expected := "https://argocd-server.argocd.svc:443"
	if url != expected {
		t.Errorf("Expected %s, got %s", expected, url)
	}
}
