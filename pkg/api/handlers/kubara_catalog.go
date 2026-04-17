// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	// kubaraCatalogCacheTTL is how long a successful catalog fetch is cached
	// before re-fetching from GitHub. All users share a single cached copy
	// so only one upstream request is made per TTL window (#8487).
	kubaraCatalogCacheTTL = 10 * time.Minute

	// kubaraCatalogTimeout is the HTTP timeout for the upstream GitHub
	// Contents API call when refreshing the catalog.
	kubaraCatalogTimeout = 15 * time.Second

	// kubaraCatalogMaxResponseBytes caps the response body from the upstream
	// GitHub Contents API to prevent unbounded memory consumption.
	kubaraCatalogMaxResponseBytes = 5 * 1024 * 1024 // 5 MB

	// kubaraCatalogUpstreamURL is the GitHub Contents API endpoint for the
	// kubara-io/kubara repository's helm directory.
	kubaraCatalogUpstreamURL = "https://api.github.com/repos/kubara-io/kubara/contents/helm"
)

// KubaraCatalogEntry represents a single chart directory in the Kubara repo.
type KubaraCatalogEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
}

// KubaraCatalogHandler serves the Kubara platform catalog with an in-process
// cache so that multiple users share a single upstream fetch (#8487).
type KubaraCatalogHandler struct {
	githubToken string
	httpClient  *http.Client

	mu       sync.RWMutex
	cache    []KubaraCatalogEntry
	cacheExp time.Time
}

// NewKubaraCatalogHandler creates a new handler for the Kubara catalog endpoint.
func NewKubaraCatalogHandler(githubToken string) *KubaraCatalogHandler {
	return &KubaraCatalogHandler{
		githubToken: githubToken,
		httpClient:  &http.Client{Timeout: kubaraCatalogTimeout},
	}
}

// GetCatalog handles GET /api/kubara/catalog — returns the cached Kubara
// chart index, refreshing from upstream if the cache has expired.
func (h *KubaraCatalogHandler) GetCatalog(c *fiber.Ctx) error {
	// Demo mode: return static demo catalog immediately
	if isDemoMode(c) {
		return c.JSON(fiber.Map{
			"entries": getDemoKubaraCatalog(),
			"source":  "demo",
		})
	}

	// Check cache (read lock)
	h.mu.RLock()
	if h.cache != nil && time.Now().Before(h.cacheExp) {
		entries := h.cache
		h.mu.RUnlock()
		return c.JSON(fiber.Map{
			"entries": entries,
			"source":  "cache",
		})
	}
	h.mu.RUnlock()

	// Cache miss — fetch from upstream (write lock)
	h.mu.Lock()
	defer h.mu.Unlock()

	// Double-check: another goroutine may have refreshed while we waited
	if h.cache != nil && time.Now().Before(h.cacheExp) {
		return c.JSON(fiber.Map{
			"entries": h.cache,
			"source":  "cache",
		})
	}

	entries, err := h.fetchUpstream()
	if err != nil {
		slog.Error("[KubaraCatalog] upstream fetch failed", "error", err)
		// If we have a stale cache, serve it rather than failing
		if h.cache != nil {
			return c.JSON(fiber.Map{
				"entries": h.cache,
				"source":  "stale-cache",
			})
		}
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to fetch Kubara catalog",
		})
	}

	h.cache = entries
	h.cacheExp = time.Now().Add(kubaraCatalogCacheTTL)

	return c.JSON(fiber.Map{
		"entries": entries,
		"source":  "upstream",
	})
}

// fetchUpstream calls the GitHub Contents API for the kubara-io/kubara repo.
func (h *KubaraCatalogHandler) fetchUpstream() ([]KubaraCatalogEntry, error) {
	req, err := http.NewRequest(http.MethodGet, kubaraCatalogUpstreamURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "KubeStellar-Console-KubaraCatalog")
	if h.githubToken != "" {
		req.Header.Set("Authorization", "Bearer "+h.githubToken)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fiber.NewError(resp.StatusCode, "GitHub API returned non-200 status")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, kubaraCatalogMaxResponseBytes))
	if err != nil {
		return nil, err
	}

	// GitHub Contents API returns an array of objects for directory listings
	var raw []struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	entries := make([]KubaraCatalogEntry, 0, len(raw))
	for _, item := range raw {
		if item.Type == "dir" {
			entries = append(entries, KubaraCatalogEntry{
				Name: item.Name,
				Path: item.Path,
				Type: item.Type,
			})
		}
	}

	return entries, nil
}

// getDemoKubaraCatalog returns realistic fixture data for demo mode (#8486).
func getDemoKubaraCatalog() []KubaraCatalogEntry {
	return []KubaraCatalogEntry{
		{
			Name:        "prometheus-stack",
			Path:        "helm/prometheus-stack",
			Type:        "dir",
			Description: "Production Prometheus + Grafana + Alertmanager monitoring stack",
		},
		{
			Name:        "cert-manager",
			Path:        "helm/cert-manager",
			Type:        "dir",
			Description: "Automated TLS certificate management with Let's Encrypt and custom CAs",
		},
		{
			Name:        "falco-runtime-security",
			Path:        "helm/falco-runtime-security",
			Type:        "dir",
			Description: "Runtime threat detection and incident response for containers",
		},
		{
			Name:        "kyverno-policies",
			Path:        "helm/kyverno-policies",
			Type:        "dir",
			Description: "Kubernetes-native policy engine for admission control and governance",
		},
		{
			Name:        "argocd-gitops",
			Path:        "helm/argocd-gitops",
			Type:        "dir",
			Description: "Declarative GitOps continuous delivery with Argo CD",
		},
		{
			Name:        "istio-service-mesh",
			Path:        "helm/istio-service-mesh",
			Type:        "dir",
			Description: "Service mesh for traffic management, mTLS, and observability",
		},
		{
			Name:        "velero-backups",
			Path:        "helm/velero-backups",
			Type:        "dir",
			Description: "Cluster backup, disaster recovery, and migration tooling",
		},
		{
			Name:        "external-secrets",
			Path:        "helm/external-secrets",
			Type:        "dir",
			Description: "Sync secrets from AWS Secrets Manager, Vault, GCP, and Azure Key Vault",
		},
		{
			Name:        "trivy-vulnerability-scanner",
			Path:        "helm/trivy-vulnerability-scanner",
			Type:        "dir",
			Description: "Container image and filesystem vulnerability scanning",
		},
		{
			Name:        "fluent-bit-logging",
			Path:        "helm/fluent-bit-logging",
			Type:        "dir",
			Description: "Lightweight log processor and forwarder for Kubernetes",
		},
		{
			Name:        "harbor-registry",
			Path:        "helm/harbor-registry",
			Type:        "dir",
			Description: "Enterprise container registry with vulnerability scanning and RBAC",
		},
		{
			Name:        "crossplane-infra",
			Path:        "helm/crossplane-infra",
			Type:        "dir",
			Description: "Infrastructure-as-code with Kubernetes-native resource provisioning",
		},
	}
}
