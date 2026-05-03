package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/settings"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	k8serrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	fakek8s "k8s.io/client-go/kubernetes/fake"
	clitesting "k8s.io/client-go/testing"
)

func TestMapK8sErrorToHTTP(t *testing.T) {
	gr := schema.GroupResource{Group: "v1", Resource: "pods"}
	tests := []struct {
		name         string
		err          error
		expectStatus int
	}{
		{
			name:         "AlreadyExists",
			err:          k8serrors.NewAlreadyExists(gr, "mypod"),
			expectStatus: http.StatusConflict,
		},
		{
			name:         "Forbidden",
			err:          k8serrors.NewForbidden(gr, "mypod", nil),
			expectStatus: http.StatusForbidden,
		},
		{
			name:         "Invalid",
			err:          k8serrors.NewInvalid(schema.GroupKind{}, "mypod", nil),
			expectStatus: http.StatusBadRequest,
		},
		{
			name:         "NotFound",
			err:          k8serrors.NewNotFound(gr, "mypod"),
			expectStatus: http.StatusNotFound,
		},
		{
			name:         "Unauthorized",
			err:          k8serrors.NewUnauthorized("unauthorized"),
			expectStatus: http.StatusUnauthorized,
		},
		{
			name:         "Conflict",
			err:          k8serrors.NewConflict(gr, "mypod", nil),
			expectStatus: http.StatusConflict,
		},
		{
			name:         "Timeout",
			err:          k8serrors.NewTimeoutError("timeout", 5),
			expectStatus: http.StatusGatewayTimeout,
		},
		{
			name:         "ServiceUnavailable",
			err:          k8serrors.NewServiceUnavailable("unavailable"),
			expectStatus: http.StatusServiceUnavailable,
		},
		{
			name:         "GenericError",
			err:          &k8serrors.StatusError{ErrStatus: metav1.Status{Reason: metav1.StatusReasonInternalError}},
			expectStatus: http.StatusInternalServerError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, _ := mapK8sErrorToHTTP(tt.err)
			if status != tt.expectStatus {
				t.Errorf("Expected status %d, got %d for error %v", tt.expectStatus, status, tt.err)
			}
		})
	}
}

func TestResourceHandlers_QueryExtraction(t *testing.T) {
	k8sMock, _ := k8s.NewMultiClusterClient("")

	// Populate the fake client with resources
	fakeCS := fakek8s.NewSimpleClientset(
		&corev1.Node{
			ObjectMeta: metav1.ObjectMeta{Name: "test-node"},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "test-deploy", Namespace: "test-ns"},
		},
	)
	k8sMock.SetClient("test-cluster", fakeCS)

	server := &Server{
		k8sClient:      k8sMock,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}

	// 1. Verify handleNodesHTTP extracts ?cluster=
	t.Run("handleNodesHTTP", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/nodes?cluster=test-cluster", nil)
		w := httptest.NewRecorder()

		server.handleNodesHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", w.Code)
		}

		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to parse response: %v", err)
		}

		nodes, ok := resp["nodes"].([]interface{})
		if !ok || len(nodes) != 1 {
			t.Fatalf("Expected 1 node, got %v", resp["nodes"])
		}

		// Verify that the fake client got a "list" action for "nodes"
		actions := fakeCS.Actions()
		var listAction bool
		for _, a := range actions {
			if a.GetVerb() == "list" && a.GetResource().Resource == "nodes" {
				listAction = true
				break
			}
		}
		if !listAction {
			t.Error("Expected 'list nodes' action on fake clientset")
		}
	})

	// 2. Verify handleDeploymentsHTTP extracts ?cluster= and ?namespace=
	t.Run("handleDeploymentsHTTP", func(t *testing.T) {
		fakeCS.ClearActions()

		req := httptest.NewRequest("GET", "/deployments?cluster=test-cluster&namespace=test-ns", nil)
		w := httptest.NewRecorder()

		server.handleDeploymentsHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected status 200, got %d", w.Code)
		}

		// Verify action targets the correct namespace
		actions := fakeCS.Actions()
		var found bool
		for _, a := range actions {
			if a.GetVerb() == "list" && a.GetResource().Resource == "deployments" {
				if a.GetNamespace() == "test-ns" {
					found = true
					break
				}
			}
		}
		if !found {
			t.Error("Expected 'list deployments' action on namespace 'test-ns'")
		}
	})
}

func TestMutationLogic_CreateNamespaceHTTP(t *testing.T) {
	k8sMock, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("test-cluster", fakeCS)

	server := &Server{
		k8sClient:      k8sMock,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}

	body := `{"cluster": "test-cluster", "name": "new-ns", "labels": {"env": "test"}}`
	req := httptest.NewRequest("POST", "/namespaces", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.handleNamespacesHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	actions := fakeCS.Actions()
	var created bool
	for _, a := range actions {
		if ca, ok := a.(clitesting.CreateAction); ok && ca.GetResource().Resource == "namespaces" {
			obj := ca.GetObject().(*corev1.Namespace)
			if obj.Name == "new-ns" && obj.Labels["env"] == "test" {
				created = true
				break
			}
		}
	}

	if !created {
		t.Error("namespace was not created with correct parameters in fake client")
	}
}

func TestMutationLogic_CreateServiceAccountHTTP(t *testing.T) {
	k8sMock, _ := k8s.NewMultiClusterClient("")
	fakeCS := fakek8s.NewSimpleClientset()
	k8sMock.SetClient("test-cluster", fakeCS)

	server := &Server{
		k8sClient:      k8sMock,
		allowedOrigins: []string{"*"},
		agentToken:     "",
	}

	body := `{"cluster": "test-cluster", "namespace": "test-ns", "name": "new-sa"}`
	req := httptest.NewRequest("POST", "/serviceaccounts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.handleServiceAccountsHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	actions := fakeCS.Actions()
	var created bool
	for _, a := range actions {
		if ca, ok := a.(clitesting.CreateAction); ok && ca.GetResource().Resource == "serviceaccounts" {
			obj := ca.GetObject().(*corev1.ServiceAccount)
			if obj.Name == "new-sa" && obj.Namespace == "test-ns" {
				created = true
				break
			}
		}
	}

	if !created {
		t.Error("serviceaccount was not created with correct parameters in fake client")
	}
}

func TestHandleAutoUpdateConfig_SaveAllError_Returns500(t *testing.T) {
	mgr := settings.GetSettingsManager()
	original := mgr.GetSettingsPath()
	mgr.SetSettingsPath("/dev/null/no-such-dir/settings.json")
	defer mgr.SetSettingsPath(original)

	checker := &UpdateChecker{channel: "stable"}
	server := &Server{
		allowedOrigins: []string{"*"},
		agentToken:     "",
		updateChecker:  checker,
	}

	body := `{"enabled":true,"channel":"developer"}`
	req := httptest.NewRequest("POST", "/auto-update/config", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	server.handleAutoUpdateConfig(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}
	checker.mu.Lock()
	ch := checker.channel
	checker.mu.Unlock()
	if ch != "stable" {
		t.Errorf("updateChecker.Configure must not be called on SaveAll failure, but channel changed to %q", ch)
	}
}
