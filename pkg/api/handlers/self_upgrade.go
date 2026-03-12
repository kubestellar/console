package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	appsv1 "k8s.io/api/apps/v1"
	authorizationv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	k8sclient "github.com/kubestellar/console/pkg/k8s"
)

// Self-upgrade timeout for Kubernetes API calls
const selfUpgradeTimeout = 30 * time.Second

// SelfUpgradeHandler handles in-console Helm self-upgrade via Deployment patch.
type SelfUpgradeHandler struct {
	k8sClient *k8sclient.MultiClusterClient
	hub       *Hub
}

// NewSelfUpgradeHandler creates a new SelfUpgradeHandler.
func NewSelfUpgradeHandler(k8sClient *k8sclient.MultiClusterClient, hub *Hub) *SelfUpgradeHandler {
	return &SelfUpgradeHandler{
		k8sClient: k8sClient,
		hub:       hub,
	}
}

// SelfUpgradeStatusResponse is the response for GET /api/self-upgrade/status.
type SelfUpgradeStatusResponse struct {
	Available      bool   `json:"available"`       // Whether self-upgrade is possible
	CanPatch       bool   `json:"canPatch"`        // Whether RBAC allows Deployment patching
	Namespace      string `json:"namespace"`       // Pod namespace (from env)
	DeploymentName string `json:"deploymentName"`  // Deployment name (discovered)
	CurrentImage   string `json:"currentImage"`    // Current container image:tag
	ReleaseName    string `json:"releaseName"`     // Helm release name (from env)
	Reason         string `json:"reason,omitempty"` // Why unavailable
}

// SelfUpgradeTriggerRequest is the request for POST /api/self-upgrade/trigger.
type SelfUpgradeTriggerRequest struct {
	ImageTag string `json:"imageTag"` // Target image tag (e.g., "v0.3.12-nightly.20260312")
}

// SelfUpgradeTriggerResponse is the response for POST /api/self-upgrade/trigger.
type SelfUpgradeTriggerResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

// getNamespace returns the pod namespace from the downward API env var,
// falling back to reading the service account namespace file.
func getNamespace() string {
	if ns := os.Getenv("POD_NAMESPACE"); ns != "" {
		return ns
	}
	// Fallback: read from mounted service account
	data, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
	if err == nil && len(data) > 0 {
		return strings.TrimSpace(string(data))
	}
	return ""
}

// getReleaseName returns the Helm release name from the env var.
func getReleaseName() string {
	return os.Getenv("HELM_RELEASE_NAME")
}

// getInClusterClient creates a typed Kubernetes client using the in-cluster config.
func (h *SelfUpgradeHandler) getInClusterClient() (kubernetes.Interface, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("not running in-cluster: %w", err)
	}
	client, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create in-cluster client: %w", err)
	}
	return client, nil
}

// findDeployment discovers the console Deployment in the given namespace.
// It looks for a Deployment with app.kubernetes.io/name=kubestellar-console labels.
func (h *SelfUpgradeHandler) findDeployment(ctx context.Context, client kubernetes.Interface, namespace string) (*appsv1.Deployment, error) {
	// Try by standard Helm labels first
	deployments, err := client.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/name=kubestellar-console",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list deployments: %w", err)
	}
	if len(deployments.Items) > 0 {
		return &deployments.Items[0], nil
	}

	// Fallback: try by release name
	releaseName := getReleaseName()
	if releaseName != "" {
		dep, err := client.AppsV1().Deployments(namespace).Get(ctx, releaseName, metav1.GetOptions{})
		if err == nil {
			return dep, nil
		}
	}

	return nil, fmt.Errorf("no kubestellar-console Deployment found in namespace %s", namespace)
}

// canPatchDeployment checks if the ServiceAccount has permission to patch Deployments
// in the given namespace using a SelfSubjectAccessReview.
func (h *SelfUpgradeHandler) canPatchDeployment(ctx context.Context, client kubernetes.Interface, namespace string) bool {
	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "patch",
				Group:     "apps",
				Resource:  "deployments",
			},
		},
	}
	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		log.Printf("[self-upgrade] RBAC check failed: %v", err)
		return false
	}
	return result.Status.Allowed
}

// GetStatus returns the self-upgrade availability status.
// GET /api/self-upgrade/status
func (h *SelfUpgradeHandler) GetStatus(c *fiber.Ctx) error {
	resp := SelfUpgradeStatusResponse{}

	// Must be in-cluster
	if h.k8sClient == nil || !h.k8sClient.IsInCluster() {
		resp.Reason = "not running in-cluster"
		return c.JSON(resp)
	}

	namespace := getNamespace()
	if namespace == "" {
		resp.Reason = "could not determine pod namespace"
		return c.JSON(resp)
	}
	resp.Namespace = namespace
	resp.ReleaseName = getReleaseName()

	ctx, cancel := context.WithTimeout(context.Background(), selfUpgradeTimeout)
	defer cancel()

	client, err := h.getInClusterClient()
	if err != nil {
		resp.Reason = err.Error()
		return c.JSON(resp)
	}

	// Discover the Deployment
	dep, err := h.findDeployment(ctx, client, namespace)
	if err != nil {
		resp.Reason = err.Error()
		return c.JSON(resp)
	}
	resp.DeploymentName = dep.Name

	// Get current image
	if len(dep.Spec.Template.Spec.Containers) > 0 {
		resp.CurrentImage = dep.Spec.Template.Spec.Containers[0].Image
	}

	// Check RBAC
	resp.CanPatch = h.canPatchDeployment(ctx, client, namespace)
	if !resp.CanPatch {
		resp.Reason = "insufficient RBAC — deploy with selfUpgrade.enabled=true"
		return c.JSON(resp)
	}

	resp.Available = true
	return c.JSON(resp)
}

