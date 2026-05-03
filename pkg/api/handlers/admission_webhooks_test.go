package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestListWebhooks(t *testing.T) {
	env := setupTestEnv(t)
	h := NewWebhookHandlers(env.K8sClient)

	// Register route
	env.App.Get("/api/admission-webhooks", h.ListWebhooks)

	// Mock data for validating webhooks
	valWh := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "admissionregistration.k8s.io/v1",
			"kind":       "ValidatingWebhookConfiguration",
			"metadata": map[string]interface{}{
				"name": "val-webhook",
			},
			"webhooks": []interface{}{
				map[string]interface{}{
					"name":          "check.example.com",
					"failurePolicy": "Fail",
					"matchPolicy":   "Equivalent",
					"rules": []interface{}{
						map[string]interface{}{"operations": []interface{}{"CREATE"}},
					},
				},
			},
		},
	}

	// Mock data for mutating webhooks
	mutWh := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "admissionregistration.k8s.io/v1",
			"kind":       "MutatingWebhookConfiguration",
			"metadata": map[string]interface{}{
				"name": "mut-webhook",
			},
			"webhooks": []interface{}{
				map[string]interface{}{
					"name":          "mutate.example.com",
					"failurePolicy": "Ignore",
					"rules": []interface{}{
						map[string]interface{}{"operations": []interface{}{"UPDATE"}},
						map[string]interface{}{"operations": []interface{}{"DELETE"}},
					},
				},
			},
		},
	}

	// Inject dynamic cluster with webhooks
	scheme := runtime.NewScheme()
	_ = injectDynamicClusterWithObjects(env, "test-cluster", scheme, []runtime.Object{valWh, mutWh})

	t.Run("Success", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/admission-webhooks", nil)
		resp, _ := env.App.Test(req, 5000)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result WebhookListResponse
		err := json.NewDecoder(resp.Body).Decode(&result)
		require.NoError(t, err)

		assert.False(t, result.IsDemoData)
		assert.Len(t, result.Webhooks, 2)
		assert.Empty(t, result.Errors)

		// Verify specific content
		var foundVal, foundMut bool
		for _, w := range result.Webhooks {
			if w.Name == "val-webhook" {
				foundVal = true
				assert.Equal(t, "validating", w.Type)
				assert.Equal(t, "Fail", w.FailurePolicy)
				assert.Equal(t, 1, w.Rules)
			}
			if w.Name == "mut-webhook" {
				foundMut = true
				assert.Equal(t, "mutating", w.Type)
				assert.Equal(t, "Ignore", w.FailurePolicy)
				assert.Equal(t, 2, w.Rules)
			}
		}
		assert.True(t, foundVal)
		assert.True(t, foundMut)
	})

	t.Run("Cluster Error Aggregation", func(t *testing.T) {
		// Add another cluster that will fail
		addClusterToRawConfig(env.K8sClient, "failing-cluster")
		// Don't inject a client for failing-cluster, so GetDynamicClient fails

		req := httptest.NewRequest("GET", "/api/admission-webhooks", nil)
		resp, _ := env.App.Test(req, 5000)

		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var result WebhookListResponse
		json.NewDecoder(resp.Body).Decode(&result)

		assert.NotEmpty(t, result.Errors)
		assert.Contains(t, result.Errors["failing-cluster"], "failing-cluster")
	})

	t.Run("Demo Data Fallback", func(t *testing.T) {
		// Create a handler with nil client
		hNil := NewWebhookHandlers(nil)
		app := fiber.New()
		app.Get("/api/admission-webhooks", hNil.ListWebhooks)

		req := httptest.NewRequest("GET", "/api/admission-webhooks", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
		var result WebhookListResponse
		json.NewDecoder(resp.Body).Decode(&result)
		assert.True(t, result.IsDemoData)
	})
}

func TestParseWebhookFromUnstructured(t *testing.T) {
	item := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"metadata": map[string]interface{}{
				"name": "test-wh",
			},
			"webhooks": []interface{}{
				map[string]interface{}{
					"rules": []interface{}{
						map[string]interface{}{},
						map[string]interface{}{},
					},
					"failurePolicy": "Ignore",
					"matchPolicy":   "Exact",
				},
				map[string]interface{}{
					"rules": []interface{}{
						map[string]interface{}{},
					},
				},
			},
		},
	}

	wh := parseWebhookFromUnstructured(item, "cluster-1", "mutating")
	assert.Equal(t, "test-wh", wh.Name)
	assert.Equal(t, "cluster-1", wh.Cluster)
	assert.Equal(t, "mutating", wh.Type)
	assert.Equal(t, "Ignore", wh.FailurePolicy)
	assert.Equal(t, "Exact", wh.MatchPolicy)
	assert.Equal(t, 3, wh.Rules)
}
