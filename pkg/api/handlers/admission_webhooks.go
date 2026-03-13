package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// GVRs for webhook configurations
var (
	validatingWebhookGVR = schema.GroupVersionResource{
		Group:    "admissionregistration.k8s.io",
		Version:  "v1",
		Resource: "validatingwebhookconfigurations",
	}
	mutatingWebhookGVR = schema.GroupVersionResource{
		Group:    "admissionregistration.k8s.io",
		Version:  "v1",
		Resource: "mutatingwebhookconfigurations",
	}
)

// WebhookHandlers handles admission webhook API endpoints
type WebhookHandlers struct {
	k8sClient *k8s.MultiClusterClient
}

// NewWebhookHandlers creates a new webhook handlers instance
func NewWebhookHandlers(k8sClient *k8s.MultiClusterClient) *WebhookHandlers {
	return &WebhookHandlers{
		k8sClient: k8sClient,
	}
}

// WebhookSummary represents a webhook configuration as returned by the API
type WebhookSummary struct {
	Name          string `json:"name"`
	Type          string `json:"type"` // "mutating" or "validating"
	FailurePolicy string `json:"failurePolicy"`
	MatchPolicy   string `json:"matchPolicy"`
	Rules         int    `json:"rules"`
	Cluster       string `json:"cluster"`
}

// WebhookListResponse is the response for GET /api/admission-webhooks
type WebhookListResponse struct {
	Webhooks   []WebhookSummary `json:"webhooks"`
	IsDemoData bool             `json:"isDemoData"`
}

// HTTP status code for service unavailable
const statusServiceUnavailableWebhook = 503

// ListWebhooks returns all admission webhook configurations across clusters
// GET /api/admission-webhooks
func (h *WebhookHandlers) ListWebhooks(c *fiber.Ctx) error {
	if h.k8sClient == nil {
		return c.Status(statusServiceUnavailableWebhook).JSON(WebhookListResponse{
			Webhooks:   []WebhookSummary{},
			IsDemoData: true,
		})
	}

	clusters, err := h.k8sClient.DeduplicatedClusters(c.Context())
	if err != nil {
		clusters, _ = h.k8sClient.ListClusters(c.Context())
	}

	var allWebhooks []WebhookSummary

	for _, cluster := range clusters {
		client, err := h.k8sClient.GetDynamicClient(cluster.Name)
		if err != nil {
			continue
		}

		// Fetch validating webhooks
		valList, err := client.Resource(validatingWebhookGVR).List(c.Context(), metav1.ListOptions{})
		if err == nil {
			for _, item := range valList.Items {
				wh := parseWebhookFromUnstructured(&item, cluster.Name, "validating")
				if wh != nil {
					allWebhooks = append(allWebhooks, *wh)
				}
			}
		}

		// Fetch mutating webhooks
		mutList, err := client.Resource(mutatingWebhookGVR).List(c.Context(), metav1.ListOptions{})
		if err == nil {
			for _, item := range mutList.Items {
				wh := parseWebhookFromUnstructured(&item, cluster.Name, "mutating")
				if wh != nil {
					allWebhooks = append(allWebhooks, *wh)
				}
			}
		}
	}

	return c.JSON(WebhookListResponse{
		Webhooks:   allWebhooks,
		IsDemoData: false,
	})
}

// parseWebhookFromUnstructured extracts webhook info from an unstructured object
func parseWebhookFromUnstructured(item *unstructured.Unstructured, cluster, whType string) *WebhookSummary {
	name := item.GetName()

	// Count rules and extract policies from the webhooks array
	failurePolicy := "Fail"
	matchPolicy := "Exact"
	ruleCount := 0

	// The webhook list is under "webhooks" for both mutating and validating
	if webhooks, ok := item.Object["webhooks"].([]interface{}); ok {
		for _, wh := range webhooks {
			whMap, ok := wh.(map[string]interface{})
			if !ok {
				continue
			}

			// Count rules across all webhooks in this configuration
			if rules, ok := whMap["rules"].([]interface{}); ok {
				ruleCount += len(rules)
			}

			// Use failure policy from first webhook entry
			if fp, ok := whMap["failurePolicy"].(string); ok && ruleCount <= len(webhooks) {
				failurePolicy = fp
			}
			if mp, ok := whMap["matchPolicy"].(string); ok && ruleCount <= len(webhooks) {
				matchPolicy = mp
			}
		}
	}

	return &WebhookSummary{
		Name:          name,
		Type:          whType,
		FailurePolicy: failurePolicy,
		MatchPolicy:   matchPolicy,
		Rules:         ruleCount,
		Cluster:       cluster,
	}
}
