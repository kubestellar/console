package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"

	"github.com/kubestellar/console/pkg/api/v1alpha1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8stesting "k8s.io/client-go/testing"
)

// gatewayGVRs returns the standard GVR-to-list-kind map for Gateway resources.
func gatewayGVRs() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "gateways"}:      "GatewayList",
		{Group: "gateway.networking.k8s.io", Version: "v1beta1", Resource: "gateways"}: "GatewayList",
	}
}

// httpRouteGVRs returns the standard GVR-to-list-kind map for HTTPRoute resources.
func httpRouteGVRs() map[schema.GroupVersionResource]string {
	return map[schema.GroupVersionResource]string{
		{Group: "gateway.networking.k8s.io", Version: "v1", Resource: "httproutes"}:      "HTTPRouteList",
		{Group: "gateway.networking.k8s.io", Version: "v1beta1", Resource: "httproutes"}: "HTTPRouteList",
	}
}

func TestListGateways(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGatewayHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/gateway/gateways", handler.ListGateways)

	gw := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "Gateway",
			"metadata": map[string]interface{}{
				"name":      "my-gateway",
				"namespace": "default",
			},
			"spec": map[string]interface{}{
				"gatewayClassName": "test-class",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "test-cluster", gatewayGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "GatewayList", "apiVersion": "gateway.networking.k8s.io/v1"},
			Items:  []unstructured.Unstructured{*gw},
		}, nil
	})

	// Case 1: List all (success)
	req, _ := http.NewRequest("GET", "/api/gateway/gateways", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var list v1alpha1.GatewayList
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &list)
	require.NoError(t, err)
	require.NotEmpty(t, list.Items)
	assert.Equal(t, "my-gateway", list.Items[0].Name)

	// Case 2: List specific cluster (success)
	req2, _ := http.NewRequest("GET", "/api/gateway/gateways?cluster=test-cluster", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp2.StatusCode)

	// Case 3: List specific cluster — real listing failures (auth/network/
	// RBAC, anything other than "CRDs not installed") must now be
	// propagated to the caller as 500 instead of being swallowed and
	// returning an empty list. Previously the handler always returned
	// 200 + empty items, which hid cluster-level failures in the UI
	// (#6660). The 200-on-error behavior was a bug, not a contract.
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("simulated error")
	})

	req3, _ := http.NewRequest("GET", "/api/gateway/gateways?cluster=test-cluster", nil)
	resp3, err := env.App.Test(req3, 5000)
	require.NoError(t, err)
	assert.Equal(t, 500, resp3.StatusCode,
		"per-cluster list error must propagate as 500 (#6660)")
}

func TestGetGateway(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGatewayHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/gateway/gateways/:cluster/:namespace/:name", handler.GetGateway)

	gw := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "Gateway",
			"metadata": map[string]interface{}{
				"name":      "target-gw",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "c1", gatewayGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "GatewayList", "apiVersion": "gateway.networking.k8s.io/v1"},
			Items:  []unstructured.Unstructured{*gw},
		}, nil
	})

	// Case 1: Found
	req, _ := http.NewRequest("GET", "/api/gateway/gateways/c1/default/target-gw", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Case 2: Not Found (name filter excludes it)
	req2, _ := http.NewRequest("GET", "/api/gateway/gateways/c1/default/missing", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 404, resp2.StatusCode)

	// Case 3: Client Error — real listing failures now surface as 5xx
	// via handleK8sError rather than being masked as 404. Previously
	// ListGatewaysForCluster swallowed every error including auth/RBAC
	// and returned an empty list, which the caller then observed as
	// "not found" (#6660). The handler now sees the real error.
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("list failure")
	})
	req3, _ := http.NewRequest("GET", "/api/gateway/gateways/c1/default/target-gw", nil)
	resp3, err := env.App.Test(req3, 5000)
	require.NoError(t, err)
	if resp3.StatusCode == 404 {
		t.Errorf("per-cluster list error must no longer be silently masked as 404 (#6660); got %d", resp3.StatusCode)
	}
}

func TestListHTTPRoutes(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGatewayHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/gateway/httproutes", handler.ListHTTPRoutes)

	route := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "HTTPRoute",
			"metadata": map[string]interface{}{
				"name":      "my-route",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "test-cluster", httpRouteGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "HTTPRouteList", "apiVersion": "gateway.networking.k8s.io/v1"},
			Items:  []unstructured.Unstructured{*route},
		}, nil
	})

	// Case 1: List all
	req, _ := http.NewRequest("GET", "/api/gateway/httproutes", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var list v1alpha1.HTTPRouteList
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &list)
	require.NoError(t, err)
	assert.NotEmpty(t, list.Items)
	assert.Equal(t, "my-route", list.Items[0].Name)

	// Case 2: Specific cluster failure — real errors now propagate as 500
	// instead of being silently swallowed into a 200 with empty items
	// (#6660). This behavior change is intentional: the old behavior
	// hid cluster-level RBAC/network failures in the UI.
	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("route error")
	})
	req2, _ := http.NewRequest("GET", "/api/gateway/httproutes?cluster=test-cluster", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 500, resp2.StatusCode,
		"per-cluster list error must propagate as 500 (#6660)")
}

func TestGetHTTPRoute(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGatewayHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/gateway/httproutes/:cluster/:namespace/:name", handler.GetHTTPRoute)

	route := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "gateway.networking.k8s.io/v1",
			"kind":       "HTTPRoute",
			"metadata": map[string]interface{}{
				"name":      "target-route",
				"namespace": "default",
			},
		},
	}

	dynClient := injectDynamicCluster(env, "c1", httpRouteGVRs())

	dynClient.PrependReactor("list", "*", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{
			Object: map[string]interface{}{"kind": "HTTPRouteList", "apiVersion": "gateway.networking.k8s.io/v1"},
			Items:  []unstructured.Unstructured{*route},
		}, nil
	})

	// Case 1: Found
	req, _ := http.NewRequest("GET", "/api/gateway/httproutes/c1/default/target-route", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	// Case 2: 404
	req2, _ := http.NewRequest("GET", "/api/gateway/httproutes/c1/default/missing", nil)
	resp2, err := env.App.Test(req2, 5000)
	require.NoError(t, err)
	assert.Equal(t, 404, resp2.StatusCode)
}

func TestGetGatewayAPIStatus(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewGatewayHandlers(env.K8sClient, env.Hub)
	env.App.Get("/api/gateway/status", handler.GetGatewayAPIStatus)

	_ = injectDynamicCluster(env, "test-cluster", gatewayGVRs())

	req, _ := http.NewRequest("GET", "/api/gateway/status", nil)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var res map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &res)
	clusters := res["clusters"].([]interface{})
	assert.NotEmpty(t, clusters)
}
