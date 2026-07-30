package handlers

import (
	"bytes"
	"encoding/json"
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
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"

	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
)

func TestSelfUpgradeHandler_GetStatus(t *testing.T) {
	t.Run("security: non-admin denied", func(t *testing.T) {
		env := setupTestEnv(t)
		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)

		viewerID := uuid.New()
		env.App.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", viewerID)
			return c.Next()
		})

		mockStore := env.Store.(*test.MockStore)
		mockStore.On("GetUser", viewerID).Return(&models.User{
			ID:   viewerID,
			Role: models.UserRoleViewer,
		}, nil)

		env.App.Get("/api/self-upgrade/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/api/self-upgrade/status", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("not in-cluster", func(t *testing.T) {
		env := setupTestEnv(t)
		// MultiClusterClient.IsInCluster returns false if inClusterConfig is nil
		// setupTestEnv initializes it with a non-in-cluster client by default.

		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		env.App.Get("/api/self-upgrade/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/api/self-upgrade/status", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var status SelfUpgradeStatusResponse
		err = json.NewDecoder(resp.Body).Decode(&status)
		require.NoError(t, err)
		assert.False(t, status.Available)
		assert.Equal(t, "not running in-cluster", status.Reason)
	})

	t.Run("in-cluster, success", func(t *testing.T) {
		t.Setenv("POD_NAMESPACE", "kubestellar")
		t.Setenv("HELM_RELEASE_NAME", "my-console")

		env := setupTestEnv(t)
		// Mock IsInCluster=true by setting a dummy rest.Config
		env.K8sClient.SetInClusterConfig(&dummyRestConfig)

		deployment := &appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-console",
				Namespace: "kubestellar",
				Labels: map[string]string{
					"app.kubernetes.io/name": "kubestellar-console",
				},
			},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{
							{
								Name:  "console",
								Image: "ghcr.io/kubestellar/console:v0.1.0",
							},
						},
					},
				},
			},
		}

		fakeClient := k8sfake.NewSimpleClientset(deployment)
		// Add reactor for SelfSubjectAccessReview
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			return true, &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}, nil
		})

		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		h.inClusterClient = fakeClient
		env.App.Get("/api/self-upgrade/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/api/self-upgrade/status", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var status SelfUpgradeStatusResponse
		err = json.NewDecoder(resp.Body).Decode(&status)
		require.NoError(t, err)
		assert.True(t, status.Available)
		assert.True(t, status.CanPatch)
		assert.Equal(t, "kubestellar", status.Namespace)
		assert.Equal(t, "my-console", status.DeploymentName)
		assert.Equal(t, "ghcr.io/kubestellar/console:v0.1.0", status.CurrentImage)
		assert.Equal(t, "my-console", status.ReleaseName)
	})

	t.Run("in-cluster, RBAC denied", func(t *testing.T) {
		t.Setenv("POD_NAMESPACE", "kubestellar")

		env := setupTestEnv(t)
		env.K8sClient.SetInClusterConfig(&dummyRestConfig)

		deployment := &appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "kubestellar-console",
				Namespace: "kubestellar",
				Labels: map[string]string{
					"app.kubernetes.io/name": "kubestellar-console",
				},
			},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{{Image: "foo:bar"}},
					},
				},
			},
		}

		fakeClient := k8sfake.NewSimpleClientset(deployment)
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			return true, &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: false,
				},
			}, nil
		})

		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		h.inClusterClient = fakeClient
		env.App.Get("/api/self-upgrade/status", h.GetStatus)

		req := httptest.NewRequest("GET", "/api/self-upgrade/status", nil)
		req.Host = "localhost"
		resp, err := env.App.Test(req)
		require.NoError(t, err)

		var status SelfUpgradeStatusResponse
		err = json.NewDecoder(resp.Body).Decode(&status)
		require.NoError(t, err)
		assert.False(t, status.Available)
		assert.False(t, status.CanPatch)
		assert.Contains(t, status.Reason, "insufficient RBAC")
	})
}

