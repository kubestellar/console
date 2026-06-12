// Package handlers provides HTTP handlers for the console API.
package handlers

import (
	"encoding/json"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
)

const (
	// kubaraCatalogCacheTTL is how long a successful catalog fetch is cached
	// before re-fetching from GitHub. All users share a single cached copy
	// so only one upstream request is made per TTL window (#8487).
	kubaraCatalogCacheTTL = 10 * time.Minute

	// kubaraCatalogMaxResponseBytes caps the response body from the upstream
	// GitHub Contents API to prevent unbounded memory consumption.
	kubaraCatalogMaxResponseBytes = 5 * 1024 * 1024 // 5 MB

	// kubaraCatalogDefaultRepo is the fallback GitHub repo (owner/name) when
	// KUBARA_CATALOG_REPO is not set.
	kubaraCatalogDefaultRepo = "kubara-io/kubara"

	// kubaraCatalogDefaultPath is the fallback path inside the repo when
	// KUBARA_CATALOG_PATH is not set.
	kubaraCatalogDefaultPath = "go-binary/templates/embedded/managed-service-catalog/helm"

	// kubaraCatalogRepoMaxLen limits the length of the repository identifier
	kubaraCatalogRepoMaxLen = 256

	// kubaraCatalogPathMaxLen limits the length of the catalog path
	kubaraCatalogPathMaxLen = 256
)

