package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/dynamic/fake"
)

func TestServer_HandleConsoleCRManagedWorkloads(t *testing.T) {
	// 1. Setup fake dynamic client
	scheme := runtime.NewScheme()
	fakeDyn := fake.NewSimpleDynamicClient(scheme)

	// 2. Setup server with mock dependencies
	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetDynamicClient("persistence-cluster", fakeDyn)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	// 3. Test POST (Create)
	mw := v1alpha1.ManagedWorkload{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ManagedWorkload",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-mw",
		},
		Spec: v1alpha1.ManagedWorkloadSpec{
			SourceCluster: "c1",
			WorkloadRef: v1alpha1.WorkloadReference{
				Name: "my-deploy",
				Kind: "Deployment",
			},
		},
	}
	body, _ := json.Marshal(mw)
	req := httptest.NewRequest("POST", "/console-cr/managedworkloads?cluster=persistence-cluster&namespace=test-ns", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d. Body: %s", w.Code, w.Body.String())
	}

	// 4. Test PUT (Update)
	mw.Spec.SourceCluster = "c2"
	body, _ = json.Marshal(mw)
	req = httptest.NewRequest("PUT", "/console-cr/managedworkloads?cluster=persistence-cluster&namespace=test-ns&name=test-mw", bytes.NewReader(body))
	w = httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	// 5. Test DELETE
	req = httptest.NewRequest("DELETE", "/console-cr/managedworkloads?cluster=persistence-cluster&namespace=test-ns&name=test-mw", nil)
	w = httptest.NewRecorder()

	s.handleConsoleCRManagedWorkloads(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}
}

func TestServer_HandleConsoleCRClusterGroups(t *testing.T) {
	fakeDyn := fake.NewSimpleDynamicClient(runtime.NewScheme())

	k8sClient, _ := k8s.NewMultiClusterClient("")
	k8sClient.SetDynamicClient("persistence-cluster", fakeDyn)

	s := &Server{
		k8sClient:      k8sClient,
		allowedOrigins: []string{"*"},
	}

	cg := v1alpha1.ClusterGroup{
		TypeMeta: metav1.TypeMeta{
			APIVersion: v1alpha1.GroupVersion.String(),
			Kind:       "ClusterGroup",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: "test-cg",
		},
	}
	body, _ := json.Marshal(cg)
	req := httptest.NewRequest("POST", "/console-cr/clustergroups?cluster=persistence-cluster&namespace=test-ns", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handleConsoleCRClusterGroups(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Expected status 201, got %d", w.Code)
	}
}