func TestSelfUpgradeHandler_TriggerUpgrade(t *testing.T) {
	t.Run("security: non-admin denied", func(t *testing.T) {
		env := setupTestEnv(t)
		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)

		// Override the userID with a viewer ID to bypass the default admin
		// mock injected by setupTestEnv. Middlewares run in order; this
		// second assignment overwrites the first.
		viewerID := uuid.New()
		env.App.Use(func(c *fiber.Ctx) error {
			c.Locals("userID", viewerID)
			return c.Next()
		})

		// Mock store to return a viewer for this ID
		mockStore := env.Store.(*test.MockStore)
		mockStore.On("GetUser", viewerID).Return(&models.User{
			ID:   viewerID,
			Role: models.UserRoleViewer,
		}, nil)

		env.App.Post("/api/self-upgrade/trigger", h.TriggerUpgrade)

		body, _ := json.Marshal(SelfUpgradeTriggerRequest{ImageTag: "v0.2.0"})
		req := httptest.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")

		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	})

	t.Run("validation: invalid image tag", func(t *testing.T) {
		env := setupTestEnv(t)
		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		env.App.Post("/api/self-upgrade/trigger", h.TriggerUpgrade)

		// Test malicious tags (Focus: Binary download validation)
		maliciousTags := []string{
			"../forbidden",
			"latest; rm -rf /",
			"image:v1",
			"image@sha256:abc",
			"very" + string(make([]byte, 200)) + "long",
		}

		for _, tag := range maliciousTags {
			body, _ := json.Marshal(SelfUpgradeTriggerRequest{ImageTag: tag})
			req := httptest.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
			req.Host = "localhost"
			req.Header.Set("Content-Type", "application/json")

			resp, err := env.App.Test(req)
			require.NoError(t, err)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "Tag '%s' should be rejected", tag)
		}
	})

	t.Run("success: deployment patched", func(t *testing.T) {
		t.Setenv("POD_NAMESPACE", "kubestellar")

		env := setupTestEnv(t)
		env.K8sClient.SetInClusterConfig(&dummyRestConfig)

		deployment := &appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "kubestellar-console",
				Namespace: "kubestellar",
				Labels: map[string]string{
					"app.kubernetes.io/name": "kubestellar-console",
				},
			},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{
							{
								Name:  "console",
								Image: "ghcr.io/kubestellar/console:v0.1.0",
							},
						},
					},
				},
			},
		}

		fakeClient := k8sfake.NewSimpleClientset(deployment)
		// Allow patch
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			return true, &authorizationv1.SelfSubjectAccessReview{
				Status: authorizationv1.SubjectAccessReviewStatus{
					Allowed: true,
				},
			}, nil
		})

		var patchBytes []byte
		fakeClient.PrependReactor("patch", "deployments", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			patchBytes = action.(k8stesting.PatchAction).GetPatch()
			return true, deployment, nil
		})

		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		h.inClusterClient = fakeClient
		env.App.Post("/api/self-upgrade/trigger", h.TriggerUpgrade)

		body, _ := json.Marshal(SelfUpgradeTriggerRequest{ImageTag: "v0.1.1"})
		req := httptest.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")

		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Verify patch content (Focus: Restart trigger logic via rollout)
		assert.NotEmpty(t, patchBytes)
		var patch []map[string]any
		err = json.Unmarshal(patchBytes, &patch)
		require.NoError(t, err)
		assert.Equal(t, "replace", patch[0]["op"])
		assert.Equal(t, "/spec/template/spec/containers/0/image", patch[0]["path"])
		assert.Equal(t, "ghcr.io/kubestellar/console:v0.1.1", patch[0]["value"])

		// Verify response
		var trResp SelfUpgradeTriggerResponse
		err = json.NewDecoder(resp.Body).Decode(&trResp)
		require.NoError(t, err)
		assert.True(t, trResp.Success)
		assert.Contains(t, trResp.Message, "patched to ghcr.io/kubestellar/console:v0.1.1")
	})

	t.Run("digest preservation", func(t *testing.T) {
		t.Setenv("POD_NAMESPACE", "kubestellar")

		env := setupTestEnv(t)
		env.K8sClient.SetInClusterConfig(&dummyRestConfig)

		deployment := &appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "kubestellar-console",
				Namespace: "kubestellar",
				Labels: map[string]string{
					"app.kubernetes.io/name": "kubestellar-console",
				},
			},
			Spec: appsv1.DeploymentSpec{
				Template: corev1.PodTemplateSpec{
					Spec: corev1.PodSpec{
						Containers: []corev1.Container{
							{
								Name:  "console",
								Image: "ghcr.io/kubestellar/console:v0.1.0@sha256:abc123",
							},
						},
					},
				},
			},
		}

		fakeClient := k8sfake.NewSimpleClientset(deployment)
		fakeClient.PrependReactor("create", "selfsubjectaccessreviews", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			return true, &authorizationv1.SelfSubjectAccessReview{Status: authorizationv1.SubjectAccessReviewStatus{Allowed: true}}, nil
		})

		var patchBytes []byte
		fakeClient.PrependReactor("patch", "deployments", func(action k8stesting.Action) (handled bool, ret runtime.Object, err error) {
			patchBytes = action.(k8stesting.PatchAction).GetPatch()
			return true, deployment, nil
		})

		h := NewSelfUpgradeHandler(env.K8sClient, env.Hub, env.Store)
		h.inClusterClient = fakeClient
		env.App.Post("/api/self-upgrade/trigger", h.TriggerUpgrade)

		body, _ := json.Marshal(SelfUpgradeTriggerRequest{ImageTag: "v0.1.1"})
		req := httptest.NewRequest("POST", "/api/self-upgrade/trigger", bytes.NewReader(body))
		req.Host = "localhost"
		req.Header.Set("Content-Type", "application/json")

		resp, err := env.App.Test(req)
		require.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		// Verify digest was preserved
		var patch []map[string]any
		json.Unmarshal(patchBytes, &patch)
		assert.Equal(t, "ghcr.io/kubestellar/console:v0.1.1@sha256:abc123", patch[0]["value"])
	})
}

// dummyRestConfig is a minimal rest.Config to satisfy MultiClusterClient.IsInCluster()
var dummyRestConfig = rest.Config{}