// validateCatalogRepo validates a GitHub repo identifier (owner/name).
// Returns an error if the repo contains path traversal, control characters, or other dangerous patterns.
func validateCatalogRepo(repo string) error {
	if repo == "" {
		return fmt.Errorf("catalog repo cannot be empty")
	}
	if len(repo) > kubaraCatalogRepoMaxLen {
		return fmt.Errorf("catalog repo exceeds maximum length of %d", kubaraCatalogRepoMaxLen)
	}

	// Reject path traversal patterns
	if strings.Contains(repo, "..") {
		return fmt.Errorf("catalog repo contains path traversal sequence '..'")
	}
	if strings.Contains(repo, "//") {
		return fmt.Errorf("catalog repo contains double slash '//'")
	}

	// Reject newlines and control characters
	for _, r := range repo {
		if unicode.IsControl(r) {
			return fmt.Errorf("catalog repo contains control character")
		}
	}

	// Validate format: must be owner/name with alphanumeric, hyphen, underscore
	repoRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$`)
	if !repoRegex.MatchString(repo) {
		return fmt.Errorf("catalog repo format must be owner/name with alphanumeric, hyphen, underscore, or dot characters")
	}

	return nil
}

// validateCatalogPath validates a GitHub repository path.
// Returns an error if the path contains path traversal, control characters, or other dangerous patterns.
func validateCatalogPath(path string) error {
	if path == "" {
		return fmt.Errorf("catalog path cannot be empty")
	}
	if len(path) > kubaraCatalogPathMaxLen {
		return fmt.Errorf("catalog path exceeds maximum length of %d", kubaraCatalogPathMaxLen)
	}

	// Reject path traversal patterns
	if strings.Contains(path, "..") {
		return fmt.Errorf("catalog path contains path traversal sequence '..'")
	}
	if strings.Contains(path, "//") {
		return fmt.Errorf("catalog path contains double slash '//'")
	}

	// Reject newlines and control characters
	for _, r := range path {
		if unicode.IsControl(r) {
			return fmt.Errorf("catalog path contains control character")
		}
	}

	// Validate format: path segments separated by slashes, each segment alphanumeric with hyphen/underscore/dot
	pathRegex := regexp.MustCompile(`^[a-zA-Z0-9_.\-]+(/[a-zA-Z0-9_.\-]+)*$`)
	if !pathRegex.MatchString(path) {
		return fmt.Errorf("catalog path format must contain path segments with alphanumeric, hyphen, underscore, or dot characters")
	}

	return nil
}


type KubaraCatalogEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Type        string `json:"type"`
	Description string `json:"description,omitempty"`
}

// KubaraCatalogHandler serves the Kubara platform catalog with an in-process
// cache so that multiple users share a single upstream fetch (#8487).
// The upstream repo and path are configurable via KUBARA_CATALOG_REPO and
// KUBARA_CATALOG_PATH env vars, enabling private or self-hosted catalogs.
type KubaraCatalogHandler struct {
	githubToken string
	catalogRepo string // owner/name, e.g. "kubara-io/kubara" or "my-org/my-catalog"
	catalogPath string // path inside repo, e.g. "helm"
	httpClient  *http.Client

	mu       sync.RWMutex
	cache    []KubaraCatalogEntry
	cacheExp time.Time
}

// NewKubaraCatalogHandler creates a new handler for the Kubara catalog endpoint.
// catalogRepo is the GitHub owner/name (e.g. "kubara-io/kubara"); pass "" to use
// the default. catalogPath is the directory path inside the repo; pass "" for default.
// Returns an error if either catalogRepo or catalogPath fail validation.
func NewKubaraCatalogHandler(githubToken, catalogRepo, catalogPath string) (*KubaraCatalogHandler, error) {
	if catalogRepo == "" {
		catalogRepo = kubaraCatalogDefaultRepo
	}
	if catalogPath == "" {
		catalogPath = kubaraCatalogDefaultPath
	}

	// Validate inputs to prevent URL injection attacks
	if err := validateCatalogRepo(catalogRepo); err != nil {
		return nil, fmt.Errorf("invalid catalog repo: %w", err)
	}
	if err := validateCatalogPath(catalogPath); err != nil {
		return nil, fmt.Errorf("invalid catalog path: %w", err)
	}

	return &KubaraCatalogHandler{
		githubToken: githubToken,
		catalogRepo: catalogRepo,
		catalogPath: catalogPath,
		httpClient:  client.GitHub,
	}, nil
}

// GetConfig handles GET /api/kubara/config — returns the configured catalog
// repo and path so the frontend can construct per-chart URLs dynamically.
func (h *KubaraCatalogHandler) GetConfig(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"repo": h.catalogRepo,
		"path": h.catalogPath,
	})
}

// GetCatalog handles GET /api/kubara/catalog — returns the cached Kubara
// chart index, refreshing from upstream if the cache has expired.
func (h *KubaraCatalogHandler) GetCatalog(c *fiber.Ctx) error {
	// Demo mode: return static demo catalog immediately
	if IsDemoMode(c) {
		return c.JSON(fiber.Map{
			"entries": GetDemoKubaraCatalog(),
			"source":  "demo",
		})
	}

	// Check cache under a read lock first.
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

	// Fetch from upstream without holding the write lock so concurrent readers
	// are not serialized behind slow network I/O.
	entries, err := h.fetchUpstream(c.UserContext())
	if err != nil {
		slog.Error("[KubaraCatalog] upstream fetch failed", "error", err)

		// If we have a stale cache, serve it rather than failing.
		h.mu.RLock()
		staleEntries := h.cache
		h.mu.RUnlock()
		if staleEntries != nil {
			return c.JSON(fiber.Map{
				"entries": staleEntries,
				"source":  "stale-cache",
			})
		}

		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to fetch Kubara catalog",
		})
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	// Another goroutine may have refreshed while we were fetching.
	if h.cache != nil && time.Now().Before(h.cacheExp) {
		return c.JSON(fiber.Map{
			"entries": h.cache,
			"source":  "cache",
		})
	}

	h.cache = entries
	h.cacheExp = time.Now().Add(kubaraCatalogCacheTTL)

	return c.JSON(fiber.Map{
		"entries": entries,
		"source":  "upstream",
	})
}

// fetchUpstream calls the GitHub Contents API for the configured catalog repo.
func (h *KubaraCatalogHandler) fetchUpstream(ctx context.Context) ([]KubaraCatalogEntry, error) {
	upstreamURL := "https://api.github.com/repos/" + h.catalogRepo + "/contents/" + h.catalogPath
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL, nil)
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

// GetDemoKubaraCatalog returns realistic fixture data for demo mode (#8486).
func GetDemoKubaraCatalog() []KubaraCatalogEntry {
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
