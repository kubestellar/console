package handlers

import (
	"context"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"golang.org/x/sync/errgroup"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// webhookListTimeout is the timeout for listing webhooks across all clusters.
const webhookListTimeout = 30 * time.Second

// defaultClusterFanoutConcurrency bounds how many clusters a handler fans out
// to in parallel. 4 matches the HTTP/1.1 keep-alive connection budget that
// PR #7765 established (MaxConnsPerHost=4 per cluster transport): going wider
// than 4 simultaneous list calls against the same kube-apiserver just queues
// on the pooled TCP connections and provides no speedup while risking control
// plane saturation on large fleets. The same budget is reused for every
// per-cluster fanout (admission_webhooks, rbac service accounts, custom
// resources) so we never double-book the transport pool.
const defaultClusterFanoutConcurrency = 4

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

// WebhookListResponse is the response for GET /api/admission-webhooks.
// Errors maps cluster name -> error message for clusters whose webhook list
// failed; the UI surfaces partial errors alongside successful results so a
// single dead cluster no longer silently disappears from the view (#7967).
type WebhookListResponse struct {
	Webhooks   []WebhookSummary  `json:"webhooks"`
	Errors     map[string]string `json:"errors,omitempty"`
	IsDemoData bool              `json:"isDemoData"`
}

// statusServiceUnavailableWebhook uses fiber's standard constant for 503 responses.
const statusServiceUnavailableWebhook = fiber.StatusServiceUnavailable

// ListWebhooks returns all admission webhook configurations across clusters
// GET /api/admission-webhooks
func (h *WebhookHandlers) ListWebhooks(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(WebhookListResponse{
			Webhooks:   getDemoWebhooks(),
			IsDemoData: true,
		})
	}

	if h.k8sClient == nil {
		return c.Status(statusServiceUnavailableWebhook).JSON(WebhookListResponse{
			Webhooks:   []WebhookSummary{},
			IsDemoData: true,
		})
	}

	ctx, cancel := context.WithTimeout(c.Context(), webhookListTimeout)
	defer cancel()

	clusters, err := h.k8sClient.DeduplicatedClusters(ctx)
	if err != nil {
		var listErr error
		clusters, listErr = h.k8sClient.ListClusters(ctx)
		if listErr != nil {
			return c.Status(statusServiceUnavailableWebhook).JSON(fiber.Map{"error": "cluster discovery failed", "isDemoData": false})
		}
	}

	allWebhooks := make([]WebhookSummary, 0)
	clusterErrors := make(map[string]string)
	var mu sync.Mutex

	// Fan out across clusters in parallel (#7966). errgroup.SetLimit bounds
	// concurrency to the shared per-cluster HTTP/1.1 connection budget so
	// we do not oversubscribe the transport pool established in PR #7765.
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(defaultClusterFanoutConcurrency)

	for _, cluster := range clusters {
		clusterName := cluster.Name
		g.Go(func() error {
			client, err := h.k8sClient.GetDynamicClient(clusterName)
			if err != nil {
				mu.Lock()
				clusterErrors[clusterName] = err.Error()
				mu.Unlock()
				return nil
			}

			localWebhooks := make([]WebhookSummary, 0)

			// Fetch validating webhooks — per-cluster errors are collected
			// into clusterErrors (#7967) instead of silently swallowed.
			valList, valErr := client.Resource(validatingWebhookGVR).List(gctx, metav1.ListOptions{})
			if valErr == nil {
				for _, item := range valList.Items {
					wh := parseWebhookFromUnstructured(&item, clusterName, "validating")
					if wh != nil {
						localWebhooks = append(localWebhooks, *wh)
					}
				}
			}

			// Fetch mutating webhooks
			mutList, mutErr := client.Resource(mutatingWebhookGVR).List(gctx, metav1.ListOptions{})
			if mutErr == nil {
				for _, item := range mutList.Items {
					wh := parseWebhookFromUnstructured(&item, clusterName, "mutating")
					if wh != nil {
						localWebhooks = append(localWebhooks, *wh)
					}
				}
			}

			mu.Lock()
			defer mu.Unlock()
			allWebhooks = append(allWebhooks, localWebhooks...)
			switch {
			case valErr != nil && mutErr != nil:
				clusterErrors[clusterName] = "validating: " + valErr.Error() + "; mutating: " + mutErr.Error()
			case valErr != nil:
				clusterErrors[clusterName] = "validating: " + valErr.Error()
			case mutErr != nil:
				clusterErrors[clusterName] = "mutating: " + mutErr.Error()
			}
			return nil
		})
	}
	_ = g.Wait() // per-cluster errors are non-fatal and collected in clusterErrors.

	resp := WebhookListResponse{
		Webhooks:   allWebhooks,
		IsDemoData: false,
	}
	if len(clusterErrors) > 0 {
		resp.Errors = clusterErrors
	}
	return c.JSON(resp)
}

// parseWebhookFromUnstructured extracts webhook info from an unstructured object
func parseWebhookFromUnstructured(item *unstructured.Unstructured, cluster, whType string) *WebhookSummary {
	name := item.GetName()

	// Count rules and extract policies from the webhooks array
	failurePolicy := "Fail"
	matchPolicy := "Exact"
	ruleCount := 0
	policyExtracted := false

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

			// Use failure/match policy from the first webhook entry that has them
			if !policyExtracted {
				if fp, ok := whMap["failurePolicy"].(string); ok {
					failurePolicy = fp
				}
				if mp, ok := whMap["matchPolicy"].(string); ok {
					matchPolicy = mp
				}
				policyExtracted = true
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