// TriggerUpgrade patches the Deployment image tag to trigger a rolling update.
// POST /api/self-upgrade/trigger
func (h *SelfUpgradeHandler) TriggerUpgrade(c *fiber.Ctx) error {
	var req SelfUpgradeTriggerRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(SelfUpgradeTriggerResponse{
			Error: "invalid request body",
		})
	}

	if req.ImageTag == "" {
		return c.Status(fiber.StatusBadRequest).JSON(SelfUpgradeTriggerResponse{
			Error: "imageTag is required",
		})
	}

	// Validate image tag format (prevent injection)
	if strings.ContainsAny(req.ImageTag, " \t\n\"'\\{}") {
		return c.Status(fiber.StatusBadRequest).JSON(SelfUpgradeTriggerResponse{
			Error: "invalid imageTag format",
		})
	}

	if h.k8sClient == nil || !h.k8sClient.IsInCluster() {
		return c.Status(fiber.StatusBadRequest).JSON(SelfUpgradeTriggerResponse{
			Error: "not running in-cluster",
		})
	}

	namespace := getNamespace()
	if namespace == "" {
		return c.Status(fiber.StatusInternalServerError).JSON(SelfUpgradeTriggerResponse{
			Error: "could not determine pod namespace",
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), selfUpgradeTimeout)
	defer cancel()

	client, err := h.getInClusterClient()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(SelfUpgradeTriggerResponse{
			Error: err.Error(),
		})
	}

	// Discover the Deployment
	dep, err := h.findDeployment(ctx, client, namespace)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(SelfUpgradeTriggerResponse{
			Error: err.Error(),
		})
	}

	// Verify RBAC before proceeding
	if !h.canPatchDeployment(ctx, client, namespace) {
		return c.Status(fiber.StatusForbidden).JSON(SelfUpgradeTriggerResponse{
			Error: "insufficient RBAC permissions — deploy with selfUpgrade.enabled=true",
		})
	}

	// Build the new image reference
	currentImage := ""
	if len(dep.Spec.Template.Spec.Containers) > 0 {
		currentImage = dep.Spec.Template.Spec.Containers[0].Image
	}

	// Extract repository from current image (e.g., "ghcr.io/kubestellar/console:v0.3.11" → "ghcr.io/kubestellar/console")
	repo := currentImage
	if idx := strings.LastIndex(repo, ":"); idx > 0 {
		repo = repo[:idx]
	}
	// Handle @sha256 digests
	if idx := strings.LastIndex(repo, "@"); idx > 0 {
		repo = repo[:idx]
	}
	newImage := repo + ":" + req.ImageTag

	log.Printf("[self-upgrade] Upgrading %s/%s: %s → %s", namespace, dep.Name, currentImage, newImage)

	// Broadcast progress to all WebSocket clients
	h.hub.BroadcastAll(Message{
		Type: "update_progress",
		Data: map[string]any{
			"status":   "running",
			"step":     1,
			"progress": 20,
			"message":  fmt.Sprintf("Patching deployment image to %s", req.ImageTag),
		},
	})

	// Build JSON patch to update the container image
	patch := []map[string]any{
		{
			"op":    "replace",
			"path":  "/spec/template/spec/containers/0/image",
			"value": newImage,
		},
	}
	patchBytes, err := json.Marshal(patch)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(SelfUpgradeTriggerResponse{
			Error: "failed to marshal patch",
		})
	}

	// Apply the patch
	_, err = client.AppsV1().Deployments(namespace).Patch(
		ctx,
		dep.Name,
		types.JSONPatchType,
		patchBytes,
		metav1.PatchOptions{},
	)
	if err != nil {
		log.Printf("[self-upgrade] Patch failed: %v", err)
		h.hub.BroadcastAll(Message{
			Type: "update_progress",
			Data: map[string]any{
				"status":  "failed",
				"message": "Failed to patch deployment",
				"error":   err.Error(),
			},
		})
		return c.Status(fiber.StatusInternalServerError).JSON(SelfUpgradeTriggerResponse{
			Error: fmt.Sprintf("failed to patch deployment: %v", err),
		})
	}

	log.Printf("[self-upgrade] Deployment patched successfully, rollout starting")

	// Broadcast success — the pod will be terminated shortly by the rollout
	h.hub.BroadcastAll(Message{
		Type: "update_progress",
		Data: map[string]any{
			"status":   "running",
			"step":     2,
			"progress": 60,
			"message":  "Deployment patched — waiting for rollout",
		},
	})

	return c.JSON(SelfUpgradeTriggerResponse{
		Success: true,
		Message: fmt.Sprintf("Deployment %s patched to %s — rollout in progress", dep.Name, newImage),
	})
}
