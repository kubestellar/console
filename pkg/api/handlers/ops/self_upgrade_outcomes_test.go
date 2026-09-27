package ops

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"

	"github.com/kubestellar/console/pkg/test"
)

// Every non-success branch of TriggerUpgrade records a distinct
// console_self_upgrade_trigger_total{outcome} sample (#23759). These tests
// walk each branch so the outcome wiring stays exercised and the ops package
// stays above its coverage ratchet floor (#23762).

const testSelfUpgradeTriggerPath = "/api/self-upgrade/trigger"

func postTrigger(t *testing.T, app *fiber.App, body []byte) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, testSelfUpgradeTriggerPath, bytes.NewReader(body))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	return resp
}

func triggerBody(t *testing.T, tag string) []byte {
	t.Helper()
	body, err := json.Marshal(SelfUpgradeTriggerRequest{ImageTag: tag})
	require.NoError(t, err)
	return body
}

func decodeTriggerResponse(t *testing.T, resp *http.Response) SelfUpgradeTriggerResponse {
	t.Helper()
	var out SelfUpgradeTriggerResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&out))
	return out
}

func consoleDeployment(containers ...corev1.Container) *appsv1.Deployment {
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "kubestellar-console",
			Namespace: "kubestellar",
			Labels:    map[string]string{"app.kubernetes.io/name": "kubestellar-console"},
		},
		Spec: appsv1.DeploymentSpec{
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{Containers: containers},
			},
		},
	}
}

func allowSSAR(client *k8sfake.Clientset, allowed bool) {
	client.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, &authorizationv1.SelfSubjectAccessReview{
			Status: authorizationv1.SubjectAccessReviewStatus{Allowed: allowed},
		}, nil
	})
}

func TestSelfUpgradeHandler_TriggerUpgrade_StoreUnavailable(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, nil)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode)
	assert.Contains(t, decodeTriggerResponse(t, resp).Error, "user store is not configured")
}

func TestSelfUpgradeHandler_TriggerUpgrade_UserLookupFailed(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)

	failingID := uuid.New()
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", failingID)
		return c.Next()
	})
	env.Store.(*test.MockStore).On("GetUser", failingID).Return(nil, errors.New("db down"))
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Contains(t, decodeTriggerResponse(t, resp).Error, "unable to verify user role")
}

func TestSelfUpgradeHandler_TriggerUpgrade_UserNotFound(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)

	missingID := uuid.New()
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("userID", missingID)
		return c.Next()
	})
	env.Store.(*test.MockStore).On("GetUser", missingID).Return(nil, nil)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Contains(t, decodeTriggerResponse(t, resp).Error, "user not found")
}

func TestSelfUpgradeHandler_TriggerUpgrade_InvalidBody(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, []byte("{not json"))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "invalid request body", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_EmptyImageTag(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, ""))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "imageTag is required", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_NotInCluster(t *testing.T) {
	env := setupTestEnv(t)
	// setupTestEnv leaves the in-cluster config unset, so IsInCluster is false.
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "not running in-cluster", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_NilK8sClient(t *testing.T) {
	env := setupTestEnv(t)
	h := NewSelfUpgradeHandler(nil, env.Hub, env.Store)
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Equal(t, "not running in-cluster", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_NamespaceUnknown(t *testing.T) {
	// Empty POD_NAMESPACE forces the service-account file fallback, which is
	// absent on a developer machine and in CI, so getNamespace returns "".
	t.Setenv("POD_NAMESPACE", "")
	if getNamespace() != "" {
		t.Skip("running inside a pod with a mounted service-account namespace")
	}

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	h.inClusterClient = k8sfake.NewSimpleClientset()
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, "could not determine pod namespace", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_ClientUnavailable(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kubestellar")
	// Unset the in-cluster downward-API env so rest.InClusterConfig fails
	// deterministically even when the test itself runs inside a pod.
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("KUBERNETES_SERVICE_PORT", "")

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	// No injected inClusterClient: getInClusterClient must build one and fail.
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, "cluster client unavailable", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_DeploymentNotFound(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kubestellar")
	t.Setenv("HELM_RELEASE_NAME", "")

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	h.inClusterClient = k8sfake.NewSimpleClientset() // no deployments at all
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	assert.Equal(t, "deployment not found", decodeTriggerResponse(t, resp).Error)
}

func TestSelfUpgradeHandler_TriggerUpgrade_RBACDenied(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kubestellar")

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	fakeClient := k8sfake.NewSimpleClientset(consoleDeployment(corev1.Container{Name: "console", Image: "ghcr.io/kubestellar/console:v0.1.0"}))
	allowSSAR(fakeClient, false)

	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	h.inClusterClient = fakeClient
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	assert.Contains(t, decodeTriggerResponse(t, resp).Error, "insufficient RBAC permissions")
}

func TestSelfUpgradeHandler_TriggerUpgrade_NoContainers(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kubestellar")

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	fakeClient := k8sfake.NewSimpleClientset(consoleDeployment())
	allowSSAR(fakeClient, true)

	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	h.inClusterClient = fakeClient
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	assert.Contains(t, decodeTriggerResponse(t, resp).Error, "has no containers")
}

func TestSelfUpgradeHandler_TriggerUpgrade_PatchFailed(t *testing.T) {
	t.Setenv("POD_NAMESPACE", "kubestellar")

	env := setupTestEnv(t)
	env.K8sClient.SetInClusterConfig(&dummyRestConfig)
	fakeClient := k8sfake.NewSimpleClientset(consoleDeployment(corev1.Container{Name: "console", Image: "ghcr.io/kubestellar/console:v0.1.0"}))
	allowSSAR(fakeClient, true)
	fakeClient.PrependReactor("patch", "deployments", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, errors.New("apiserver unavailable")
	})

	h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
	h.inClusterClient = fakeClient
	env.App.Post(testSelfUpgradeTriggerPath, h.TriggerUpgrade)

	resp := postTrigger(t, env.App, triggerBody(t, "v0.2.0"))
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	out := decodeTriggerResponse(t, resp)
	assert.False(t, out.Success)
	assert.NotEmpty(t, out.Error)
}

func TestRegisterSelfUpgrade_WiresRoutes(t *testing.T) {
	env := setupTestEnv(t)
	RegisterSelfUpgrade(env.App, env.K8sClient, env.Hub, env.Store)

	req := httptest.NewRequest(http.MethodGet, "/self-upgrade/status", nil)
	req.Host = "localhost"
	resp, err := env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	req = httptest.NewRequest(http.MethodPost, "/self-upgrade/trigger", bytes.NewReader(triggerBody(t, "v0.2.0")))
	req.Host = "localhost"
	req.Header.Set("Content-Type", "application/json")
	resp, err = env.App.Test(req, fiberTestTimeout)
	require.NoError(t, err)
	// Not in-cluster under test, so the trigger route answers 400 rather than 404.
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}
