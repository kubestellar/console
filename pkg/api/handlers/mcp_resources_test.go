package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

func TestGetConfigMaps(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/resources/configmaps", handler.GetConfigMaps)

	scheme := newK8sScheme()
	cm := &corev1.ConfigMap{
		TypeMeta: metav1.TypeMeta{Kind: "ConfigMap", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-cm",
			Namespace: "default",
		},
		Data: map[string]string{"key": "value"},
	}

	injectDynamicClusterWithObjects(env, "test-cluster", scheme, []runtime.Object{cm}, cm)

	req, err := http.NewRequest("GET", "/api/mcp/resources/configmaps?cluster=test-cluster&namespace=default", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var response map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &response)
	require.NoError(t, err)

	configmaps := response["configmaps"].([]interface{})
	assert.NotEmpty(t, configmaps)
	assert.Equal(t, "test-cm", configmaps[0].(map[string]interface{})["name"])
}

func TestGetConfigMaps_MissingCluster(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/resources/configmaps", handler.GetConfigMaps)

	req, err := http.NewRequest("GET", "/api/mcp/resources/configmaps?cluster=non-existent", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)

	// Should return 500 because the handler currently wraps the lookup failure
	// in a generic error instead of distinguishing "cluster not found" (#4907, #4908).
	assert.Equal(t, 500, resp.StatusCode)
}

func TestGetSecrets(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Get("/api/mcp/resources/secrets", handler.GetSecrets)

	scheme := newK8sScheme()
	secret := &corev1.Secret{
		TypeMeta: metav1.TypeMeta{Kind: "Secret", APIVersion: "v1"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-secret",
			Namespace: "default",
		},
		Data: map[string][]byte{"key": []byte("value")},
	}

	injectDynamicClusterWithObjects(env, "test-cluster", scheme, []runtime.Object{secret}, secret)

	req, err := http.NewRequest("GET", "/api/mcp/resources/secrets?cluster=test-cluster&namespace=default", nil)
	require.NoError(t, err)
	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)

	var response map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	err = json.Unmarshal(body, &response)
	require.NoError(t, err)

	secrets := response["secrets"].([]interface{})
	assert.NotEmpty(t, secrets)
	assert.Equal(t, "test-secret", secrets[0].(map[string]interface{})["name"])
}

func TestCreateOrUpdateResourceQuota(t *testing.T) {
	env := setupTestEnv(t)
	handler := NewMCPHandlers(nil, env.K8sClient, env.Store)
	env.App.Post("/api/mcp/resources/quotas", handler.CreateOrUpdateResourceQuota)

	payload := map[string]interface{}{
		"cluster":   "test-cluster",
		"name":      "test-quota",
		"namespace": "default",
		"hard":      map[string]string{"cpu": "1", "memory": "1Gi"},
	}
	data, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", "/api/mcp/resources/quotas", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, 200, resp.StatusCode)
}
